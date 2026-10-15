import { describe, expect, it } from "vitest";
// @ts-expect-error Node-only test; the browser project intentionally has no @types/node dependency.
import { readFileSync } from "node:fs";
const css = readFileSync(new URL("./instrument.css", import.meta.url), "utf8");
const luminance = (hex: string) => {
  const c = hex
    .replace("#", "")
    .match(/../g)!
    .map((s) => parseInt(s, 16) / 255)
    .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return c[0] * 0.2126 + c[1] * 0.7152 + c[2] * 0.0722;
};
const contrast = (a: string, b: string) => {
  const x = luminance(a);
  const y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};
const token = (name: string) =>
  css.split(`--fi-${name}:`)[1].match(/#[0-9a-f]{6}/i)![0];
describe("instrument accessibility checks", () => {
  for (const [name, fg, bg] of [
    ["body ink on paper", token("ink"), token("paper")],
    ["muted text on paper", token("muted"), token("paper")],
    ["muted text on white", token("muted"), "#ffffff"],
    ["series links on white", token("series"), "#ffffff"],
    ["amber annotation on white", token("amber"), "#ffffff"],
    ["topbar text", token("ink"), "#ffffff"],
    ["topbar secondary text", "#53605b", "#ffffff"],
    ["notice text", "#3e5e4e", "#f0f6f2"],
    ["validation errors", "#8b442a", "#fcf2ec"],
    ["synthetic badge", "#526b58", "#f3f7f3"],
  ])
    it(`${name} has ≥4.5:1 contrast`, () =>
      expect(contrast(fg, bg)).toBeGreaterThanOrEqual(4.5));
  it("focus indicators meet ≥3:1 contrast on white", () =>
    expect(contrast(css.match(/outline: 3px solid (#[0-9a-f]{6})/i)![1], "#ffffff")).toBeGreaterThanOrEqual(3));
  it("declares reduced-motion and keyboard focus treatment in the scoped stylesheet", () => {
    expect(css).toContain("prefers-reduced-motion");
    // Responsive usability is checked in the browser at actual viewport widths,
    // rather than requiring a particular implementation breakpoint.
    expect(css).toContain(":focus-visible");
  });
});
