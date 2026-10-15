import { afterAll, describe, expect, it } from 'vitest';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { headersFor, resolveRequest } from './serve-dist.mjs';

function makeDist() {
  const dir = join(import.meta.dirname, '.test-scratch-dist');
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(join(dir, 'assets'), { recursive: true });
  writeFileSync(join(dir, 'index.html'), '<div id="root"></div>', 'utf8');
  writeFileSync(join(dir, 'assets', 'app-abc123.js'), 'console.log(1)', 'utf8');
  return dir;
}

describe('dist fixture routing', () => {
  const dir = makeDist();
  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('serves the entry for routes and falls back for deep links', () => {
    expect(resolveRequest(dir, '/').kind).toBe('index');
    expect(resolveRequest(dir, '/signaldesk/brief/res-stripe-com').kind).toBe('index');
    expect(resolveRequest(dir, '/index.html').kind).toBe('index');
  });

  it('serves real files including hashed assets', () => {
    const r = resolveRequest(dir, '/assets/app-abc123.js');
    expect(r.kind).toBe('file');
  });

  it('serves route-specific initial metadata and a neutral workspace fallback', () => {
    writeFileSync(join(dir, 'signaldesk.html'), '<title>SignalDesk</title>');
    writeFileSync(join(dir, 'frictionlab.html'), '<title>FrictionLab</title>');
    writeFileSync(join(dir, 'app.html'), '<meta name="robots" content="noindex,follow">');
    for (const [route, file] of [['/signaldesk', 'signaldesk.html'], ['/signaldesk/', 'signaldesk.html'], ['/frictionlab', 'frictionlab.html'], ['/signaldesk/print/local-id', 'app.html'], ['/unknown', 'app.html']]) {
      expect(resolveRequest(dir, route)).toEqual({ kind: 'file', fsPath: join(dir, file) });
    }
  });

  it('never serves index HTML for missing assets', () => {
    expect(resolveRequest(dir, '/assets/missing.js').kind).toBe('notfound');
  });

  it('rejects traversal outside the publish directory', () => {
    expect(resolveRequest(dir, '/..%2f..%2fetc%2fpasswd').kind).toBe('notfound');
    expect(resolveRequest(dir, '/assets/../../package.json').kind).toBe('notfound');
    expect(resolveRequest(dir, '/%00etc').kind).toBe('notfound');
  });

  it('declares no-cache entry vs immutable assets plus CSP', () => {
    const index = headersFor('index', join(dir, 'index.html'));
    expect(index['Cache-Control']).toBe('no-store');
    expect(index['Content-Security-Policy']).toMatch(/connect-src 'none'/);
    expect(index['Content-Security-Policy']).toMatch(/form-action 'none'/);
    expect(index['X-Frame-Options']).toBe('DENY');
    const asset = headersFor('file', join(dir, 'assets', 'app-abc123.js'));
    expect(asset['Cache-Control']).toMatch(/immutable/);
    expect(asset['Content-Security-Policy']).toMatch(/script-src 'self'/);
  });
});
