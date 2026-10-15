# FrictionLab: analytical folio

Implemented October 14, 2026. Presentation-only work in `FrictionLabApp.tsx`, `FrictionLabLogo.tsx`, and `instrument.css`.

## Direction

The funnel is a measuring instrument inside a working paper. Warm paper, charcoal ink, a large exact reading, a connected plot, calibrated ticks, and vermilion inspection marks establish an identity separate from SignalDesk. The evidence and experiment areas continue the same editorial grid. This is a working analysis tool from the first screen, not a marketing page.

The supplied synthetic counts, statistical boundaries, cohort definitions, validation, experiment draft, local persistence and HTML decision-brief export are preserved. There are no new dependencies, external requests, made-up customer claims, or chart count-up effects.

## References and their specific influence

- [Linear — How we redesigned the Linear UI](https://linear.app/now/how-we-redesigned-the-linear-ui): reduced chrome noise, consistent alignment and contrast, and strong hierarchy. Applied through common margins, a single instrument header, and compact controls. FrictionLab does not reproduce Linear's layout or palette.
- [Rauno Freiberg — Invisible Details of Interaction Design](https://rauno.me/craft/interaction-design), discovered through [Craft](https://rauno.me/craft): immediate response, spatial continuity and interruptible interactions. Applied to the selected-stage frame; values and evidence update immediately and rapid selection never queues an animation.
- [Emil Kowalski — Good vs Great Animations](https://emilkowal.ski/ui/good-vs-great-animations): motion should suit the task, and functional chart updates can be immediate. Applied to nonanimated chart geometry and numbers, with restrained ease-out emphasis transitions.
- [VengeanceUI](https://www.vengenceui.com/), [official repository](https://github.com/Ashutoshx7/VengeanceUI): its free `line-hover-link` registry component's `slide` variant was adapted into `.fi-topbar nav a::before` and `.fi-portfolio::before`. This is an actual source adaptation: the underline scales in with its transform origin switching from right to left on hover/focus. Only the needed CSS pattern is included; no installer, runtime or package was added. Original MIT notice follows.

The specific warm palette, typography, split instrument, funnel geometry, corner calibration frame, and new logo are bespoke. Reference principles inform the result rather than acting as a template.

## Motion contract

- Initial hierarchy arrives once over 480–560 ms with only 9 px movement and a maximum 90 ms stagger. Starting opacity remains 0.65, so content is never hidden behind JavaScript or animation completion.
- Selecting a stage immediately updates the values, pressed state, and evidence. The single chart inspection frame moves over 260 ms; bar emphasis changes over 180 ms. Actual bar height and counts never interpolate.
- Buttons, fields and link underlines acknowledge interaction in 150–240 ms. No continuous animation, fake activity, cursor replacement, or scroll hijacking.
- Import, native details and notices enter locally. State never depends on an animation event.
- `prefers-reduced-motion: reduce` disables every animation and transition, including pseudo-elements. Programmatic smooth scrolling also checks that preference and becomes immediate. All final content, focus rings and selected states remain available.
- The full chart fits the mobile column; native stage buttons provide readable values and keyboard access. Chart tick values use distinct integer counts for very small datasets.

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
