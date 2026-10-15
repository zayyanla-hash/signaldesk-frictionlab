import {
  analyze,
  describePriority,
  experimentErrors,
  EXPERIMENT_LABELS,
  GRAINS,
  intervalLabel,
  LABELS,
  pct,
  type Analysis,
  type Dataset,
  type Experiment,
} from "./workbench";

export const htmlEscape = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (ch) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        ch
      ]!,
  );
export function briefErrors(e: Experiment): string[] {
  const errors = experimentErrors(e);
  if (Object.values(e).join("").length > 2400)
    errors.push(
      "Keep the experiment below 2,400 total characters to fit a one-page brief.",
    );
  const printUnits = (text: string) =>
    [...text].reduce(
      (sum, ch) =>
        sum +
        (/[WM@#%mw]/.test(ch)
          ? 1.7
          : ch.charCodeAt(0) > 255
            ? 2
            : /[il1 .,':;]/.test(ch)
              ? 0.6
              : 1),
      0,
    );
  if (
    Object.values(e).some((text) => printUnits(text) > 650) ||
    Object.values(e).reduce((sum, text) => sum + printUnits(text), 0) > 2400
  )
    errors.push(
      "Dense text exceeds the one-page print budget. Shorten long fields before exporting; no content will be cut.",
    );
  return errors;
}
export function buildBrief(
  dataset: Dataset,
  experiment: Experiment,
  segment = "",
): string {
  const a = analyze(dataset, segment);
  if (!a.valid.ok || briefErrors(experiment).length)
    throw new Error(
      "A valid dataset and complete, concise experiment are required.",
    );
  const esc = htmlEscape;
  const c = dataset.contract;
  const isCohort = c.grain === "cohort_users";
  const sections = (Object.keys(EXPERIMENT_LABELS) as (keyof Experiment)[])
    .map(
      (k) =>
        `<section><h3>${EXPERIMENT_LABELS[k]}</h3><p>${esc(experiment[k])}</p></section>`,
    )
    .join("");
  const rows = a.metrics
    .map(
      (m, i) =>
        `<tr><th>${LABELS[m.stage]}</th><td>${m.count.toLocaleString("en-US")}</td><td>${i ? `${m.count} / ${m.denominator} = ${pct(m.rate)}` : "Entry population"}</td><td>${m.loss === null ? "—" : m.loss}</td><td>${i && isCohort ? intervalLabel(m.interval) : "—"}</td></tr>`,
    )
    .join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>FrictionLab · experiment decision brief</title><style>
@page{size:A4;margin:12mm}*{box-sizing:border-box}body{font:11px/1.4 system-ui,sans-serif;color:#20232d;margin:0;background:#eceef1}article{background:white;max-width:186mm;margin:18px auto;padding:10mm}header{border-top:5px solid #20232d;padding-top:12px;display:flex;justify-content:space-between;gap:20px}h1{font-size:24px;letter-spacing:-1px;margin:3px 0 7px}h2{font-size:13px;margin:15px 0 7px;border-bottom:1px solid #c9cdd5;padding-bottom:5px}h3{font-size:10px;text-transform:uppercase;letter-spacing:.04em;margin:0 0 3px}p{margin:3px 0 7px;overflow-wrap:anywhere}.tag{font-size:10px;color:#7c440a;font-weight:700}.meta{font-size:10px;color:#515968}table{width:100%;border-collapse:collapse;font-variant-numeric:tabular-nums;font-size:10px}th,td{text-align:left;border-bottom:1px solid #ddd;padding:5px 3px}td:nth-child(2){font-weight:700}.grid{columns:2;column-gap:18px}.grid section{break-inside:avoid;margin-bottom:10px}footer{margin-top:12px;border-top:1px solid #c9cdd5;padding-top:7px;font-size:9px;color:#515968}.controls{max-width:186mm;margin:16px auto;text-align:right}.controls button{padding:10px 18px;background:#20232d;color:white;border:0;cursor:pointer}.note{font-size:10px;color:#515968}@media print{body{background:white}article{margin:0;padding:0;max-width:none}.controls{display:none}h2{margin-top:12px}.grid{column-gap:16px}}
</style></head><body><div class="controls"><button id="print">Print / save as PDF</button></div><article><header><div><div class="tag">${dataset.provenance === "synthetic" ? "SYNTHETIC EXAMPLE · NO CUSTOMER DATA" : "USER IMPORT · UNVERIFIED"}</div><h1>Experiment decision brief</h1><p>${esc(dataset.name)}</p></div><div class="meta">FrictionLab<br>Work sample by Zayyan Latif<br>Draft · not a launch approval</div></header>
<h2>01 · Dataset & definitions</h2><p>${GRAINS[c.grain]} · ${c.source === "aggregate" ? "Aggregate CSV" : "Event log"} · ${a.valid.rows} source rows · ${esc(segment === "" ? "All supplied segments" : segment)}.<br>Interval [${esc(c.cohortStart)}, ${esc(c.cohortEnd)}). Observed through ${esc(c.observedThrough)}. ${c.windowDays}-day declared conversion window${isCohort ? " from signup" : " (not applied to independent counts)"}.</p>
<p class="note">${isCohort ? "Nested ordered users; each stage / prior stage. Loss = prior − next. End-to-end = final / entry. Zero denominator = not estimable. 95% Wilson intervals assume independent binomial observations." : "Independent counts; ratios describe stage reach/activity. Users may differ at each stage. No conversion, loss or binomial interval is inferred."}</p>
<table><thead><tr><th>Stage</th><th>${a.unit}</th><th>${isCohort ? "Step conversion" : "Stage ratio"}</th><th>${isCohort ? "Loss" : "N/A"}</th><th>95% interval</th></tr></thead><tbody>${rows}</tbody></table>
<p><strong>${isCohort ? "End-to-end conversion" : "Final / entry ratio"}: ${pct(a.overall)}</strong>${isCohort ? ` · ${a.metrics[2].count} / ${a.metrics[0].count} users · 95% interval ${intervalLabel(a.overallInterval)}` : ""}.</p>
<h2>02 · Observed issue</h2><p>${esc(describePriority(a))}</p>
<h2>03 · Proposed test <span class="note">· requires baseline, power and instrumentation review</span></h2><div class="grid">${sections}</div>
<h2>04 · Limits & next decision</h2><p>${esc(limitations(dataset, a))}</p>
<footer>Built by Zayyan Latif with AI coding assistance: product framing, data contract, deterministic funnel calculations, evidence boundaries and experiment workflow. Demonstrates analytical judgment; no commercial traction or test results claimed. No projected upside is a forecast. Version: FrictionLab contract v2.</footer></article><script>document.getElementById('print').addEventListener('click',()=>window.print());</script></body></html>`;
}
export function limitations(dataset: Dataset, a: Analysis): string {
  return [
    dataset.provenance === "synthetic"
      ? "All observations are synthetic; this illustrates a method, not customer evidence."
      : "Imported data is unverified; source completeness and consent are the analyst’s responsibility.",
    dataset.contract.source === "aggregate"
      ? "Aggregate nesting, identity deduplication and segment exclusivity are asserted, not verifiable. No user paths or qualitative evidence are present."
      : `${a.excludedImmature} immature and ${a.excludedOutside} outside-cohort users excluded; ${a.ignoredSequence} sequence/window events ignored; ${a.repeats} repeat events collapsed. Missing events can bias the result.`,
    "Drop-off is an observation, not an explanation. Largest absolute loss is a heuristic; n<30 flags fragility, not statistical significance. Wilson intervals do not cover tracking error or causality. A randomized test and a fresh baseline are required before any lift claim.",
  ].join(" ");
}
