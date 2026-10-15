# SignalDesk + FrictionLab

Two local browser tools by Zayyan Latif, built with AI coding assistance to make analytical judgment inspectable. Product framing, evidence standards and review workflows are the work sample. No commercial traction, customer relationship or employment is implied.

- **SignalDesk** (`/signaldesk`): capture and verify public evidence, inspect six-question account qualification, separate facts from hypotheses and unknowns, and export a cited analyst brief. It opens on three independent public research examples: Firecrawl, Resend and Exa. Sources are attributed company claims, not proof of buying intent or personal job fit.
- **FrictionLab** (`/frictionlab`): declare grain and conversion window, validate a CSV, inspect compatible denominators and the largest observed loss, draft a measurable experiment, and export a one-page decision brief. Examples are synthetic. Independent event and user counts are ratios; cohort conversion requires compatible ordered cohorts.

No sign-in or paid API is needed. Imports and edits stay in browser storage; use synthetic or deidentified data. SignalDesk capture is assisted and manual: pasting a URL does not fetch or verify it. FrictionLab metrics are deterministic. A drop-off cannot establish its cause, and scenario upside is explicitly hypothetical.

## Run and verify

Requires Node ^24.0.0 or >=26.0.0.

```sh
npm ci
npm run dev
npm test
npm run lint
npm run typecheck
npm run build
npx playwright install chromium
npm run test:e2e
npm run test:e2e:prod
```

The root browser suites now exercise both current apps and Home against development and production fixtures. See [VERIFICATION.md](VERIFICATION.md) for scope and limitations, [WALKTHROUGH.md](WALKTHROUGH.md) for a combined demo, and each app's documentation below for full workflow QA.

## App documentation

- [SignalDesk guide, schemas and acceptance runner](docs/signaldesk/README.md)
- [SignalDesk verification](docs/signaldesk/VERIFICATION.md)
- [FrictionLab guide, schemas and acceptance runner](src/frictionlab/docs/README.md)
- [FrictionLab calculation fixtures](src/frictionlab/fixtures/)
- [Joint integration record](docs/INTEGRATION.md)

Current entry points are `src/signaldesk/ResearchWorkspace.tsx` and `src/frictionlab/FrictionLabApp.tsx`. Each app owns its styles and storage namespace. Older libraries remain for compatibility and their unit guards; they do not describe current screens. Shared Home lives in `src/App.tsx`. No dependency, lockfile, hosting or deployment configuration was changed for this integration.

The published portfolio and deployments predate this local integration. This branch has not been publicly deployed.

## Storage and exports

SignalDesk uses `sd-research-ledger-v2`, validates imports, supports full research backups, and detects stale-tab edits. FrictionLab uses `frictionlab-workbench-v2`, validates persisted state and supports one-tab local work; simultaneous tabs can overwrite newer FrictionLab drafts. Browser storage is device-specific and may be cleared. Keep exported briefs and backups.

SignalDesk exports Markdown and a cited print page. FrictionLab downloads a standalone HTML decision brief that can be printed to PDF. Exports retain evidence limitations and draft/review status; they are the portable sharing artifacts, while local account URLs require the same browser records.

## Stack and credits

React 19, Vite, TypeScript, React Router and scoped CSS. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for component, icon and font licenses. Built by Zayyan Latif with AI coding assistance; no AI-generated customer facts or metric estimates are required for the core workflows.
