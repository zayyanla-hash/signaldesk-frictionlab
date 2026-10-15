import { describe, expect, it } from "vitest";
import {
  analyze,
  DAY,
  describePriority,
  intervalLabel,
  pct,
  proposeExperiment,
  ratio,
  scenario,
  validateDataset,
  wilson,
  type Contract,
  type Dataset,
} from "./workbench";
import {
  EVENT_CONTRACT,
  EVENT_EXAMPLE,
  SAMPLE_CONTRACT,
  SYNTHETIC,
  SYNTHETIC_CSV,
} from "./examples";

function aggregate(
  counts: number[],
  patch: Partial<Contract> = {},
  segment = "",
): Dataset {
  const contract = { ...SAMPLE_CONTRACT, ...patch };
  const stages = ["signed_up", "connected_data", "first_action"];
  return {
    name: "Hand fixture",
    provenance: "synthetic",
    contract,
    csv: [
      "cohort_id,segment,stage,count,grain,window_days,cohort_start,cohort_end,observed_through",
      ...counts.map(
        (v, i) =>
          `hand,${segment},${stages[i]},${v},${contract.grain},${contract.windowDays},${contract.cohortStart},${contract.cohortEnd},${contract.observedThrough}`,
      ),
    ].join("\n"),
  };
}
const eventDataset = (
  csv = EVENT_EXAMPLE,
  patch: Partial<Contract> = {},
): Dataset => ({
  name: "Hand events",
  provenance: "synthetic",
  csv,
  contract: { ...EVENT_CONTRACT, ...patch },
});
const codes = (d: Dataset) => validateDataset(d).issues.map((i) => i.code);

describe("v2 deterministic funnel calculations", () => {
  it("hand checks 1000 → 550 → 400 without prematurely rounding", () => {
    const a = analyze(SYNTHETIC);
    expect(a.valid.ok).toBe(true);
    expect(a.metrics.map((m) => m.count)).toEqual([1000, 550, 400]);
    expect(a.metrics.map((m) => m.loss)).toEqual([null, 450, 150]);
    expect(a.metrics[1].rate).toBe(0.55);
    expect(a.metrics[2].rate).toBe(400 / 550);
    expect(a.overall).toBe(0.4);
    expect(a.biggest).toBe(1);
    expect(a.priority).toBe("investigate");
  });
  it("segments only on supplied disjoint groups, without mixing denominators", () => {
    const a = analyze(SYNTHETIC, "Mobile");
    expect(a.metrics.map((m) => m.count)).toEqual([400, 160, 100]);
    expect(a.overall).toBe(0.25);
    expect(a.metrics[1].denominator).toBe(400);
    expect(a.metrics[2].denominator).toBe(160);
    expect(analyze(SYNTHETIC, "Desktop").metrics.map((m) => m.count)).toEqual([
      600, 390, 300,
    ]);
  });
  it("zero denominators are not 0% conversion; no priority or scenario", () => {
    const a = analyze(aggregate([0, 0, 0]));
    expect(a.valid.ok).toBe(true);
    expect(a.overall).toBeNull();
    expect(a.metrics.every((m) => m.rate === null)).toBe(true);
    expect(a.overallInterval).toBeNull();
    expect(a.biggest).toBeNull();
    expect(a.priority).toBe("empty");
    expect(scenario(a, 1, 5)).toBeNull();
    expect(pct(null)).toBe("Not estimable");
  });
  it("a zero middle stage is 0/n, while downstream is not estimable", () => {
    const a = analyze(aggregate([100, 0, 0]));
    expect(a.overall).toBe(0);
    expect(a.metrics[1].rate).toBe(0);
    expect(a.metrics[2].rate).toBeNull();
    expect(a.metrics[1].interval![1]).toBeGreaterThan(0);
    expect(a.metrics[2].interval).toBeNull();
    expect(scenario(a, 1, 5)).toBeNull();
  });
  it("does not manufacture a biggest issue when no users are lost", () => {
    const a = analyze(aggregate([100, 100, 100]));
    expect(a.biggest).toBeNull();
    expect(describePriority(a)).toContain("No observed losses");
  });
  it("ranks absolute losses, not the largest loss percentage", () => {
    const a = analyze(aggregate([1000, 600, 300]));
    expect(a.metrics[1].loss).toBe(400);
    expect(a.metrics[2].loss).toBe(300);
    expect(a.biggest).toBe(1); // 40% beats 50% in absolute volume
  });
  it("breaks equal-loss ties deterministically toward the earlier stage", () => {
    expect(analyze(aggregate([100, 75, 50])).biggest).toBe(1);
  });
  it("flags a small denominator as a fragile lead", () => {
    const a = analyze(aggregate([8, 3, 1]));
    expect(a.priority).toBe("small");
    expect(describePriority(a)).toContain("Small transition sample");
    expect(
      a.metrics[1].interval![1] - a.metrics[1].interval![0],
    ).toBeGreaterThan(0.5);
  });
  it("independent events can exceed prior counts but never claim conversion, losses or uncertainty", () => {
    const a = analyze(aggregate([10, 20, 40], { grain: "events" }));
    expect(a.valid.ok).toBe(true);
    expect(a.overall).toBe(4);
    expect(a.metrics[1].rate).toBe(2);
    expect(a.metrics.every((m) => m.loss === null && m.interval === null)).toBe(
      true,
    );
    expect(a.overallInterval).toBeNull();
    expect(a.biggest).toBeNull();
    expect(a.priority).toBe("descriptive");
    expect(scenario(a, 1, 5)).toBeNull();
  });
  it("independent unique users are reach ratios even when counts happen to be monotonic", () => {
    const a = analyze(aggregate([100, 50, 20], { grain: "unique_users" }));
    expect(a.overall).toBe(0.2);
    expect(a.biggest).toBeNull();
    expect(a.metrics[1].loss).toBeNull();
    expect(a.overallInterval).toBeNull();
    expect(proposeExperiment(a).hypothesis).toContain("instrumentation");
  });
});

