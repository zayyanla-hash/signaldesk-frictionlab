# SignalDesk Session 2 — research ledger

Authorized scope: SignalDesk only; no deployment, outreach, Docket changes, shared configuration or dependencies. Baseline origin/main 942d237. Original dirty untracked files are untouched.

## Design and implementation

Keep the existing restrained paper sidebar, ledger table, six-column matrix and persistent brief. Replace opaque embedded signals with explicit evidence records. The six matrix questions become product, customer, US eligibility, timing, workflow need and access: these are useful for general startup account research rather than only webhook vendors. Each has a claim, source, excerpt, dates, verification and supporting/contradicting stance. Inference never earns qualification credit. Missing, stale and conflicting evidence remain unknown or blocked. A documented capability is never buying intent.

Use a separate versioned browser store; preserve old account storage and legacy domain tests. Assisted import accepts URL tasks, pasted text, JSON and CSV, previews all records, reports invalid rows, defaults imports to unverified, and never executes source content. No external services or network calls are required. Evidence edits reset reviewed status. Brief fields are editable analyst hypotheses; cited fact sections derive from current evidence. Print view uses ordinary React text rendering and a one-page curated brief, with explicit overflow detection and full research backup export.

## Verification

Baseline suite; parsing and validation tests; missing/stale/conflicting qualification; persistence corrupt/quota/versions; escaped exports and citations; production build, lint and typecheck. Browser workflow at 1440×1000 and 390×844: account creation, URL task, pasted evidence, edit, verification, filtering, keyboard, reload, backup round-trip, print, empty/error states. Inspect generated PDF page count, text and rasterized page. Smoke-check FrictionLab without editing it.

## Alternatives rejected

A live browser scraper would require proxies or unreliable CORS. AI-generated research would overstate provenance. Keep capture assisted and human-reviewed. A full shared app rewrite would collide with the concurrent FrictionLab session. Retain the old implementation as a compatibility module and mount the new workspace through the SignalDesk entry only.
