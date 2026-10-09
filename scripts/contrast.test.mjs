import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Automated contrast scan over the design tokens (WCAG 2.1, normal text).
// An earlier contrast audit found --faint below 4.5 on surface/background and
// --green just below 4.5 on --green-bg. Active text must stay >= 4.5
// (disabled controls are exempt and use opacity instead).
function luminance(hex) {
  const parts = [0, 2, 4].map((i) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * parts[0] + 0.7152 * parts[1] + 0.0722 * parts[2];
}

function ratio(a, b) {
  const x = luminance(a);
  const y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

function readTokens() {
  const css = readFileSync(join(import.meta.dirname, '..', 'src', 'styles.css'), 'utf8');
  const root = css.match(/:root\s*{([^}]*)}/s)[1];
  const tokens = {};
  for (const m of root.matchAll(/--([\w-]+)\s*:\s*#([0-9a-fA-F]{6})/g)) {
    tokens[m[1]] = m[2].toLowerCase();
  }
  return tokens;
}

describe('design token contrast (normal text, >= 4.5)', () => {
  const t = readTokens();
  const pairs = [
    ['faint', 'surface'],
    ['faint', 'bg'],
    ['green', 'green-bg'],
    ['muted', 'surface'],
    ['text', 'bg'],
    ['primary', 'surface'],
  ];
  for (const [fg, bg] of pairs) {
    it(`${fg} on ${bg} passes`, () => {
      expect(t[fg], `token --${fg} missing`).toMatch(/^[0-9a-f]{6}$/);
      expect(t[bg], `token --${bg} missing`).toMatch(/^[0-9a-f]{6}$/);
      expect(ratio(t[fg], t[bg])).toBeGreaterThanOrEqual(4.5);
    });
  }
});
