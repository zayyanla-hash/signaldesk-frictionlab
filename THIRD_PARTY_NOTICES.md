# Third-party notices

This project includes code and assets adapted from the following open-source
projects. Full license text for each is linked below; nothing here changes
the license of this repository's own code.

## Ported UI code (MIT)

- **Untitled UI React** — github.com/untitleduico/react. Design tokens and
  theme foundation in `src/styles/untitled-theme.css`, plus components under
  `src/components/untitled/`, retained from SignalDesk's earlier visual foundation.
  License: MIT — https://github.com/untitleduico/react/blob/main/LICENSE.md
- **Tremor** (template-insights) — github.com/tremorlabs/template-insights.
  Components under `src/components/tremor/`, retained from FrictionLab's earlier
  Insights-style chart and table foundation. The current connected instrument is bespoke.
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

## Current interaction patterns — VengeanceUI (MIT)

The current FrictionLab navigation and SignalDesk source citations adapt
the free `LineHoverLink` slide underline pattern from
[VengeanceUI](https://github.com/Ashutoshx7/VengeanceUI).
Their scope, sources and motion choices are documented in
[src/frictionlab/docs/DESIGN_REFERENCES.md](src/frictionlab/docs/DESIGN_REFERENCES.md)
and [docs/signaldesk/DESIGN.md](docs/signaldesk/DESIGN.md).
No VengeanceUI runtime or package is installed. The original notice is preserved below.

MIT License

Copyright (c) 2025-2026 Ashutoshx7

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
