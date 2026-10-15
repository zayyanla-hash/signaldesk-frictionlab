import { parseCSVTable } from "../lib/csv";
import { parseStrictTimestamp } from "../lib/datetime";

export const STAGES = ["signed_up", "connected_data", "first_action"] as const;
export type Stage = (typeof STAGES)[number];
export const LABELS: Record<Stage, string> = {
  signed_up: "Signed up",
  connected_data: "Connected data",
  first_action: "First useful action",
};
export type Grain = "cohort_users" | "unique_users" | "events";
export const GRAINS: Record<Grain, string> = {
  cohort_users: "Ordered user cohort",
  unique_users: "Independent unique users",
  events: "Event counts",
};
export interface Contract {
  source: "event_log" | "aggregate";
  grain: Grain;
  windowDays: number;
  cohortStart: string;
  cohortEnd: string;
  observedThrough: string;
  aggregateConfirmed: boolean;
}
export interface Dataset {
  name: string;
  provenance: "synthetic" | "imported";
  csv: string;
  contract: Contract;
}
export interface Issue {
  severity: "error" | "warning";
  code: string;
  message: string;
  row?: number;
}
export interface EventRow {
  event_id: string;
  user_id: string;
  stage: Stage;
  occurred_at: string;
  segment: string;
  row: number;
}
export interface AggregateRow {
  cohort_id: string;
  segment: string;
  stage: Stage;
  count: number;
  row: number;
}
export interface Validated {
  ok: boolean;
  issues: Issue[];
  events: EventRow[];
  aggregates: AggregateRow[];
  rows: number;
  segments: string[];
}
export interface UserPath {
  user: string;
  segment: string;
  signup: string;
  times: (string | null)[];
  mature: boolean;
}
export interface Metric {
  stage: Stage;
  count: number;
  denominator: number;
  rate: number | null;
  loss: number | null;
  interval: [number, number] | null;
}
export interface Analysis {
  valid: Validated;
  metrics: Metric[];
  paths: UserPath[];
  excludedImmature: number;
  excludedOutside: number;
  ignoredSequence: number;
  repeats: number;
  overall: number | null;
  overallInterval: [number, number] | null;
  biggest: number | null;
  priority: "descriptive" | "empty" | "measurement" | "small" | "investigate";
  segment: string;
  unit: string;
  windowDays: number;
}
export const DAY = 86_400_000;
export const MAX_INPUT = 1_000_000;
const validStage = (s: string): s is Stage =>
  (STAGES as readonly string[]).includes(s);
const key = (...parts: string[]) => JSON.stringify(parts);

