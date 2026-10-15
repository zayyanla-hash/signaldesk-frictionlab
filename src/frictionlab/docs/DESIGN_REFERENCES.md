# FrictionLab: an analytical workspace

Second design pass, October 14, 2026. Presentation work is scoped to `FrictionLabApp.tsx`, `FrictionLabLogo.tsx`, and `instrument.css`.

## What changed

The actual dataset now leads the page. A compact, exact conversion reading sits above the connected funnel; selecting a stage updates a nearby inspector with its count, denominator, rate and observed loss. A direct link opens the supporting evidence below. The inspector also preserves the triage explanation and the boundary between an observed gap and an unknown cause.

White application chrome, restrained jade, one locally bundled sans family, quiet rules and a wider plot replace the earlier warm-paper poster treatment. Large slogans, oversized statistics, numbered navigation, calibration corners and repeated editorial labels were removed. The experiment form follows the evidence using the same type, spacing, controls and color system.

This remains a portfolio work sample. Synthetic provenance, source definitions, observation limits and AI assistance credit are visible. Independent event/user counts use activity or reach wording rather than conversion claims. The supplied counts, mathematical model, validation, persistence and decision-brief export are unchanged.

## References actually reviewed

- [Linear — How we redesigned the Linear UI](https://linear.app/now/how-we-redesigned-the-linear-ui): the useful principles are reducing visual noise, making data and navigation hierarchy distinct, and aligning a complete working surface. This pass applies those ideas through compact chrome and a chart/inspector relationship. No Linear source code, artwork, palette or screen was copied.
- [Emil Kowalski — Good vs Great Animations](https://emilkowal.ski/ui/good-vs-great-animations): repeated task interactions should stay quick. Stage selections update immediately; only the selection emphasis travels and the new inspector context briefly fades. No source code was copied.
- [VengeanceUI](https://www.vengenceui.com/), [official repository](https://github.com/Ashutoshx7/VengeanceUI), [MIT license](https://github.com/Ashutoshx7/VengeanceUI/blob/main/LICENSE): the prior pass adapted the free `line-hover-link` component's slide underline. This pass retains that small CSS adaptation in the top navigation and portfolio link. Its transform origin changes on hover/focus. The official MIT license and copyright were rechecked during this pass; the notice is retained below and in the root notice file. No component installer, runtime dependency or paid source was added.

The logo, workspace arrangement, stage inspector, connected funnel styling and form layout are original. Reference pages inform specific decisions, not a borrowed template.

## Interaction and accessibility

- Counts, percentages, bar heights and connecting curves update immediately. There is no number counting or animated measurement.
- The chart's selection emphasis moves over 240 ms, selected fill changes over 160 ms, and the selected inspector context fades over 180 ms. No continuous motion or entrance delay hides the analysis.
- Native stage buttons remain keyboard accessible and preserve their pressed state. The SVG retains its exact text alternative. Focus rings remain visible.
- Native inputs, CSV validation, details disclosures, export and browser storage feedback retain their contracts and labels.
- The layout becomes one column on small screens: chart, stage controls, then the selected inspector. All exact values remain visible. Long dataset titles wrap.
- Reduced-motion preference disables CSS animation/transition and programmatic smooth scrolling. Interaction does not depend on animation events.

## VengeanceUI MIT notice

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
