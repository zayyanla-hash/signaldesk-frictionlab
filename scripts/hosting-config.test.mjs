import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SECURITY_HEADERS } from './serve-dist.mjs';

const ROOT = join(import.meta.dirname, '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const CSP = SECURITY_HEADERS['Content-Security-Policy'];

describe('hosting config consistency', () => {
  it('serves static portfolio roots before a neutral three-token SPA fallback', () => {
    const lines = read('public/_redirects').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
    expect(lines.map(line => line.split(/\s+/))).toEqual([
      ['/', '/index.html', '200'], ['/signaldesk', '/signaldesk.html', '200'],
      ['/frictionlab', '/frictionlab.html', '200'], ['/*', '/app.html', '200'],
    ]);
  });

  it('keeps redirects in exactly one Netlify source with matching CSP and cache policy', () => {
    const toml = read('netlify.toml');
    expect(toml).not.toMatch(/\[\[redirects\]\]/);
    expect(toml).toContain(CSP);
    expect(toml).toMatch(/for = "\/index\.html"[\s\S]*?Cache-Control\s*=\s*"no-store"/);
    expect(toml).toMatch(/for = "\/assets\/\*"[\s\S]*?immutable/);
    expect(CSP).toMatch(/connect-src 'none'/);
    expect(CSP).toMatch(/form-action 'none'/);
  });

  it('covers both app routes in vercel rewrites with the same CSP and cache policy', () => {
    const vercel = JSON.parse(read('vercel.json'));
    const destinations = Object.fromEntries(vercel.rewrites.map((r) => [r.source, r.destination]));
    expect(destinations['/']).toBe('/index.html');
    expect(destinations['/signaldesk/']).toBe('/signaldesk.html');
    expect(destinations['/frictionlab/']).toBe('/frictionlab.html');
    expect(destinations['/signaldesk']).toBe('/signaldesk.html');
    expect(destinations['/frictionlab']).toBe('/frictionlab.html');
    expect(destinations['/signaldesk/:path*']).toBe('/app.html');
    expect(destinations['/frictionlab/:path*']).toBe('/app.html');
    // Direct unknown URLs must reach the same recovery UI as client navigation.
    // Keep this fallback last so explicit app routes remain reviewable.
    expect(vercel.rewrites.at(-1)).toEqual({ source: '/((?!assets/).*)', destination: '/app.html' });
    const fallback = new RegExp(`^${vercel.rewrites.at(-1).source}$`);
    expect(fallback.test('/not-a-real-route')).toBe(true);
    expect(fallback.test('/assets/missing.js')).toBe(false);
    expect(vercel.headers[0].source).toBe('/(.*)');
    const flat = JSON.stringify(vercel.headers);
    expect(flat).toContain(CSP);
    expect(flat).toContain('no-store');
    expect(flat).toContain('immutable');
  });
});