describe("segment selector integrity", () => {
  it("a literal segment named all is independent from the pooled view", () => {
    const d = { ...SYNTHETIC, csv: SYNTHETIC_CSV.replace(/Mobile/g, "all") };
    expect(analyze(d).metrics[0].count).toBe(1000);
    expect(analyze(d, "all").metrics.map((m) => m.count)).toEqual([
      400, 160, 100,
    ]);
  });
  it("unknown segments are rejected rather than silently producing an empty population", () => {
    const a = analyze(SYNTHETIC, "not-supplied");
    expect(a.valid.ok).toBe(false);
    expect(a.valid.issues.map((i) => i.code)).toContain("segment");
  });
});

describe("v2 atomic CSV validation", () => {
  it("rejects impossible nested counts, rather than clamping or changing the grain", () => {
    const d = aggregate([10, 11, 5]);
    expect(codes(d)).toContain("non-monotonic");
    expect(analyze(d).metrics.map((m) => m.count)).toEqual([0, 0, 0]);
  });
  it.each(["", "-1", "1.5", "NaN", "1000000001", "1e2"])(
    "rejects missing or impossible count %j",
    (value) => {
      const d = aggregate([100, 50, 10]);
      d.csv = d.csv.replace(",50,cohort_users", `,${value},cohort_users`);
      expect(codes(d)).toContain("count");
    },
  );
  it("requires every aggregate stage explicitly, including zero", () => {
    const d = aggregate([10, 5, 0]);
    d.csv = d.csv.split("\n").slice(0, -1).join("\n");
    expect(codes(d)).toContain("missing-stage");
  });
  it("rejects duplicate aggregate stage/segment rows", () => {
    const d = aggregate([10, 5, 1]);
    d.csv += `\n${d.csv.split("\n")[2]}`;
    expect(codes(d)).toContain("duplicate");
  });
  it("never pools different cohort IDs", () => {
    const d = aggregate([10, 5, 1]);
    d.csv = d.csv.replace("hand,,connected_data", "other,,connected_data");
    expect(codes(d)).toContain("cohort");
  });
  it("rejects different per-row grains, windows or cohort instants", () => {
    const d = aggregate([100, 50, 10]);
    for (const [from, to] of [
      [",50,cohort_users", ",50,events"],
      [",50,cohort_users,7", ",50,cohort_users,14"],
      ["2025-04-01T00:00:00Z", "2025-04-02T00:00:00Z"],
    ]) {
      expect(codes({ ...d, csv: d.csv.replace(from, to) })).toContain(
        "incompatible",
      );
    }
  });
  it("rejects an aggregate cohort without a fully elapsed conversion window", () => {
    expect(
      codes(aggregate([10, 5, 1], { observedThrough: "2025-04-14T23:59:59Z" })),
    ).toContain("immature-aggregate");
  });
  it("requires a cohort aggregate attestation; does not pretend to verify nesting", () => {
    expect(
      codes(aggregate([10, 5, 1], { aggregateConfirmed: false })),
    ).toContain("attestation");
  });
  it("rejects rolled-over dates, missing timezones, duplicate headers, malformed quoting and extra fields", () => {
    expect(
      codes(
        eventDataset(
          EVENT_EXAMPLE.replace("2025-04-01T00:00:00Z", "2025-02-30T00:00:00Z"),
        ),
      ),
    ).toContain("timestamp");
    expect(
      codes(
        eventDataset(
          EVENT_EXAMPLE.replace("2025-04-01T00:00:00Z", "2025-04-01T00:00:00"),
        ),
      ),
    ).toContain("timestamp");
    expect(
      codes(
        eventDataset(
          EVENT_EXAMPLE.replace("event_id,user_id", "event_id,event_id"),
        ),
      ),
    ).toContain("csv");
    expect(codes(eventDataset(EVENT_EXAMPLE + '\n"broken'))).toContain("csv");
    expect(
      codes(
        eventDataset(
          EVENT_EXAMPLE.replace("event_id,user_id", "accidental,user_id"),
        ),
      ),
    ).toContain("header");
  });
  it("duplicates block the whole import, including different IDs for the same event", () => {
    expect(
      codes(
        eventDataset(
          EVENT_EXAMPLE + "\nA1,A,signed_up,2025-04-01T00:00:00Z,Desktop",
        ),
      ),
    ).toContain("duplicate");
    expect(
      codes(
        eventDataset(
          EVENT_EXAMPLE + "\nother,A,signed_up,2025-04-01T00:00:00Z,Desktop",
        ),
      ),
    ).toContain("duplicate");
  });
  it("rejects missing user identity, absent global stages, missing signup and future events", () => {
    expect(
      codes(eventDataset(EVENT_EXAMPLE.replace("A1,A,", "A1,, "))),
    ).toContain("missing");
    expect(
      codes(
        eventDataset(
          EVENT_EXAMPLE.split("\n")
            .filter((l) => !l.includes(",first_action,"))
            .join("\n"),
        ),
      ),
    ).toContain("missing-stage");
    expect(
      codes(
        eventDataset(
          EVENT_EXAMPLE.split("\n")
            .filter((l) => !l.startsWith("A1,"))
            .join("\n"),
        ),
      ),
    ).toContain("missing-signup");
    expect(
      codes(
        eventDataset(
          EVENT_EXAMPLE.replace("2025-04-03T00:00:00Z", "2025-04-16T00:00:00Z"),
        ),
      ),
    ).toContain("future");
  });
  it("requires stable complete segments; no unknown segment silently enters totals", () => {
    expect(
      codes(
        eventDataset(
          EVENT_EXAMPLE.replace(
            "A2,A,connected_data,2025-04-02T00:00:00Z,Desktop",
            "A2,A,connected_data,2025-04-02T00:00:00Z,Mobile",
          ),
        ),
      ),
    ).toContain("segment");
    expect(
      codes({
        ...SYNTHETIC,
        csv: SYNTHETIC_CSV.replace(
          "example-apr01,Mobile,signed_up",
          "example-apr01,,signed_up",
        ),
      }),
    ).toContain("segment");
  });
  it("supports BOM, CRLF, quoted multiline values and physical CSV row reporting", () => {
    const d = {
      ...SYNTHETIC,
      csv: "\uFEFF" + SYNTHETIC_CSV.replace(/\n/g, "\r\n"),
    };
    expect(validateDataset(d).ok).toBe(true);
    const e = eventDataset(
      EVENT_EXAMPLE.replace("A1,A,", 'A1,"A\nline",')
        .replace("A2,A,", 'A2,"A\nline",')
        .replace("A3,A,", 'A3,"A\nline",'),
    );
    const v = validateDataset(e);
    expect(v.ok).toBe(true);
    expect(v.events[1].row).toBe(4);
  });
  it("rejects empty, over-limit and contract-less data rather than truncating", () => {
    expect(codes(eventDataset(""))).toContain("empty");
    expect(codes(eventDataset("x".repeat(1_000_001)))).toContain("csv");
    expect(codes(aggregate([10, 5, 1], { windowDays: 0 }))).toContain("window");
    expect(
      codes(aggregate([10, 5, 1], { grain: "" as Contract["grain"] })),
    ).toContain("grain");
    expect(
      codes(aggregate([10, 5, 1], { cohortEnd: SAMPLE_CONTRACT.cohortStart })),
    ).toContain("range");
  });
});

