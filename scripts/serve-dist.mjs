#!/usr/bin/env node
// Narrow static verification fixture: serves the production dist/ output on
// loopback only, with the declared production security headers and SPA
// fallback. This is a test fixture for exercising effective CSP and direct
// reload behavior, not a production service and not a runtime platform.
//
// Usage:
//   node scripts/serve-dist.mjs [--port 4173] [--serve-only]
//   test:e2e:prod starts this fixture on a free port and runs the e2e suite
//   against it with E2E_BASE (npm run test:e2e:prod).
import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

export const APP_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const DIST_ROOT = join(APP_ROOT, 'dist');

export const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'same-origin',
  'X-Frame-Options': 'DENY',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Content-Security-Policy':
    "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'none'; form-action 'none'",
};

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

/**
 * Resolve a request path to a serving decision without touching the network.
 * - Traversal outside distRoot is rejected (notfound), never served.
 * - /assets/* serves only real files (missing assets 404, never index HTML),
 *   so broken hashed references stay visible instead of masquerading as HTML.
 * - Three portfolio roots have static metadata; workspace routes use a neutral shell.
 */
export function resolveRequest(distRoot, urlPath) {
  let pathname;
  try {
    pathname = decodeURIComponent(urlPath.split('?')[0]);
  } catch {
    return { kind: 'notfound' };
  }
  if (pathname.includes('\0')) return { kind: 'notfound' };
  const root = resolve(distRoot);
  // resolve() normalizes; containment is verified AFTER, so dot segments
  // cannot launder a path back inside the publish directory.
  const fsPath = resolve(root, `.${sep}${pathname.replace(/^[/\\]+/, '')}`);
  if (fsPath !== root && !fsPath.startsWith(root + sep)) return { kind: 'notfound' };
  if (pathname === '/' || pathname === '/index.html') return { kind: 'index' };
  const routeDocument = { '/signaldesk': 'signaldesk.html', '/frictionlab': 'frictionlab.html' }[pathname.replace(/\/$/, '')];
  if (routeDocument && existsSync(join(root, routeDocument))) return { kind: 'file', fsPath: join(root, routeDocument) };
  if (pathname === '/assets/' || pathname.startsWith('/assets/')) {
    // Generated asset paths serve files, never index HTML: a missing hashed
    // reference stays a visible 404, and escaped paths were rejected above.
    if (existsSync(fsPath)) {
      try {
        if (statSync(fsPath).isFile()) return { kind: 'file', fsPath };
      } catch {
        return { kind: 'notfound' };
      }
    }
    return { kind: 'notfound' };
  }
  if (existsSync(fsPath)) {
    try {
      if (statSync(fsPath).isFile()) return { kind: 'file', fsPath };
    } catch {
      // fall through to SPA fallback
    }
  }
  return existsSync(join(root, 'app.html')) ? { kind: 'file', fsPath: join(root, 'app.html') } : { kind: 'index' };
}

export function headersFor(kind, fsPath) {
  const headers = { ...SECURITY_HEADERS };
  if (kind === 'index') {
    headers['Cache-Control'] = 'no-store';
    headers['Content-Type'] = MIME['.html'];
  } else if (kind === 'file') {
    headers['Content-Type'] = MIME[extname(fsPath)] || 'application/octet-stream';
    if (fsPath.includes(`${sep}assets${sep}`)) {
      headers['Cache-Control'] = 'public, max-age=31536000, immutable';
    } else {
      headers['Cache-Control'] = 'no-store';
    }
  }
  return headers;
}

export function startFixture({ port, distRoot = DIST_ROOT, host = '127.0.0.1' } = {}) {
  const server = createServer((req, res) => {
    const decision = resolveRequest(distRoot, req.url || '/');
    if (decision.kind === 'notfound') {
      res.writeHead(404, { ...SECURITY_HEADERS, 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found\n');
      return;
    }
    const fsPath = decision.kind === 'index' ? join(distRoot, 'index.html') : decision.fsPath;
    let body;
    try {
      body = readFileSync(fsPath);
    } catch {
      res.writeHead(404, { ...SECURITY_HEADERS, 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found\n');
      return;
    }
    res.writeHead(200, headersFor(decision.kind, fsPath));
    res.end(body);
  });
  return new Promise((resolvePromise, reject) => {
    server.on('error', reject);
    server.listen(port, host, () => resolvePromise(server));
  });
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  const portArg = process.argv.indexOf('--port');
  const port = portArg >= 0 ? Number(process.argv[portArg + 1]) : 4173;
  if (!existsSync(join(DIST_ROOT, 'index.html'))) {
    console.error(`dist/index.html not found. Run \`npm run build\` first.`);
    process.exit(2);
  }
  const server = await startFixture({ port });
  console.log(`dist fixture serving ${DIST_ROOT} at http://127.0.0.1:${port}/ (loopback only)`);
  if (!process.argv.includes('--serve-only')) {
    // Brief self-check, then exit: verifies headers + SPA fallback directly.
    const base = `http://127.0.0.1:${port}`;
    const failures = [];
    const check = async (path, wantStatus, wantHeaderMatch) => {
      const res = await fetch(`${base}${path}`);
      const csp = res.headers.get('content-security-policy') || '';
      if (res.status !== wantStatus) failures.push(`${path}: status ${res.status}, want ${wantStatus}`);
      if (wantHeaderMatch && !wantHeaderMatch.test(csp)) failures.push(`${path}: CSP mismatch: ${csp.slice(0, 120)}`);
    };
    try {
      await check('/', 200, /connect-src 'none'/);
      await check('/signaldesk/brief/res-stripe-com', 200, /form-action 'none'/);
      await check('/assets/does-not-exist.js', 404);
      // Raw socket: fetch() would normalize %2f before sending, so exercise
      // the fixture's own decoding with exact bytes on the wire.
      const rawStatus = await new Promise((resolvePromise) => {
        import('node:net').then(({ default: net }) => {
          const sock = net.connect(port, '127.0.0.1', () => {
            sock.write('GET /..%2f..%2fetc%2fpasswd HTTP/1.1\r\nHost: x\r\nConnection: close\r\n\r\n');
          });
          let data = '';
          sock.on('data', (d) => {
            data += String(d);
          });
          sock.on('close', () => resolvePromise(data.split(' ')[1] || 'no-status'));
          sock.on('error', () => resolvePromise('socket-error'));
          setTimeout(() => resolvePromise('timeout'), 5000);
        });
      });
      if (rawStatus !== '404') failures.push(`raw traversal probe: status ${rawStatus}, want 404`);
      const index = await (await fetch(`${base}/`)).text();
      if (!index.includes('id="root"')) failures.push('/ did not serve the app page');
    } catch (e) {
      failures.push(`self-check fetch failed: ${String((e && e.message) || e).slice(0, 160)}`);
    }
    server.close();
    if (failures.length > 0) {
      console.log(`FIXTURE-FAILED\n${failures.join('\n')}`);
      process.exit(1);
    }
    console.log('FIXTURE-OK');
  } else {
    await new Promise(() => undefined);
  }
}
