# FrictionLab: an analytical work sample

This branch completes one flow: **declare a dataset → validate it → inspect conversion and source evidence → propose a measurable test → export a decision brief**. It keeps an ink top bar, a primary conversion reading and one connected funnel, with native stage buttons beneath it.

Built by Zayyan Latif with AI coding assistance. The work demonstrates product framing, explicit data contracts, deterministic analysis, evidence boundaries and experiment design. All built-in observations are synthetic. It claims neither commercial traction nor a completed experiment.

## Run this branch

Requires the repository's supported Node version (24 or 26+) and existing npm dependencies.

```sh
npm ci
npm run dev -- --host 127.0.0.1 --port 5193 --strictPort
```

Open `http://127.0.0.1:5193/frictionlab`. No backend, API key, paid API or external AI service is required. The browser stores this workspace under `frictionlab-workbench-v2`. The Clear local work control removes only that key. The older FrictionLab v1 and SignalDesk keys are untouched.

## What changed

- Imports replace the active dataset only after full validation and an explicit Apply action. They never append to the synthetic example or mix populations.
- Import requires a source type, grain, conversion window, signup/measurement interval and observation cutoff. Aggregate data also requires an explicit population/segment assertion.
- Ordered user cohorts receive step conversion, absolute losses, end-to-end conversion and conditional 95% Wilson intervals. Independent unique-user and event counts receive descriptive ratios. Neither receives user-loss, conversion or binomial uncertainty claims.
- Event cohorts use the earliest signup, a half-open signup interval, a complete observation window, strictly increasing stage timestamps, and an inclusive conversion deadline. Repeats collapse to one reached user. Immature users are excluded separately from sequence/window anomalies.
- Largest absolute loss is a transparent triage heuristic. Measurement anomalies supersede the friction recommendation; n<30 flags fragile transition evidence. No ranking establishes a cause or a statistically worse stage.
- Stage inspection shows exact source rows or user paths and definitions, then separates observations from untested explanations. Independent event logs expose source events rather than pretending to have cohort paths.
- The editable experiment includes hypothesis, allocation, intervention, primary denominator, guardrail, decision rule, instrumentation and an evidence plan. Descriptive/empty/unreliable inputs produce a measurement-readiness plan. No test is launched.
- Upside uses a hypothetical percentage-point improvement, holds downstream conversion fixed, and caps the changed transition at 100%. It is neither a forecast nor a measured lift and does not enter the brief.
- Export produces a standalone HTML decision brief with a Print / save as PDF action. Every user field is escaped. Required fields and a conservative print-density budget prevent incomplete or overlong exports. Text is never silently cropped.

## Schemas and fixtures

Read [CSV_SCHEMA.txt](CSV_SCHEMA.txt). Event CSV uses `event_id,user_id,stage,occurred_at` and optional `segment`. Aggregate CSV uses `cohort_id,stage,count,grain,window_days,cohort_start,cohort_end,observed_through` and optional `segment`.

The schemas deliberately use **user identity**. This version does not label account counts as user conversion. Legacy `account_id,event_name` imports require a verified mapping to actual `user_id,stage` records; simply renaming account IDs is not a valid migration. The earlier account-based workspace stays preserved under its own storage keys.

[`../fixtures/cases.json`](../fixtures/cases.json) records each fixture's contract and expected counts/errors. All CSV files are synthetic. Useful hand checks:

| Fixture | Expected result |
| --- | --- |
| `synthetic-aggregate.csv` | 1,000 → 550 → 400; losses 450 and 150; end-to-end 40%; Mobile 400 → 160 → 100 |
| `eight-user-events.csv`, 7 days | 7 → 5 → 3; one immature user; one repeated connection collapsed |
| Same event file, 3 days | 8 → 5 → 2; final event outside the shorter window is ignored and measurement review comes first |
| `zero-cohort.csv` | Conversion not estimable; no friction priority or upside |
| `zero-middle.csv` | First transition 0/100; next transition 0/0 is not estimable |
| `small-cohort.csv` | 8 → 3 → 1; wide interval and fragile lead |
| `non-monotonic-cohort.csv` | Rejected for impossible nested counts |
| `independent-events.csv` | 10 → 20 → 40 is allowed; ratios only, no conversion/loss claim |
| `duplicate-events.csv`, `invalid-timestamp.csv`, `missing-count.csv`, `missing-stage.csv`, `mixed-windows.csv`, `mixed-cohorts.csv` | Rejected atomically with errors |

The literal segment name `all` remains a valid segment and cannot collide with the pooled selector. `(unsegmented)` is a reserved display label; omit the segment column for an unsegmented dataset.

## Reproduce validation

```sh
npm test
npm run typecheck
npm run lint
npm run build
# FrictionLab-specific unit suites:
npm test -- src/frictionlab
# Production security-header fixture; keep this running for browser QA:
node scripts/serve-dist.mjs --port 4193 --serve-only
# In another terminal, with Ego Lite available:
FRICTIONLAB_BASE=http://127.0.0.1:4193 node src/frictionlab/qa/run-browser.mjs
```

The browser runner creates its own named TaskSpace, uses only the documented Ego API, saves screenshots, downloads the actual HTML brief, and writes a machine-readable check report under `.local/frictionlab-qa/`. It closes its TaskSpace on success. `FRICTIONLAB_QA_OUT` selects a different artifact folder; `FRICTIONLAB_SPACE` resumes a specifically authorized task space. No Browser plugin was listed in this session; rendered QA used the available Ego browser skill. No browser dependency was installed.

The shared root `scripts/e2e.mjs` still targets the retired FrictionLab interface, and is **not** this branch's UI acceptance suite. Its replacement/integration is coordinated separately so the parallel SignalDesk session can retain ownership. Legacy FrictionLab library tests remain for compatibility. The shared Home copy also describes the earlier FrictionLab workflow; updated copy was sent to the SignalDesk session for later integration. No shared file was changed on this branch.

## Statistical and product limits

Aggregate data cannot verify nested membership, identity deduplication, segment overlap, ordering, tracking coverage or causes. The analyst asserts those properties. Segmentation is restricted to complete, stable supplied groups. Different aggregate cohort IDs, grains and windows cannot be pooled.

Wilson intervals implement the [NIST score-interval method](https://www.itl.nist.gov/div898/handbook/prc/section2/prc241.htm) at two-sided 95%. They assume independent binomial observations. They do not measure tracking uncertainty, sampling bias or causal effects. Intervals on the synthetic example illustrate the method; they are not evidence about real customers. A complete cohort's observed fraction is exact for that supplied cohort; interval interpretation requires the stated repeated-sampling model.

The decision rule is a draft plan: a fresh baseline and a prospective power calculation are required before launch. This app does not estimate statistical significance between funnel stages, calculate experiment results or execute random assignment. A small-n warning is not a power calculation. Multi-user sync, real customer-data readiness and formal WCAG certification are outside the verified scope.

## Ownership and integration

Implementation is confined to `src/frictionlab/**`. Root config, dependencies, lockfile, shared libraries/components, SignalDesk, deployment configuration and public deployments are unchanged. The source checkout's existing untracked files were preserved. This branch is ready for review and integration, not deployed.

Local persistence has been verified for one editing tab, including reload, corrupt saved shapes and unavailable/full storage. Concurrent editing in multiple tabs uses last-write-wins local storage; conflict resolution and cross-device sync are not implemented. Use one editing tab for this work sample.
