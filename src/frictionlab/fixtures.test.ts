import { describe, expect, it } from "vitest";
import cases from "./fixtures/cases.json";
import { analyze, type Contract } from "./workbench";
import { EVENT_EXAMPLE, SYNTHETIC_CSV } from "./examples";
const csvFiles = import.meta.glob("./fixtures/*.csv", {
  eager: true,
  query: "?raw",
  import: "default",
}) as Record<string, string>;
describe("reproducible on-disk CSV fixtures", () => {
  for (const fixture of cases)
    it(`${fixture.file} / ${fixture.contract.windowDays}-day ${fixture.contract.grain}`, () => {
      const csv = csvFiles[`./fixtures/${fixture.file}`];
      expect(csv).toBeTypeOf("string");
      const a = analyze({
        name: fixture.file,
        provenance: "synthetic",
        csv,
        contract: fixture.contract as Contract,
      });
      if (fixture.error) {
        expect(a.valid.ok).toBe(false);
        expect(a.valid.issues.map((i) => i.code)).toContain(fixture.error);
      } else {
        expect(a.valid.ok).toBe(true);
        expect(a.metrics.map((m) => m.count)).toEqual(fixture.counts);
        if (fixture.immature !== undefined)
          expect(a.excludedImmature).toBe(fixture.immature);
        if (fixture.repeats !== undefined)
          expect(a.repeats).toBe(fixture.repeats);
        if (fixture.ignored !== undefined)
          expect(a.ignoredSequence).toBe(fixture.ignored);
      }
    });
  it("the UI examples exactly match the downloadable source fixtures", () => {
    expect(csvFiles["./fixtures/synthetic-aggregate.csv"].trim()).toBe(
      SYNTHETIC_CSV,
    );
    expect(csvFiles["./fixtures/eight-user-events.csv"].trim()).toBe(
      EVENT_EXAMPLE,
    );
  });
});
