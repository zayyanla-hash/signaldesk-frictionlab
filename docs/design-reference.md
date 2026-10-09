# Design reference notes

My working notes from studying Mercury's public demo (https://demo.mercury.com) as a
visual and interaction reference for the product system used across this repo's
Home page, SignalDesk, and FrictionLab. Measured with `getComputedStyle` on
1440x900, light color scheme. Mercury is a reference only — no Mercury code,
fonts, logos, or other assets ship here, and there is no affiliation with Mercury.

## Measured foundations

| Token | Mercury (observed) | Ours |
|---|---|---|
| UI font | Arcadia Text, proprietary | DM Sans Variable (OFL-1.1) |
| Display font | Arcadia Display | DM Sans Variable |
| Body size and weight | 16px / 360 | 15px / 380 |
| Page title | 28px / 380, not bold | 28px / 400 |
| Ink | rgb(30,30,42) `#1E1E2A` | `#1E1E2A` |
| Filter chip | 32px tall, 13.3px / 360, hairline outline | same |
| Table row | 51px, no gridlines, header row 40px | 52px rows, header 40px |
| Sidebar | light gray canvas, no border, active item as a filled pill | same pattern |

Overall weight is light. Hierarchy comes from size and muted color, almost never
from bold. That is the single biggest difference from earlier passes, which
leaned on 600 to 700 weights everywhere.

## Pattern map

| Mercury reference | Observed pattern | SignalDesk | FrictionLab |
|---|---|---|---|
| Transactions (demo.mercury.com/transactions) | Title, then one row of outline chips (Saved views, Filters, Date, Keyword, Amount), with icon actions and Export on the right | Title "Opportunities". One chip row: search, Status, Industry, Dataset, plus a More filters popover holding Hide excluded | Title, then chips: Window 7 days, Cohort, Dataset, Import events |
| Transactions summary line | Three inline figures (net change, money in, money out) in light 20px type, no cards, a collapse caret on the right | Inline figures: accounts, cited facts, commercial intent "Not assessed" | Not used (see Insights) |
| Transactions table | Date, avatar with initials or logo, name at 16/360, right-aligned amounts with superscript cents, muted secondary columns, hover tint, no zebra striping, no vertical rules | Logo, company, domain muted. Capability matrix kept as the one graphic column. Score right-aligned like an amount ("30" with a small "/100") | Affected-accounts list styled as transaction rows: id, last event, signup date, time in step |
| Transaction detail (click a row) | Floating panel inset about 16px from the viewport edges, about 12px radius, soft shadow, no page dim. Small title, huge light amount, a vertical from-to timeline with dots, then fields, then the comment box pinned at the bottom | Account panel: small company line, large score, an "Assessment" timeline (Documented, Hypothesis, Unknown, Next) as dot rows, then evidence with citations, then "Open full brief" pinned at the bottom | Account panel: account id, then an event timeline (signed_up, connected_data, missing first_useful_action as a hollow dot), linked feedback, facts |
| Insights (demo.mercury.com/insights) | Filter chips. A time scrubber. A metric strip: primary metric 40px light, two secondaries at 22px, separated by space. On the right, a granularity select and chart-type icon toggles | Not used | Header metric strip: Overall conversion 25.5% primary; median time to value and eligible cohort as secondaries |
| Insights body | Left narrative column (about 30%): rows with an arrow icon, a medium title and a paragraph with inline token chips ("Spending", "transactions"). Right chart (about 70%): dotted gridlines, muted axis labels, a single periwinkle series with translucent bars | Not used | Left: findings as narrative rows with inline token chips (stage, account count). Right: the funnel chart with dotted gridlines and translucent stage columns, the selected stage solid. Drop-off in amber, the only second hue |
| Footer disclaimer | "Trends are generated and may include inaccuracies." Small, muted | Researched vs synthetic provenance line | "Counts recompute from events; feedback is anecdotal, not causal." |
| Mobile transactions | Top bar with menu; title, chips scroll horizontally, rows collapse to name plus amount | Rows collapse to logo, company and score; the panel becomes a full-screen sheet | Metric first, the funnel as horizontal bars, then the account list; the panel becomes a sheet |

## Identity split (same craft, different products)

- **SignalDesk:** neutral ink with an evidence green `#1F7A4D` for documented
  capability. Actions are ink-filled buttons. The page feels like a ledger.
- **FrictionLab:** periwinkle `#5B6CF0` as the data series color (selected stage,
  converted volume), amber `#C77C12` only for drop-off. It is chart-led, like
  Insights.

## Home page

The portfolio Home page (`src/App.tsx`) follows the same light-weight,
hairline-and-chip language: warm soft canvas `#F6F5F2`, ink `#1E1E2A`, muted
`#65656F`, white surfaces, outline chips, DM Sans at 380-400 weight. No bold
display type, no saturated accent buttons.
