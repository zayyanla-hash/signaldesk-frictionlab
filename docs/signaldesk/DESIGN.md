# SignalDesk design — the analyst’s field ledger

SignalDesk is a standalone account-research tool. Its interface should feel like a working research publication: an index of companies, an inspectable evidence ledger, and a written brief. The product’s identity is archival ivory, graphite, cobalt ink, serif titles and precise numbered sections. Green is reserved primarily for supported evidence; cobalt marks navigation, selected research and the working document.

## References researched

- [Linear — A calmer interface for a product in motion](https://linear.app/now/behind-the-latest-design-refresh), March 12, 2026. Used the principle of predictable actions and quieter navigation, without adopting Linear’s dark palette or visual shell.
- [Are.na](https://www.are.na/). Used its content-first research/curation emphasis: the material being collected is the interface’s subject. SignalDesk keeps claims and sources visible rather than substituting decorative charts.
- [Readwise Reader](https://readwise.io/read) and its [official library/notebook image](https://d34adp677peecb.cloudfront.net/static/images/reader/Hero-Screen%401x.72ad6bf1deaa.webp). The useful reference is a source workspace next to a synthesis notebook. SignalDesk’s persistent account brief provides that relationship with its own editorial treatment.

## Free component evaluation and actual reuse

Reviewed [Skiper UI’s quick start](https://skiper-ui.com/docs/quick-start), [Animata](https://github.com/codse/animata), and [Vengeance UI](https://www.vengenceui.com/components). The more theatrical interaction, loader and background effects would distract from checking evidence. Animata’s [Fluid Tabs source](https://github.com/codse/animata/blob/main/animata/tabs/fluid-tabs.tsx) uses a motion runtime; the existing three-button detail switch needs only a native CSS transform marker, so no package was added.

**Actual adapted source:** Vengeance UI’s [Line Hover Link](https://www.vengenceui.com/components/line-hover-link), [registry source](https://raw.githubusercontent.com/Ashutoshx7/VengeanceUI/main/public/r/line-hover-link.json). The `slide` variant’s pseudo-element, `scale3d`, changing transform origin, and hover/focus selectors are adapted into `.sd-r-source-link` in `research-design.css`. It appears on evidence citations and the account’s public domain. SignalDesk retains an always-visible understated underline, wraps long source titles, and removes motion under reduced-motion preferences. This is a small source adaptation, not an installed library or a template claim.

The entire Vengeance UI MIT notice is retained below and the source comment points here.

## Authored interface

- Custom SignalDesk mark: three source lines and a checked claim. The same local component supplies the workspace and portfolio project identity.
- A serif page title and company names contrast with DM Sans controls and source metadata. Titles, quotations and operational controls have separate roles.
- The numbered company index, evidence ledger and cobalt-ruled brief explain the workflow spatially. No fabricated activity, metrics, retrieval or live AI state was added.
- The six-question matrix uses readable labels and larger focusable cells. Mobile keeps its true width inside a keyboard-focusable scroll region, pins company names, shows a scroll cue, and keeps filtering and sorting available.
- The brief is a document surface with a top ink rule and an offset paper edge. Facts, hypotheses, context, unknowns and next steps retain their original meaning.
- A quiet author link returns to the portfolio. Public-source independence and no-employment/relationship claims remain present.

## Motion

- Page header, ledger summary and index enter over 480ms with a 50–100ms stagger, using only opacity and translation.
- Selecting another account introduces its evidence and brief over 340–420ms. Keys depend only on account identity, so typing in a brief does not remount the editor.
- The detail switch moves a single cobalt rule over 300ms. Selection remains visible through text color and `aria-pressed`.
- Matrix hover and keyboard focus lift by 3px. Source citations reveal the adapted underline. Dialogs and save notices have a short 250–260ms entrance.
- No perpetual motion, scrolling manipulation, artificial loading, or animated qualification counts. Reduced-motion disables all animations and transitions, including pseudo-elements and dialogs. Print has no motion; the existing A4 export CSS and document markup were not changed.

## Implementation and verification

Active files: `ResearchWorkspace.tsx`, `SignalDeskLogo.tsx`, and `research-design.css`. The latter is deliberately a separate screen design layer so the established export styles in `research.css` stay unchanged. No model, source data, import, storage, dependency, or FrictionLab files changed.

Desktop at 1440×1000 and mobile at 390×844 were visually inspected. Lint, TypeScript and the production build passed on the final source. The original 18-group SignalDesk browser suite passed; the release owner also reported all 38 combined acceptance groups passed against the frozen frontend, including the 18 SignalDesk groups. An additional 11-check design pass verified the sticky brief, 10px matrix headings, real account and tab transitions, keyboard citation focus, mobile sorting and horizontal matrix scrolling, navigation, dialogs, reduced motion, and absence of page errors. The release owner confirmed the generated PDF remains one A4 page.

## Vengeance UI license

Source: <https://github.com/Ashutoshx7/VengeanceUI/blob/main/LICENSE>

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
