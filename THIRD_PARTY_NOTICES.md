# Third-party notices

This project includes code and assets adapted from the following open-source
projects. Full license text for each is linked below; nothing here changes
the license of this repository's own code.

## Ported UI code (MIT)

- **Untitled UI React** — github.com/untitleduico/react. Design tokens and
  theme foundation in `src/styles/untitled-theme.css`, plus components under
  `src/components/untitled/`, used as SignalDesk's visual foundation.
  License: MIT — https://github.com/untitleduico/react/blob/main/LICENSE.md
- **Tremor** (template-insights) — github.com/tremorlabs/template-insights.
  Components under `src/components/tremor/`, used as FrictionLab's
  Insights-style chart and table foundation.
  License: MIT — https://github.com/tremorlabs/tremor/blob/main/LICENSE
- **shadcn/ui**, as packaged in shadcn-admin — github.com/satnaing/shadcn-admin.
  The `Popover` primitive wrapper in `src/components/ui/popover.tsx` and the
  `cn()` class-merging helper in `src/lib/utils.ts` follow this pattern.
  License: MIT — https://github.com/satnaing/shadcn-admin/blob/main/LICENSE

## Icons (CC0)

- **Simple Icons** — github.com/simple-icons/simple-icons. Used in
  `src/components/untitled/account-logo.tsx` to render brand marks for
  researched/sample accounts.
  License: CC0 1.0 — https://github.com/simple-icons/simple-icons/blob/develop/LICENSE.md

## Fonts (OFL-1.1)

Self-hosted via `@fontsource` so the Content-Security-Policy can stay
`font-src 'self'` with no external font requests.

- **DM Sans** — fonts.google.com/specimen/DM+Sans. OFL-1.1.
- **Inter** — fonts.google.com/specimen/Inter. OFL-1.1.
- **Geist / Geist Mono** — vercel.com/font. OFL-1.1.

All of the above are redistributed under their original licenses. No
proprietary assets from any reference product (see
`docs/design-reference.md`) are included.
