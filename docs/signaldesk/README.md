# SignalDesk — the research ledger

A local account-research workspace built to make judgment reviewable. Its complete flow is **company → evidence → qualification → analyst brief → cited print export**. Public examples are independent research on Firecrawl, Resend, and Exa, checked October 14, 2026. No employment, customer relationship, endorsement, private access, or successful outreach is claimed.

## Run this branch

Requires the repository's existing Node runtime (Node ^24 or >=26).

```sh
npm ci
npm run dev -- --host 127.0.0.1 --port 5182 --strictPort
```

Open `http://127.0.0.1:5182/signaldesk` directly. The independent SignalDesk branch left shared Home unchanged. On the integrated branch, Home and the root browser suites now describe both current apps; see `../INTEGRATION.md`.

For the production bundle with the repository's existing strict security headers:

```sh
npm run build
node scripts/serve-dist.mjs --port 5183 --serve-only
```

Open `http://127.0.0.1:5183/signaldesk`. This binds to loopback only and does not deploy anything.

## Three-minute walkthrough

1. Select **Firecrawl**. The account table retains the six-question matrix; the right panel keeps the brief in view. Click **NEED**: the plausible workflow is a hypothesis, so it earns no qualification credit.
2. Open **Qualification**. The explanation shows five supported questions out of five assessed, with one unknown. The assessed-only score is not a purchase probability. Follow a cited source to inspect the reasoning.
3. **Add company** with a name and bare domain. Nothing is inferred from the name. All six questions start unknown.
4. In **Import & backup**, paste a public URL, a short exact passage, and the narrow claim it supports. Preview before import. A URL alone creates an unknown research task; no page is fetched. JSON/CSV evidence files validate and preview with invalid records excluded. Text/Markdown files load into the capture form.
5. Return to **Evidence**, choose **Edit & verify**, open the source, set dates and stance, choose **Source checked**, and confirm the source matches. Only then can a fact affect qualification. A checked inference remains a hypothesis.
6. Edit **Analyst brief**. The likely customer and workflow problem are always visibly labeled hypotheses. Notes save as you type. Review the complete brief, then **Export brief**.
7. In print preview, choose **Print / Save PDF**. Use A4, 100% scale, and disable browser headers/footers. The tool warns and disables its print action if content exceeds one page; shorten the text or use the complete Markdown export. Download a workspace backup to retain all evidence.

Keyboard: `/` focuses account search, Tab reaches every control, Enter/Space activates buttons, account buttons support Up/Down, and Escape closes native dialogs. On mobile, **Workspace** opens navigation.

## Evidence and qualification contract

Each record stores a claim, exact excerpt, URL, source title, publication date when known, retrieval date, fact/inference/unknown kind, verification status, support/contrary/context stance, qualification question, and review note. Verification means matching the excerpt to its public source; company statements are attributed rather than independently audited.

The six questions are product fit, customer clarity, US context, timing signal, workflow need, and public route. They adapt the original six-column capability matrix to general startup account research. The previous fictional RelayWatch/webhook-vendor coverage heuristic cannot establish general commercial fit.

- A current verified factual support earns one supported question; an explicit current verified contrary fact earns a contrary question.
- Unknowns, inferences, unverified assertions, stale claims and conflicting questions earn no positive or negative assessment.
- Score on assessed questions = supported / (supported + contrary) × 100. Unknown coverage always appears beside it; no evidence means a null score, not zero.
- Four supported questions including US context yield “Worth investigating”. A contrary US context means “Outside target”. Conflicts take precedence, then stale evidence. This is a research-readiness heuristic, not purchase propensity, hiring probability, or personal job fit.
- Retrieval expires after 180 days, or 90 days for timing/public routes. A timing event published more than 90 days ago remains stale after a fresh retrieval. Evergreen product publications can remain current if checked recently.
- Opposing sourced fact claims, including an unchecked sourced counterclaim, block automatic resolution. A person must remove or neutralize the outdated claim with a note, or resolve the dispute.

The examples establish company/role geography and public commercial context. A company address or “Americas” remote label is not proof of an individual's role eligibility, seniority fit, authorization, or willingness to relocate. Confirm these before treating an account as an actionable job lead. No private job ledger was read or copied.

## Import formats

Evidence import JSON: an array of records or `{ "evidence": [...] }`. Camel-case fields and the CSV snake-case aliases are supported. Ordinary imports always reset verification to unverified, even if the file asserts otherwise.

CSV headers:

```text
criterion,claim,source_url,source_title,publication_date,retrieval_date,excerpt,kind,stance,note
```

`claim` and `criterion` headers are required. Dates use real YYYY-MM-DD dates or null/blank. Allowed criteria: `product`, `customer`, `geography`, `timing`, `workflow`, `access`. A downloadable template is built in. Quoted multiline CSV, CRLF, BOM, duplicate detection, row numbers, malformed records, unsupported URLs, future dates and bounds are tested. Evidence files are limited to 1 MB and 200 records per account.

Workspace backups are version 2 JSON with all accounts and their review declarations. Backups use compact JSON so the actual exported bytes match the 8 MB validated workspace limit. Restore validates and previews before explicit replacement. Maximum 100 accounts. Backups retain verification declarations; source matching should still be reviewed before sharing a backup received from elsewhere.

## Persistence and failure behavior

Research uses `sd-research-ledger-v2`; all legacy `sd-accounts-v1`, weights, criteria, and dataset values remain untouched. Legacy implementation and domain tests are preserved in `LegacySignalDeskApp.tsx` and existing modules. There is no automatic lossy migration from old embedded signals to verified evidence. The original saved value is recoverable from the backup panel when saved research is corrupt or version-invalid.

Edits reset analyst review. Source text changes reset source verification. Storage failures show a persistent warning and retain in-memory changes for backup. A stale-tab check prevents a normal second browser tab from overwriting a saved snapshot; the tab keeps its own edits for manual merge. Browser storage is not a transactional multiuser database or a durable cloud backup. Simultaneous independent contexts and manual localStorage modification are outside a transactional guarantee.

Imported text is rendered as React text; HTML, scripts and embedded instructions never run. The app does not pass source material to a model. Links must be full HTTP(S), without credentials or control characters. Markdown escapes embedded HTML and syntax. The production fixture uses the repository's existing restrictive CSP (`connect-src 'none'`); no network research runs from the app.

## Verification

```sh
npm test
npm run lint
npm run typecheck
npm run build
SD_BASE=http://127.0.0.1:5183 SD_OUTPUT=/absolute/path/to/qa-output node src/signaldesk/qa/browser.mjs
```

The browser suite uses installed Chrome on macOS; `SD_CHROME` selects another executable. It runs only local application actions. It covers desktop and 390px mobile layouts, company creation, URL tasks, hostile text, source verification, filters, keyboard navigation, persistence/reload, CSV quarantine, downloads, full backup restore, concurrent tabs, stale/conflicting claims, actual A4 PDF generation, long-export overflow, corrupt/quota storage, empty/missing accounts and a FrictionLab route smoke check.

The integrated branch updates the shared development/production browser suites for both current apps, while retaining this deeper SignalDesk-specific suite. No formal WCAG, Safari, Firefox, hosted CI or multiuser certification is claimed.

## Why this demonstrates operations and GTM judgment

The work sample turns scattered public material into a reproducible research record, separates what is known from what needs discovery, links qualification to evidence, and proposes a practical validation step rather than an unsupported sales claim. The import checks, review invalidation, stale-source rules, backup recovery and tested export show the operating discipline around the analysis. These are observable artifacts; no pipeline, conversion, revenue, or employer performance result is invented.
