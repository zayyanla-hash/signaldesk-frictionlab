import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SECURITY_HEADERS } from './serve-dist.mjs';

const ROOT = join(import.meta.dirname, '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const CSP = SECURITY_HEADERS['Content-Security-Policy'];

describe('hosting config consistency', () => {
  it('serves a valid three-token SPA fallback from _redirects', () => {
    const lines = read('public/_redirects').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
    expect(lines).toHaveLength(1);
    expect(lines[0].split(/\s+/)).toEqual(['/*', '/index.html', '200']);
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
    expect(destinations['/signaldesk/:path*']).toBe('/index.html');
    expect(destinations['/frictionlab/:path*']).toBe('/index.html');
    // Direct unknown URLs must reach the same recovery UI as client navigation.
    // Keep this fallback last so explicit app routes remain reviewable.
    expect(vercel.rewrites.at(-1)).toEqual({ source: '/((?!assets/).*)', destination: '/index.html' });
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
