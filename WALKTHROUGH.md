# Walkthrough scripts (60-90 seconds each)

## SignalDesk (RelayWatch scenario)
1. Open `/signaldesk`. Researched investigation examples load with no login: twelve
   webhook vendors with checked documentation URLs. Sources document capabilities,
   not demand. Point to the score and its per-criterion points. (15s)
2. Note the excluded rows and the red badge reason. Open one. Exclusions beat scores
   and never enter the approved export. (15s)
3. Open a researched Account Brief. Read one sourced fact (with its link), one
   hypothesis, one unknown, and the next step. They are visually separate. (20s)
4. Switch the dataset to the synthetic sample. Open Northloop Systems, edit the
   outreach draft (approval returns to in-review), review, approve, open Markdown
   export, download it. (20s)
5. Open Target and Data. Change a weight, save, and show the ranking move. Paste the
   invalid CSV example and show the quarantine table with physical row numbers. (20s)

## FrictionLab
1. Open `/frictionlab`. The funnel loads with eligible vs incomplete counts and median
   time-to-value with its denominator. (15s)
2. Open Methodology and the quarantine table (with event/account units). Explain the
   7-day window, explicit timezones, and sequential ordering rules. (20s)
3. Open Evidence. Show one theme, its linked-message vs unique-account counts, and a
   linked source record. Point out the conflicting record and a weak-join flag. (20s)
4. Open Decision and Handoff. Select a problem, edit acceptance criteria (approval
   resets to draft), set Approved, download Markdown. Validate via the mock adapter
   twice to show failures stay failures; optionally run the labeled simulation. (25s)
5. Close: data is local (researched examples, synthetic sample, or your own imports);
   no login or external service was used. (10s)

# Draft resume bullets (implemented work only)

- Built two portfolio MVPs (React + Vite + TypeScript) with deterministic
  local analytics, schema-validated browser persistence, and validated CSV import/export.
- Implemented transparent heuristic account scoring with bounded 0-100 totals and hard
  exclusions; brief and approved-account CSV exports carry the active criteria,
  exclusion status, and per-signal provenance.
- Integrated a sourced research dataset (12 primary documentation URLs with
  retrieval/publication-date provenance) alongside a labeled synthetic sample.
- Implemented a fixed-window onboarding funnel (explicit-timezone UTC, 7-day
  eligibility, sequential ordering, unit-labeled quarantine) with hand-checkable
  fixtures and an automated test suite (run `npm test` for the current count) plus
  scripted browser workflows.
- Added a bounded GitHub issue handoff: approval-gated Markdown export, validation-only
  mock plus labeled simulation, and a fail-closed owner-run CLI (allowlist, canonical
  approval preamble, ownership checks, locked atomic receipts); live integration
  remains implemented but unverified, with no live writes for proof.
