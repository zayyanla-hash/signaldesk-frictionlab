import { describe, expect, it } from "vitest";
import { briefErrors, buildBrief, htmlEscape, limitations } from "./brief";
import { analyze, proposeExperiment } from "./workbench";
import { SYNTHETIC } from "./examples";
import {
  decodeWorkspace,
  freshWorkspace,
  loadWorkspace,
  WORKSPACE_KEY,
} from "./workspace";

describe("decision brief and experiment integrity", () => {
  const a = analyze(SYNTHETIC);
  const e = proposeExperiment(a);
  it("includes actual active data, formulas, denominators, observation window and limitations", () => {
    expect(briefErrors(e)).toEqual([]);
    const brief = buildBrief(SYNTHETIC, e);
    for (const expected of [
      "SYNTHETIC EXAMPLE",
      "55.0%",
      "72.7%",
      "40.0%",
      "550 / 1000",
      "400 / 550",
      "450 users",
      "7-day",
      "2025-04-01T00:00:00Z",
      "Hypothesis",
      "Audience",
      "Guardrail",
      "Decision rule",
      "Required instrumentation",
      "not a launch approval",
      "not an explanation",
    ])
      expect(brief).toContain(expected);
    expect(brief).not.toContain("additional final completions"); // scenario is not a forecast
    expect(brief).not.toContain("customer traction");
  });
  it("export tracks selected segment counts and proposed test audience", () => {
    const a = analyze(SYNTHETIC, "Mobile");
    const exp = proposeExperiment(a);
    const brief = buildBrief(SYNTHETIC, exp, "Mobile");
    expect(brief).toContain("25.0%");
    expect(brief).toContain("160 / 400");
    expect(brief).toContain("segment Mobile");
    expect(brief).not.toContain("550 / 1000");
  });
  it("refuses incomplete/oversized experiments and invalid data", () => {
    expect(() => buildBrief(SYNTHETIC, { ...e, guardrail: "" })).toThrow();
    expect(
      briefErrors({ ...e, decisionRule: "x".repeat(701) }).join(""),
    ).toContain("700");
    const oversized = Object.fromEntries(
      Object.entries(e).map(([k]) => [k, "x".repeat(500)]),
    ) as unknown as typeof e;
    expect(briefErrors(oversized).join("")).toContain("2,400");
    expect(() => buildBrief({ ...SYNTHETIC, csv: "broken" }, e)).toThrow();
  });
  it("refuses very dense printable text instead of cutting it or producing a multi-page brief", () => {
    const dense = Object.fromEntries(
      Object.keys(e).map((k, i) => [
        k,
        i % 2 === 0 ? "W".repeat(600) : "m".repeat(50),
      ]),
    ) as unknown as typeof e;
    expect(briefErrors(dense).join(" ")).toContain("print budget");
    expect(() => buildBrief(SYNTHETIC, dense)).toThrow();
  });
  it("escapes user-supplied HTML, scripts and external image markup in every field", () => {
    expect(htmlEscape("<script>\"&'</script>")).toBe(
      "&lt;script&gt;&quot;&amp;&#39;&lt;/script&gt;",
    );
    const malicious = '<img src="https://evil.test/pixel" onerror="alert(1)">';
    const brief = buildBrief(
      { ...SYNTHETIC, name: malicious },
      { ...e, hypothesis: malicious },
    );
    expect(brief).not.toContain("<img");
    expect(brief).not.toContain("<script>alert");
    expect(brief).toContain("&lt;img");
    expect((brief.match(/<script>/g) ?? []).length).toBe(1); // only local print control
  });
  it("independent counts export no conversion or causal prioritization claims", () => {
    const d = {
      ...SYNTHETIC,
      contract: { ...SYNTHETIC.contract, grain: "events" as const },
      csv: SYNTHETIC.csv.replace(/cohort_users/g, "events"),
    };
    const a = analyze(d);
    const brief = buildBrief(d, proposeExperiment(a));
    expect(brief).toContain("Final / entry ratio");
    expect(brief).toContain("Stage ratio");
    expect(brief).toContain(
      "No conversion, loss or binomial interval is inferred",
    );
    expect(brief).not.toContain("End-to-end conversion");
  });
  it("flags source completeness, synthetic provenance and causal limits", () => {
    const l = limitations(SYNTHETIC, a);
    expect(l).toContain("synthetic");
    expect(l).toContain("not verifiable");
    expect(l).toContain("not an explanation");
  });
});

describe("local workspace persistence", () => {
  it("roundtrips the active dataset, segment, experiment and target", () => {
    const w = freshWorkspace();
    w.segment = "Mobile";
    w.targetIndex = 2;
    w.experiment.hypothesis = "My specific hypothesis";
    expect(decodeWorkspace(JSON.stringify(w))).toEqual(w);
  });
  it("persists unfinished drafts but rejects wrong field types and corrupted datasets", () => {
    const w = freshWorkspace();
    w.experiment.hypothesis = "";
    expect(decodeWorkspace(JSON.stringify(w))!.experiment.hypothesis).toBe("");
    expect(
      decodeWorkspace(
        JSON.stringify({
          ...w,
          experiment: { ...w.experiment, guardrail: 42 },
        }),
      ),
    ).toBeNull();
    expect(
      decodeWorkspace(
        JSON.stringify({ ...w, dataset: { ...w.dataset, csv: "broken" } }),
      ),
    ).toBeNull();
    expect(
      decodeWorkspace(JSON.stringify({ ...w, segment: "invented" })),
    ).toBeNull();
    expect(
      decodeWorkspace(JSON.stringify({ ...w, targetIndex: 9 })),
    ).toBeNull();
    expect(decodeWorkspace("{broken")).toBeNull();
    expect(decodeWorkspace("null")).toBeNull();
    expect(decodeWorkspace(JSON.stringify({ ...w, version: 1 }))).toBeNull();
  });
  it("recovers corrupt state with an explicit notice and a labeled example", () => {
    const loaded = loadWorkspace({ getItem: () => "bad JSON" });
    expect(loaded.notice).toMatch(/damaged/);
    expect(loaded.workspace.dataset.provenance).toBe("synthetic");
  });
  it("handles unavailable storage without crashing or claiming a save", () => {
    const loaded = loadWorkspace({
      getItem: () => {
        throw new Error("SecurityError");
      },
    });
    expect(loaded.notice).toMatch(/unavailable/);
    expect(loaded.workspace).toEqual(freshWorkspace());
  });
  it("reads only its own versioned key", () => {
    const keys: string[] = [];
    loadWorkspace({
      getItem: (k) => {
        keys.push(k);
        return null;
      },
    });
    expect(keys).toEqual([WORKSPACE_KEY]);
  });
});
