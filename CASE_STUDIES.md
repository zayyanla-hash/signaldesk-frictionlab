# Case studies
Author: Zayyan Latif. No invented users, interviews, or outcomes. No real customers.

## SignalDesk: which accounts deserve investigation?

- User and problem: a GTM hire needs to show how they would rank target accounts with
  evidence a reviewer can check, instead of a black-box score.
- Choices: two separate datasets (researched investigation examples as the default,
  pure-fiction synthetic sample one switch away); heuristic weights in plain code with
  per-criterion points shown and totals bounded 0-100; hard exclusions (headcount,
  industry, domain, evidence quality, existing customer) that override scores and never
  enter the approved export; fact vs hypothesis vs unknown vs next-step kept visually
  separate with per-signal provenance (source URL, published vs collected dates);
  strict CSV import validation with quarantine; review states gate exports; Markdown
  briefs carry the active criteria, exclusion status, and provenance.
- Non-goals: no live scraping, enrichment, outbound sending, LinkedIn automation,
  CRM sync, or campaign management. No inference of buying intent from API docs.
- Limitations: researched sources document webhook capabilities, not purchasing demand;
  all researched records start in review with unknown headcount/geography and a
  capability-based fit heuristic (share of 6 webhook capabilities confirmed documented
  in each vendor's own official docs, cited in `fitResearch.json`, retrieved 2026-10-08).
  Publication dates were not verified (shown Unknown). Headcount and buyer fit remain
  unestablished for every researched company.
- Proposed validation: give two sellers five blinded briefs and check whether their
  shortlist matches the ranking, then interview where the brief misled them.

## FrictionLab: where does onboarding break down?

- User and problem: a product hire needs to show funnel math a reviewer can recompute,
  linked to real-looking evidence and ending in a reviewable handoff.
- Choices: fixed snapshot and 7-day window in code; explicit-timezone timestamps with
  UTC normalization; sequential step ordering required; duplicates (post-validation),
  future events, malformed rows, out-of-order/outside-window/before-earliest, and
  unjoinable accounts quarantined with event/account units; incomplete-window accounts
  shown separately; median time-to-value labeled with its denominator; feedback.csv
  import with quarantine; feedback themes editable and linked to source records with
  missing-ID warnings and weak-join flags, including one conflicting record;
  approvals bound to content plus an evidence snapshot and invalidated by edits or
  upstream evidence changes; Markdown export plus validation-only mock and labeled
  simulation with clearable receipts.
- Non-goals: no auth, no server, no automatic external writes, no causal claims.
- Limitations: all events and feedback are synthetic from a seeded generator; no real
  user behavior is represented. GitHub live export is implemented but unverified
  (mock only in this session; no live writes for proof).
- Proposed validation: replay a known week of product events through the importer and
  compare funnel counts to the warehouse query; usability-test whether a reviewer can
  trace one issue from funnel to feedback to exported Markdown.