export function validateDataset(dataset: Dataset): Validated {
  const issues: Issue[] = [];
  const add = (code: string, message: string, row?: number) =>
    issues.push({ severity: "error", code, message, row });
  const c = dataset.contract;
  const events: EventRow[] = [];
  const aggregates: AggregateRow[] = [];
  if (!dataset.name.trim() || dataset.name.length > 120)
    add("name", "Name the dataset using 1–120 characters.");
  if (!["synthetic", "imported"].includes(dataset.provenance))
    add("provenance", "Dataset origin must be synthetic or imported.");
  if (!["event_log", "aggregate"].includes(c.source))
    add("contract", "Choose event log or aggregate input.");
  if (!Object.prototype.hasOwnProperty.call(GRAINS, c.grain))
    add("grain", "Identify the data grain before analysis.");
  if (!Number.isInteger(c.windowDays) || c.windowDays < 1 || c.windowDays > 90)
    add(
      "window",
      "Conversion window must be a whole number from 1 to 90 days.",
    );
  const start = parseStrictTimestamp(c.cohortStart);
  const end = parseStrictTimestamp(c.cohortEnd);
  const asof = parseStrictTimestamp(c.observedThrough);
  for (const [label, t] of [
    ["Cohort start", start],
    ["Cohort end", end],
    ["Observed through", asof],
  ] as const) {
    if (!t.ok) add("timestamp", `${label}: ${t.error}`);
  }
  if (start.ok && end.ok && end.ms <= start.ms)
    add("range", "Cohort end must be after cohort start (end is exclusive).");
  if (end.ok && asof.ok && asof.ms < end.ms)
    add(
      "observation",
      "Observed-through timestamp must be at or after cohort end.",
    );
  if (c.source === "aggregate" && !c.aggregateConfirmed)
    add(
      "attestation",
      "Confirm that aggregate counts describe one population with disjoint, exhaustive segments. Ordered cohorts also require nested users with complete observation windows. Counts alone cannot verify these assumptions.",
    );
  if (c.source === "aggregate" && c.grain === "cohort_users") {
    if (end.ok && asof.ok && asof.ms < end.ms + c.windowDays * DAY)
      add(
        "immature-aggregate",
        "Aggregate cohort is not fully observed: observed-through must be at least cohort end plus the conversion window.",
      );
  }
  const parsed = parseCSVTable(dataset.csv);
  parsed.errors.forEach((message) => add("csv", message));
  const required =
    c.source === "event_log"
      ? ["event_id", "user_id", "stage", "occurred_at"]
      : [
          "cohort_id",
          "stage",
          "count",
          "grain",
          "window_days",
          "cohort_start",
          "cohort_end",
          "observed_through",
        ];
  const allowed = new Set([...required, "segment"]);
  required
    .filter((h) => !parsed.header.includes(h))
    .forEach((h) => add("header", `Missing column: ${h}.`));
  parsed.header
    .filter((h) => !allowed.has(h))
    .forEach((h) =>
      add(
        "header",
        `Unexpected column: ${h}. Use the documented schema; extra columns are not silently ignored.`,
      ),
    );
  if (parsed.rows.length === 0)
    add("empty", "No data rows. Provide a complete three-stage dataset.");
  const ids = new Set<string>();
  const natural = new Set<string>();
  const users = new Map<string, string>();
  const groups = new Map<string, Set<Stage>>();
  const cohorts = new Set<string>();
  const segments = new Set<string>();
  parsed.rows.forEach((r, i) => {
    const row = parsed.rowStarts[i];
    const segment = r.segment?.trim() || "(unsegmented)";
    if (r.segment?.trim() === "(unsegmented)")
      add(
        "segment",
        "The label (unsegmented) is reserved for missing segments. Use a distinct explicit segment name.",
        row,
      );
    const stage = r.stage?.trim();
    if (!validStage(stage ?? "")) {
      add(
        "stage",
        `Unknown or missing stage "${stage ?? ""}". Expected ${STAGES.join(", ")}.`,
        row,
      );
      return;
    }
    const s = stage as Stage;
    segments.add(segment);
    if (c.source === "event_log") {
      const id = r.event_id?.trim();
      const user = r.user_id?.trim();
      if (!id || !user || !r.occurred_at?.trim()) {
        add("missing", "event_id, user_id and occurred_at are required.", row);
        return;
      }
      if (id.length > 200 || user.length > 200 || segment.length > 120) {
        add(
          "length",
          "IDs must be at most 200 characters; segments at most 120.",
          row,
        );
        return;
      }
      if (ids.has(id))
        add(
          "duplicate",
          `Duplicate event_id "${id}". Remove duplicates before import.`,
          row,
        );
      ids.add(id);
      const t = parseStrictTimestamp(r.occurred_at);
      if (!t.ok) {
        add("timestamp", t.error, row);
        return;
      }
      if (asof.ok && t.ms > asof.ms)
        add(
          "future",
          "Event occurs after the declared observation cutoff.",
          row,
        );
      const nk = key(user, s, t.iso);
      if (natural.has(nk))
        add(
          "duplicate",
          "Duplicate user/stage/timestamp with a different ID. Resolve the ambiguous repeated event.",
          row,
        );
      natural.add(nk);
      if (users.has(user) && users.get(user) !== segment)
        add(
          "segment",
          `User "${user}" has incompatible segments. Segment must be stable across the user journey.`,
          row,
        );
      users.set(user, segment);
      events.push({
        event_id: id,
        user_id: user,
        stage: s,
        occurred_at: t.iso,
        segment,
        row,
      });
    } else {
      const cohort = r.cohort_id?.trim();
      if (!cohort || cohort.length > 200 || segment.length > 120)
        add(
          "cohort",
          "cohort_id is required (max 200 characters); segment max 120 characters.",
          row,
        );
      cohorts.add(cohort ?? "");
      if (
        !/^\d+$/.test(r.count?.trim() ?? "") ||
        !Number.isSafeInteger(Number(r.count)) ||
        Number(r.count) > 1_000_000_000
      )
        add(
          "count",
          "Count must be an explicit whole number between 0 and 1,000,000,000. Missing is not zero.",
          row,
        );
      if (r.grain !== c.grain || r.window_days !== String(c.windowDays))
        add(
          "incompatible",
          "Row grain or conversion window differs from the declared contract.",
          row,
        );
      for (const [column, expected] of [
        ["cohort_start", start],
        ["cohort_end", end],
        ["observed_through", asof],
      ] as const) {
        const t = parseStrictTimestamp(r[column] ?? "");
        if (!t.ok) add("timestamp", `${column}: ${t.error}`, row);
        else if (expected.ok && t.ms !== expected.ms)
          add(
            "incompatible",
            `${column} differs from the declared cohort.`,
            row,
          );
      }
      const g = key(cohort ?? "", segment);
      const seen = groups.get(g) ?? new Set<Stage>();
      if (seen.has(s))
        add(
          "duplicate",
          `Duplicate ${s} row for this cohort and segment.`,
          row,
        );
      seen.add(s);
      groups.set(g, seen);
      aggregates.push({
        cohort_id: cohort ?? "",
        segment,
        stage: s,
        count: Number(r.count),
        row,
      });
    }
  });
  if (segments.has("(unsegmented)") && segments.size > 1)
    add(
      "segment",
      "Some rows have no segment while others do. Supply a complete, disjoint segment assignment or remove the segment column.",
    );
  if (c.source === "aggregate") {
    if (cohorts.size > 1)
      add(
        "cohort",
        "Incompatible cohorts: import one cohort_id at a time. Different cohorts are never pooled.",
      );
    for (const [g, seen] of groups) {
      STAGES.filter((s) => !seen.has(s)).forEach((s) =>
        add(
          "missing-stage",
          `Missing stage ${s} for ${g}. Include an explicit count, including zero.`,
        ),
      );
    }
    if (c.grain === "cohort_users")
      for (const segment of segments) {
        const rs = STAGES.map((s) =>
          aggregates.find((r) => r.segment === segment && r.stage === s),
        );
        for (let i = 1; i < rs.length; i++)
          if (rs[i] && rs[i - 1] && rs[i]!.count > rs[i - 1]!.count)
            add(
              "non-monotonic",
              `Impossible nested cohort in ${segment}: ${STAGES[i]} exceeds its prerequisite.`,
              rs[i]!.row,
            );
      }
  } else {
    STAGES.filter((s) => !events.some((e) => e.stage === s)).forEach((s) =>
      add(
        "missing-stage",
        `No ${s} stage found. A missing stage cannot be assumed to mean zero conversion; check instrumentation/export coverage.`,
      ),
    );
    if (c.grain === "cohort_users") {
      const signed = new Set(
        events.filter((e) => e.stage === "signed_up").map((e) => e.user_id),
      );
      for (const [u] of users)
        if (!signed.has(u))
          add(
            "missing-signup",
            `User "${u}" has downstream events but no signup. Supply the cohort's complete signup history.`,
          );
    }
  }
  return {
    ok: !issues.some((i) => i.severity === "error"),
    issues,
    events,
    aggregates,
    rows: parsed.rows.length,
    segments: [...segments].sort(),
  };
}