describe("v2 event cohort boundaries", () => {
  it("hand checks A–G: 7 signups, 5 connections, 3 actions; H immature and D repeated connection", () => {
    const a = analyze(eventDataset());
    expect(a.valid.ok).toBe(true);
    expect(a.metrics.map((m) => m.count)).toEqual([7, 5, 3]);
    expect(a.excludedImmature).toBe(1);
    expect(a.repeats).toBe(1);
    expect(a.ignoredSequence).toBe(0);
    expect(a.metrics[1].loss).toBe(2);
    expect(a.overall).toBe(3 / 7);
  });
  it("changing the conversion window recomputes eligibility and ordered completions", () => {
    const a = analyze(eventDataset(undefined, { windowDays: 3 }));
    expect(a.metrics.map((m) => m.count)).toEqual([8, 5, 2]);
    expect(a.excludedImmature).toBe(0);
    expect(a.ignoredSequence).toBe(1); // C action at day 7
    const b = analyze(
      eventDataset(undefined, {
        windowDays: 14,
        observedThrough: "2025-04-16T00:00:00Z",
      }),
    );
    expect(b.metrics.map((m) => m.count)).toEqual([7, 5, 3]);
  });
  it("includes exactly the deadline and excludes a second beyond it", () => {
    const onBoundary = analyze(eventDataset());
    expect(
      onBoundary.paths.find((p) => p.user === "C")!.times[2],
    ).not.toBeNull();
    const late = analyze(
      eventDataset(
        EVENT_EXAMPLE.replace(
          "C3,C,first_action,2025-04-08T00:00:00Z",
          "C3,C,first_action,2025-04-08T00:00:01Z",
        ),
      ),
    );
    expect(late.metrics[2].count).toBe(2);
    expect(late.ignoredSequence).toBe(1);
    expect(late.priority).toBe("measurement");
  });
  it("earliest signup anchors the clock; repeated signups do not restart it", () => {
    const d = eventDataset(
      EVENT_EXAMPLE + "\nA0,A,signed_up,2025-03-30T00:00:00Z,Desktop",
    );
    const a = analyze(d);
    expect(a.excludedOutside).toBe(1);
    expect(a.metrics[0].count).toBe(6);
  });
  it("cohort end is exclusive; maturity is inclusive at the exact observation deadline", () => {
    const a = analyze(
      eventDataset(undefined, { cohortEnd: "2025-04-08T00:00:00Z" }),
    );
    expect(a.excludedOutside).toBe(1);
    expect(a.excludedImmature).toBe(0);
    const b = analyze(
      eventDataset(undefined, { observedThrough: "2025-04-15T12:00:00Z" }),
    );
    expect(b.metrics[0].count).toBe(8);
    expect(Date.parse(b.paths[0].signup) + 7 * DAY).toBeLessThanOrEqual(
      Date.parse(EVENT_CONTRACT.observedThrough),
    );
  });
  it("excludes tied/out-of-order steps and flags measurement before experience claims", () => {
    const a = analyze(
      eventDataset(
        EVENT_EXAMPLE.replace(
          "A2,A,connected_data,2025-04-02T00:00:00Z",
          "A2,A,connected_data,2025-04-01T00:00:00Z",
        ),
      ),
    );
    expect(a.metrics.map((m) => m.count)).toEqual([7, 4, 2]);
    expect(a.ignoredSequence).toBe(2);
    expect(a.priority).toBe("measurement");
    expect(proposeExperiment(a).hypothesis).toContain("denominator");
  });
  it("normalizes timezone offsets as instants", () => {
    const d = eventDataset(
      EVENT_EXAMPLE.replace(/T00:00:00Z/g, "T02:00:00+02:00"),
    );
    expect(analyze(d).metrics).toEqual(analyze(eventDataset()).metrics);
  });
  it("independent event and unique modes have genuinely different denominators", () => {
    const events = analyze(eventDataset(undefined, { grain: "events" }));
    const users = analyze(eventDataset(undefined, { grain: "unique_users" }));
    expect(events.metrics.map((m) => m.count)).toEqual([8, 6, 3]);
    expect(users.metrics.map((m) => m.count)).toEqual([8, 5, 3]);
    expect(events.metrics[1].rate).toBe(6 / 8);
    expect(users.metrics[1].rate).toBe(5 / 8);
    expect(events.biggest).toBeNull();
    expect(users.biggest).toBeNull();
  });
});

