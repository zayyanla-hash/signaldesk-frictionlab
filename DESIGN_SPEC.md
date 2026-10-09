# Frontend design specification

Goal: SignalDesk and FrictionLab should read as credible B2B SaaS products with distinct identities, built on
professionally designed components rather than invented layouts. All product logic, demo data, persistence,
provenance labels and exports stay exactly as they are; this is a presentation-layer change.

## Foundation

- Components: shadcn/ui as packaged in [shadcn-admin](https://github.com/satnaing/shadcn-admin) (MIT), copied
  into `src/components/ui` and `src/components/data-table`. Tailwind v4 via `@tailwindcss/vite`, Radix primitives,
  TanStack Table v8.
- Tokens: `src/index.css`. Each product sets `--ui-*` variables on its root element (`.theme-signaldesk`,
  `.theme-frictionlab`); Tailwind colors (`bg-background`, `text-muted-foreground`, `border-border`, ...) resolve
  through them. The old hand-written CSS lives in a lower cascade layer (`legacy`) so converted screens always win.
- Type: Inter for UI, Geist Mono only for IDs, CSV schemas and code. Tabular numerals for every number.
- Not allowed: KPI-card grids as decoration, gradients, large radii, decorative icons, glow or status dots,
  hero sections inside products, animation beyond Radix defaults.
- Rollout: one flagship screen per product first (SignalDesk Opportunities, FrictionLab Funnel), review, then the
  remaining screens.

## Shared shell

Each product has its own application chrome, not a shared portfolio sidebar. A small "Portfolio" link returns
home. The portfolio home is a plain index page.

## SignalDesk: research workspace (reference: Attio)

Identity: warm white `#fdfcfb`, gray hairlines `#ebe9e5`, charcoal text, one dark-blue accent `#1e3a8a`.
Dense, quiet, record-centric. Should feel like a CRM a revenue operations team lives in.

| Screen | Reference | Components | Pattern |
|---|---|---|---|
| Shell | Attio workspace sidebar | `sidebar`-style nav built from `button`, `separator` | Workspace block ("RelayWatch GTM"), nav: Opportunities, Account briefs, Target and data; record counts right-aligned in nav |
| Opportunities (flagship) | Attio list view, shadcn-admin `tasks` data table | `table`, `data-table/toolbar`, `column-header`, `faceted-filter`, `badge`, `sheet` | Full-width table with sticky header, 36px rows, sortable columns: account (favicon-style initial + name + domain), score with inline bar and breakdown on hover, evidence quality, signals, status, last reviewed. Toolbar: search, industry and status facets, dataset switch, hide excluded. Clicking a row opens a right `sheet` record panel: score explanation, evidence list with sources, link to the full brief |
| Account brief | Attio record page | `card`-less document layout, `tabs`, `badge`, `textarea`, `button` | Two columns: main document (summary, facts, hypotheses, unknowns, next steps, buyer hypothesis, reasons not to pursue, discovery question, editable outreach) and a 320px right rail (sources with retrieval dates, evidence quality, review state and actions, export) |
| Target and data | Attio settings pages | `label`, `input`, `select`, `textarea`, `button`, `separator` | Settings-style sections with left description column and right form; weights as a compact table; import and export as their own sections |

## FrictionLab: diagnostics and triage (reference: PostHog funnels + Linear triage)

Identity: cool gray canvas `#f7f8fa`, white panels, crisp borders `#e3e6ea`, near-black text. Amber `#d97706`
marks friction (largest drop-off, unresolved evidence); red only for severity. Color always carries meaning.

| Screen | Reference | Components | Pattern |
|---|---|---|---|
| Shell | Linear sidebar | nav built from `button`, `separator` | Compact sidebar: "Onboarding" project, nav: Funnel, Evidence, Decision; counts for themes and items needing review |
| Funnel (flagship) | PostHog funnel insight | `card`, `table`, `badge`, `tooltip` | Insight header (title, date window, cohort definition chips). Large step-bar chart: one vertical bar per step with converted (solid) and dropped (hatched amber on the worst step) segments, conversion % and counts under each step, drop-off callouts between steps. Below: steps table (step, entered, converted, dropped, conversion, median time) then methodology and data-quality panels (incomplete window, quarantine table) |
| Evidence | Linear triage list | `table`, `badge`, `sheet`, `textarea`, `select` | List of themes as triage rows (status, title, linked accounts, messages); selecting a theme opens a detail pane with linked feedback records and funnel step, edit and review actions |
| Decision and handoff | Linear issue page | `textarea`, `input`, `badge`, `button`, `separator` | Issue-brief layout: title, properties rail (status, severity, affected accounts, evidence count, review state), body fields; handoff panel clearly labeled mock with Markdown export |

## Verification

Desktop 1440px and mobile 390px screenshots of every screen, zero horizontal overflow, `npm run lint`,
`typecheck`, `test`, `build`, `test:e2e`, `test:e2e:prod` all passing, and the existing accessibility checks
(skip link, focus, labels) still green.