/** Wilson score interval, two-sided 95%, conditional on a binomial sampling model. */
export function wilson(
  successes: number,
  total: number,
): [number, number] | null {
  if (
    !Number.isInteger(total) ||
    !Number.isInteger(successes) ||
    total <= 0 ||
    successes < 0 ||
    successes > total
  )
    return null;
  const z = 1.959963984540054;
  const z2 = z * z;
  const p = successes / total;
  const mid = (p + z2 / (2 * total)) / (1 + z2 / total);
  const half =
    (z * Math.sqrt((p * (1 - p)) / total + z2 / (4 * total * total))) /
    (1 + z2 / total);
  return [Math.max(0, mid - half), Math.min(1, mid + half)];
}
export function ratio(n: number, d: number): number | null {
  return d === 0 ? null : n / d;
}
export function pct(value: number | null, digits = 1): string {
  return value === null ? "Not estimable" : `${(value * 100).toFixed(digits)}%`;
}
export function intervalLabel(interval: [number, number] | null): string {
  return interval
    ? `${pct(interval[0], 0)}–${pct(interval[1], 0)}`
    : "Not estimable";
}

export function analyze(dataset: Dataset, segment = ""): Analysis {
  const valid = validateDataset(dataset);
  if (segment !== "" && !valid.segments.includes(segment)) {
    valid.ok = false;
    valid.issues.push({
      severity: "error",
      code: "segment",
      message: `Unknown segment "${segment}". No population was analyzed.`,
    });
  }
  const c = dataset.contract;
  const counts = [0, 0, 0];
  const paths: UserPath[] = [];
  let excludedImmature = 0;
  let excludedOutside = 0;
  let ignoredSequence = 0;
  let repeats = 0;
  const isCohort = c.grain === "cohort_users";
  if (valid.ok) {
    if (c.source === "aggregate") {
      for (const r of valid.aggregates)
        if (segment === "" || r.segment === segment)
          counts[STAGES.indexOf(r.stage)] += r.count;
    } else {
      const es = valid.events.filter(
        (e) => segment === "" || e.segment === segment,
      );
      const start = Date.parse(c.cohortStart);
      const end = Date.parse(c.cohortEnd);
      const cutoff = Date.parse(c.observedThrough);
      if (!isCohort) {
        STAGES.forEach((stage, i) => {
          const selected = es.filter(
            (e) =>
              e.stage === stage &&
              Date.parse(e.occurred_at) >= start &&
              Date.parse(e.occurred_at) < end,
          );
          counts[i] =
            c.grain === "events"
              ? selected.length
              : new Set(selected.map((e) => e.user_id)).size;
        });
      } else {
        const byUser = new Map<string, EventRow[]>();
        for (const e of es) {
          const list = byUser.get(e.user_id) ?? [];
          list.push(e);
          byUser.set(e.user_id, list);
        }
        for (const [user, list] of byUser) {
          list.sort(
            (a, b) => Date.parse(a.occurred_at) - Date.parse(b.occurred_at),
          );
          const signup = list.find((e) => e.stage === "signed_up")!;
          const t0 = Date.parse(signup.occurred_at);
          if (t0 < start || t0 >= end) {
            excludedOutside++;
            continue;
          }
          const mature = t0 + c.windowDays * DAY <= cutoff;
          const times: (string | null)[] = [signup.occurred_at, null, null];
          if (!mature) excludedImmature++;
          else {
            counts[0]++;
            let prev = t0;
            for (let i = 1; i < STAGES.length; i++) {
              const candidate = list.find(
                (e) =>
                  e.stage === STAGES[i] &&
                  Date.parse(e.occurred_at) > prev &&
                  Date.parse(e.occurred_at) <= t0 + c.windowDays * DAY,
              );
              if (!candidate) break;
              times[i] = candidate.occurred_at;
              prev = Date.parse(candidate.occurred_at);
              counts[i]++;
            }
            for (let i = 0; i < STAGES.length; i++) {
              const rows = list.filter((e) => e.stage === STAGES[i]);
              if (i === 0) repeats += Math.max(0, rows.length - 1);
              else
                for (const r of rows) {
                  const t = Date.parse(r.occurred_at);
                  const previous = times[i - 1];
                  if (
                    !previous ||
                    t <= Date.parse(previous) ||
                    t > t0 + c.windowDays * DAY
                  )
                    ignoredSequence++;
                  else if (r.occurred_at !== times[i]) repeats++;
                }
            }
          }
          paths.push({
            user,
            segment: signup.segment,
            signup: signup.occurred_at,
            times,
            mature,
          });
        }
      }
    }
  }
  const metrics = STAGES.map((stage, i) => ({
    stage,
    count: counts[i],
    denominator: i ? counts[i - 1] : counts[0],
    rate: ratio(counts[i], i ? counts[i - 1] : counts[0]),
    loss: isCohort && i > 0 ? counts[i - 1] - counts[i] : null,
    interval: isCohort && i > 0 ? wilson(counts[i], counts[i - 1]) : null,
  }));
  const biggest =
    !isCohort ||
    counts[0] === 0 ||
    Math.max(counts[0] - counts[1], counts[1] - counts[2]) === 0
      ? null
      : counts[0] - counts[1] >= counts[1] - counts[2]
        ? 1
        : 2;
  const priority = !isCohort
    ? "descriptive"
    : counts[0] === 0 || biggest === null
      ? "empty"
      : ignoredSequence > 0
        ? "measurement"
        : metrics[biggest].denominator < 30
          ? "small"
          : "investigate";
  return {
    valid,
    metrics,
    paths,
    excludedImmature,
    excludedOutside,
    ignoredSequence,
    repeats,
    overall: ratio(counts[2], counts[0]),
    overallInterval: isCohort ? wilson(counts[2], counts[0]) : null,
    biggest,
    priority,
    segment,
    unit: c.grain === "events" ? "events" : "users",
    windowDays: c.windowDays,
  };
}