describe("v2 uncertainty and scenario boundaries", () => {
  it("matches hand-calculated Wilson 4/10 ≈ [0.1682, 0.6873]", () => {
    const w = wilson(4, 10)!;
    expect(w[0]).toBeCloseTo(0.1681803297, 8);
    expect(w[1]).toBeCloseTo(0.6873262303, 8);
    expect(wilson(0, 0)).toBeNull();
    expect(wilson(11, 10)).toBeNull();
    expect(wilson(-1, 10)).toBeNull();
    expect(wilson(1, 1.5)).toBeNull();
    expect(intervalLabel(null)).toBe("Not estimable");
    expect(ratio(0, 0)).toBeNull();
  });
  it("never treats all-success or zero-success samples as certain", () => {
    expect(wilson(0, 5)![1]).toBeGreaterThan(0.4);
    expect(wilson(5, 5)![0]).toBeLessThan(0.6);
  });
  it("calculates hypothetical marginal upside using the unchanged downstream rate", () => {
    const a = analyze(SYNTHETIC);
    const s = scenario(a, 1, 5)!;
    expect(s.additionalAtStage).toBeCloseTo(50);
    expect(s.additionalFinal).toBeCloseTo((50 * 400) / 550);
    expect(s.projectedOverall).toBeCloseTo((400 + (50 * 400) / 550) / 1000);
    expect(scenario(a, 2, 5)!.additionalFinal).toBeCloseTo(27.5);
    expect(scenario(a, 1, 100)!.additionalAtStage).toBeCloseTo(450);
    expect(scenario(a, 1, -1)).toBeNull();
    expect(scenario(a, 1, NaN)).toBeNull();
  });
});
