#!/usr/bin/env node
// Production e2e: serves the real production bundle (dist/) through the
// loopback-only fixture with production headers, then runs the full e2e
// workflow against it. Verifies the shipped artifact, not just the dev server.
// Usage: npm run build && npm run test:e2e:prod
import { spawn } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Await child exit without hanging when it already exited. */
function waitExit(proc, timeoutMs) {
  if (proc.exitCode !== null) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(), timeoutMs);
    proc.on('exit', () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

function freePort() {  return new Promise((resolve) => {
    const s = net.createServer();
    s.listen(0, '127.0.0.1', () => {
      const port = s.address().port;
      s.close(() => resolve(port));
    });
  });
}

let failures = 0;
let fixture = null;
try {
  if (!existsSync(path.join(ROOT, 'dist', 'index.html'))) {
    console.log('FAIL - dist/index.html missing. Run `npm run build` first.');
    process.exit(1);
  }
  const port = await freePort();
  fixture = spawn('node', ['scripts/serve-dist.mjs', '--port', String(port), '--serve-only'], {
    cwd: ROOT,
    stdio: 'ignore',
  });
  fixture.on('error', (e) => console.log(`fixture spawn error: ${String(e.message || e).slice(0, 160)}`));
  const base = `http://127.0.0.1:${port}`;
  let up = false;
  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch(base);
      const text = res.ok ? await res.text() : '';
      if (res.ok && text.includes('id="root"')) {
        up = true;
        break;
      }
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  if (!up) {
    console.log('FAIL - dist fixture did not start');
    process.exit(1);
  }
  // CSP + cache headers on the production artifact, straight from the fixture.
  const rootRes = await fetch(base);
  const csp = rootRes.headers.get('content-security-policy') || '';
  const cache = rootRes.headers.get('cache-control') || '';
  console.log(`fixture headers: CSP[${csp.slice(0, 60)}...] cache[${cache}]`);
  if (!/connect-src 'none'/.test(csp) || !/form-action 'none'/.test(csp)) {
    console.log('FAIL - production CSP missing connect/form lockdown');
    failures++;
  }
  if (!/no-store/.test(cache)) {
    console.log('FAIL - index.html is not no-store');
    failures++;
  }
  // Hand off to the shared workflow suite against the production bundle.
  const child = spawn('node', ['scripts/e2e.mjs'], {
    cwd: ROOT,
    env: { ...process.env, E2E_BASE: base },
    stdio: 'inherit',
  });
  const code = await new Promise((resolve) => child.on('exit', (c) => resolve(c ?? 1)));
  if (code !== 0) failures++;
} catch (e) {
  failures++;
  console.log(`FAIL - e2e:prod aborted :: ${String((e && e.message) || e).slice(0, 200)}`);
} finally {
  if (fixture && fixture.exitCode === null) {
    fixture.kill('SIGTERM');
    await waitExit(fixture, 5000);
  }
  if (fixture && fixture.exitCode === null) {
    fixture.kill('SIGKILL');
    await waitExit(fixture, 5000);
  }
}

console.log(failures === 0 ? 'E2E-PROD-OK' : `E2E-PROD-FAILED (${failures})`);
process.exit(failures === 0 ? 0 : 1);