export interface Experiment {
  hypothesis: string;
  audience: string;
  intervention: string;
  primaryMetric: string;
  guardrail: string;
  decisionRule: string;
  instrumentation: string;
  evidencePlan: string;
}
export const EXPERIMENT_LABELS: Record<keyof Experiment, string> = {
  hypothesis: "Hypothesis",
  audience: "Audience & allocation",
  intervention: "Intervention",
  primaryMetric: "Primary metric",
  guardrail: "Guardrail",
  decisionRule: "Decision rule",
  instrumentation: "Required instrumentation",
  evidencePlan: "Evidence to collect",
};
export function experimentErrors(e: Experiment): string[] {
  return (Object.keys(EXPERIMENT_LABELS) as (keyof Experiment)[]).flatMap(
    (k) =>
      !e[k]?.trim()
        ? [`${EXPERIMENT_LABELS[k]} is required.`]
        : e[k].length > 700
          ? [
              `${EXPERIMENT_LABELS[k]} must be at most 700 characters for a one-page brief.`,
            ]
          : [],
  );
}
export function proposeExperiment(
  a: Analysis,
  index = a.biggest ?? 1,
): Experiment {
  const i = index;
  const s = a.metrics[i];
  const prev = a.metrics[i - 1];
  const canTest = a.priority === "investigate" || a.priority === "small";
  return {
    hypothesis: canTest
      ? `Untested: clearer guidance at ${LABELS[s.stage].toLowerCase()} may help users complete this step. The funnel does not establish a cause.`
      : "Untested: denominator and instrumentation checks can establish a trustworthy ordered user baseline before an intervention is tested.",
    audience: canTest
      ? `New eligible users reaching ${LABELS[prev.stage].toLowerCase()}${a.segment === "" ? "" : ` in segment ${a.segment}`}; randomize users 50/50 before showing the intervention; sticky assignment.`
      : "A fresh signup cohort; assign stable user IDs and record the full ordered journey. No treatment rollout yet.",
    intervention: canTest
      ? `Control: current experience. Treatment: one contextual next-step prompt at ${LABELS[prev.stage].toLowerCase()}. Validate the suspected guidance gap with usability observation first.`
      : "Run an instrumentation audit and reconcile raw events against an independent count before designing a treatment.",
    primaryMetric: canTest
      ? `Unique assigned users completing ${s.stage} within ${a.windowDays} days of signup / all assigned eligible users reaching ${prev.stage}; intention-to-treat. Window is anchored to signup, not assignment.`
      : "Reconciled ordered user counts, explicit cohort membership, and complete observation windows; no conversion lift claim.",
    guardrail: canTest
      ? "Setup-error rate per assigned user: treatment minus control must have a 95% interval upper bound below +1 percentage point; verify error coverage first."
      : "Audit 100 controlled test journeys. Stop baseline acceptance if any journey has an unexplained missing stage, identity mismatch or timestamp discrepancy.",
    decisionRule: canTest
      ? "Before launch, size a two-sided 5% test for +5 percentage points at 80% power using a fresh baseline. Run at least two full weekly cycles, then wait for all conversion windows. Ship only if the lift interval excludes 0, point lift is ≥5 pp, and the guardrail passes. Otherwise inconclusive or reject; no peeking."
      : `Accept a baseline only after 100 controlled journeys reconcile exactly and a fresh signup cohort has a complete ${a.windowDays}-day observation window. Resolve all unexplained discrepancies. Then pre-register and power a randomized intervention; do not infer lift from this audit.`,
    instrumentation:
      "user_id, eligibility, experiment_id, variant, assigned_at, exposure_at, signed_up, connected_data, first_action, error events and explicit UTC timestamps. Audit missing events, identity merges, repeat exposures and sample-ratio mismatch.",
    evidencePlan:
      "Review consented usability sessions and error logs for this stage; label observations separately from explanations. Current dataset contains no behavioral interviews or causal evidence.",
  };
}
export interface Scenario {
  improvementPP: number;
  additionalAtStage: number;
  additionalFinal: number;
  projectedOverall: number;
}
export function scenario(
  a: Analysis,
  index: number,
  improvementPP: number,
): Scenario | null {
  if (
    !a.valid.ok ||
    a.ignoredSequence > 0 ||
    !Number.isInteger(index) ||
    a.metrics[index]?.loss === null ||
    index < 1 ||
    index > 2 ||
    !Number.isFinite(improvementPP) ||
    improvementPP < 0 ||
    improvementPP > 100
  )
    return null;
  const s = a.metrics[index];
  const base = a.metrics[0].count;
  if (s.rate === null || !base || !s.denominator) return null;
  const added = s.denominator * Math.min(improvementPP / 100, 1 - s.rate);
  const downstream = index === 2 ? 1 : ratio(a.metrics[2].count, s.count);
  if (downstream === null) return null;
  const additionalFinal = added * downstream;
  return {
    improvementPP,
    additionalAtStage: added,
    additionalFinal,
    projectedOverall: (a.metrics[2].count + additionalFinal) / base,
  };
}

export function describePriority(a: Analysis): string {
  if (!a.valid.ok) return "Analysis blocked by validation errors.";
  if (a.priority === "descriptive")
    return "Descriptive reach only. Independent stage counts do not identify user drop-off or a credible friction point.";
  if (a.priority === "empty")
    return a.metrics[0].count
      ? "No observed losses between stages. Check measurement coverage before concluding there is no friction."
      : "No mature eligible users. Conversion and friction are not estimable.";
  const s = a.metrics[a.biggest!];
  const p = a.metrics[a.biggest! - 1];
  const msg = `${LABELS[p.stage]} → ${LABELS[s.stage]}: ${s.loss!.toLocaleString("en-US")} users did not complete the next ordered step (${pct(1 - s.rate!)} of ${s.denominator.toLocaleString("en-US")}).`;
  if (a.priority === "measurement")
    return `${msg} Measurement review comes first: out-of-order or outside-window events were excluded.`;
  if (a.priority === "small")
    return `${msg} Small transition sample (n < 30); this is a fragile lead, not a firm priority.`;
  return `${msg} Largest absolute observed loss; investigate first. This ranking does not prove a cause or a statistically worse stage.`;
}
