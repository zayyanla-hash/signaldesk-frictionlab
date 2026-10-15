import type { Contract, Dataset } from "./workbench";
export const SAMPLE_CONTRACT: Contract = {
  source: "aggregate",
  grain: "cohort_users",
  windowDays: 7,
  cohortStart: "2025-04-01T00:00:00Z",
  cohortEnd: "2025-04-08T00:00:00Z",
  observedThrough: "2025-04-15T00:00:00Z",
  aggregateConfirmed: true,
};
export const AGGREGATE_HEADER =
  "cohort_id,segment,stage,count,grain,window_days,cohort_start,cohort_end,observed_through";
const row = (segment: string, stage: string, count: number) =>
  `example-apr01,${segment},${stage},${count},cohort_users,7,2025-04-01T00:00:00Z,2025-04-08T00:00:00Z,2025-04-15T00:00:00Z`;
export const SYNTHETIC_CSV = [
  AGGREGATE_HEADER,
  row("Desktop", "signed_up", 600),
  row("Desktop", "connected_data", 390),
  row("Desktop", "first_action", 300),
  row("Mobile", "signed_up", 400),
  row("Mobile", "connected_data", 160),
  row("Mobile", "first_action", 100),
].join("\n");
export const SYNTHETIC: Dataset = {
  name: "Synthetic onboarding · April 2025",
  provenance: "synthetic",
  csv: SYNTHETIC_CSV,
  contract: SAMPLE_CONTRACT,
};
export const EVENT_EXAMPLE = `event_id,user_id,stage,occurred_at,segment
A1,A,signed_up,2025-04-01T00:00:00Z,Desktop
A2,A,connected_data,2025-04-02T00:00:00Z,Desktop
A3,A,first_action,2025-04-03T00:00:00Z,Desktop
B1,B,signed_up,2025-04-01T00:00:00Z,Desktop
B2,B,connected_data,2025-04-02T00:00:00Z,Desktop
B3,B,first_action,2025-04-04T00:00:00Z,Desktop
C1,C,signed_up,2025-04-01T00:00:00Z,Mobile
C2,C,connected_data,2025-04-03T00:00:00Z,Mobile
C3,C,first_action,2025-04-08T00:00:00Z,Mobile
D1,D,signed_up,2025-04-01T00:00:00Z,Mobile
D2,D,connected_data,2025-04-02T00:00:00Z,Mobile
D3,D,connected_data,2025-04-03T00:00:00Z,Mobile
E1,E,signed_up,2025-04-01T00:00:00Z,Mobile
E2,E,connected_data,2025-04-02T00:00:00Z,Mobile
F1,F,signed_up,2025-04-01T00:00:00Z,Desktop
G1,G,signed_up,2025-04-01T00:00:00Z,Desktop
H1,H,signed_up,2025-04-08T12:00:00Z,Desktop`;
export const EVENT_CONTRACT: Contract = {
  ...SAMPLE_CONTRACT,
  source: "event_log",
  cohortEnd: "2025-04-09T00:00:00Z",
  aggregateConfirmed: false,
};
export const INVALID_CSV = `event_id,user_id,stage,occurred_at
same,A,signed_up,2025-04-01T00:00:00Z
same,A,connected_data,2025-04-02T00:00:00Z
bad,B,first_action,2025-02-30T00:00:00Z
missing,,signed_up,2025-04-01T00:00:00Z`;
export const SCHEMA_GUIDE = `FrictionLab CSV contract v2

Choose source, grain, cohort/measurement interval, observation cutoff, and conversion window before import. Import is atomic replacement; invalid input never changes the active analysis. No rows are silently dropped. Up to 1,000,000 characters and 19,999 data rows.

EVENT LOG
Required: event_id,user_id,stage,occurred_at
Optional: segment (one stable, disjoint assignment per user)
Stages: signed_up, connected_data, first_action
Timestamps: full ISO 8601 with explicit Z or +HH:MM, real calendar dates. No timestamps after observation cutoff.
IDs: event_id globally unique. Duplicate user/stage/timestamp combinations also require resolution. Distinct repeat events are allowed; unique/cohort modes deduplicate users, event mode counts repeats.

AGGREGATE
Required: cohort_id,stage,count,grain,window_days,cohort_start,cohort_end,observed_through
Optional: segment (disjoint exhaustive groups; never include totals alongside their parts)
One row per stage per segment. Include explicit 0; a missing count/stage is not zero. One cohort_id only. All contract columns must exactly match the selected grain and window (timestamps compare as instants). Count is an integer 0..1,000,000,000.
For cohort_users, assert that these are nested distinct users completing an ordered journey from the SAME signup cohort within window_days of signup. The whole cohort must be mature. Counts cannot verify this assertion.

GRAINS
cohort_users: ordered users with earliest signup in [cohort_start, cohort_end); include only signups with a complete window by observed_through. Each later stage must occur strictly after its prerequisite and at or before signup + window_days. Timestamp ties are excluded: ordering cannot be established. Repeated signups never restart the clock. Conversion = next-stage users / previous-stage users; loss = previous - next; end-to-end = final / first. Zero denominator = not estimable.
unique_users: independent distinct users at each stage within [cohort_start, cohort_end). No order or same-population guarantee; reach ratios only. Non-monotonic counts are allowed. No user-loss, binomial uncertainty or friction claims.
events: all event occurrences within [cohort_start, cohort_end); repeats count. Activity ratios only, possibly >100%. No user-conversion, user-loss or binomial uncertainty claims.
The conversion-window setting is recorded but is NOT applied to independent reach modes; their interval governs counting.

LIMITS
No identities in aggregates: cannot verify nesting, deduplicate, reconstruct paths or inspect causal evidence. All multi-segment aggregate inputs assert disjoint groups; overlap cannot be detected from counts. Cohort intervals are conditional 95% Wilson score intervals under an independent binomial model, not causal uncertainty or tracking-error bounds. Synthetic intervals illustrate the method, not real market evidence. Small n<30 is flagged as a heuristic, not a power calculation. Largest absolute loss is a prioritization heuristic with no claim that stages differ statistically. Missing events, selection bias, bots, identity merges and different audiences can distort results. No demographic or causal explanations are inferred.

Only local, non-sensitive synthetic or de-identified test data belongs in this work sample. Data and experiment drafts persist in this browser; use Clear local work to remove this workspace's saved data. No external AI/API is needed.
`;
