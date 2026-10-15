# Integrated verification

This branch combines the current SignalDesk and FrictionLab workflows. The source checkout and both independent app branches remain preserved. No deployment was performed.

## Reproduce

```sh
npm ci
npm run lint
npm run typecheck
npm test
npm run build
npx playwright install chromium
npm run test:e2e
npm run test:e2e:prod
```

`test:e2e` starts and stops a local development server. `test:e2e:prod` requires `dist/`, starts its own loopback production fixture, checks CSP/cache headers and runs the same combined workflows. Each suite writes screenshots, actual downloads and JSON results to `.e2e-shots/` by default. Set `E2E_OUTPUT` to preserve independent runs; `E2E_BASE` targets an existing server. Browser resolution is `E2E_CHROME`, installed macOS Chrome, then Playwright Chromium. No browser download happens during the suite itself.

## Coverage

- Shared Home copy, provenance and limitations; keyboard skip link; same-session cross-app navigation; separate local storage; mobile routes; unknown-route recovery; runtime errors.
- Current FrictionLab cohort counts and denominators; keyboard stage selection; aggregate validation and failed import atomicity; event deduplication and ordered-window maturity; independent counts versus cohort conversion; small/zero cohorts; persistence recovery; scenario labeling; actual HTML brief and A4 PDF; responsive layouts.
- SignalDesk's full 18-group browser suite: evidence capture, validation, human verification, unknowns, stale/conflicting claims, explained qualification, drafts/review, persistence and stale tabs, backups, cited print/Markdown exports, responsive and keyboard behavior.
- The 285-test unit suite includes retained compatibility libraries plus the current deterministic FrictionLab workbench/brief/workspace and SignalDesk research models. A passing legacy test does not imply a retired screen is still part of the product.

Deeper independent Ego checks are reproducible with `node src/frictionlab/qa/run-browser.mjs` and `node scripts/qa/run-joint-browser.mjs`. Configure `FRICTIONLAB_BASE`/`FRICTIONLAB_QA_OUT` or `JOINT_BASE`/`JOINT_OUTPUT` to target a loopback fixture and save evidence. Set the corresponding `_SPACE` variable only when resuming an agent-owned Ego TaskSpace. The full FrictionLab suite has 45 checks; the independent joint suite has 18 checks, including byte-for-byte storage preservation during edits in each app and direct reloads with both stylesheets loaded.

## Limits

Local Chromium verification is not Safari/Firefox coverage, formal WCAG certification or a hosted CI run. Responsive checks include 390px phone and 1440px desktop. Both one-page sample PDFs were checked for page count and visually reviewed; arbitrary imported text can still need editorial shortening. FrictionLab guards dense briefs before export. SignalDesk records have bounded text lengths.

SignalDesk detects stale-tab edits; FrictionLab supports a single-tab workspace and can overwrite newer drafts across simultaneous tabs. No real customer data was imported. No network-based research fetch, paid API, outreach, GitHub issue creation, hosted deployment or commercial results were exercised or claimed.

The accompanying integration evidence report records the exact final run results and source commit. App-specific scope reports remain under `docs/signaldesk/` and `src/frictionlab/docs/`.
