import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  ArrowDown,
  ArrowRight,
  Check,
  Download,
  FileText,
  FlaskConical,
  Upload,
  X,
} from "lucide-react";
import "@fontsource-variable/dm-sans";
import "@fontsource-variable/geist";
import "./instrument.css";
import { FrictionLabLogo } from "./FrictionLabLogo";
import { downloadText } from "../lib/utils";
import {
  analyze,
  describePriority,
  EXPERIMENT_LABELS,
  GRAINS,
  intervalLabel,
  LABELS,
  MAX_INPUT,
  pct,
  proposeExperiment,
  scenario,
  validateDataset,
  type Analysis,
  type Contract,
  type Dataset,
  type Experiment,
  type Grain,
  type Issue,
} from "./workbench";
import {
  EVENT_CONTRACT,
  EVENT_EXAMPLE,
  INVALID_CSV,
  SAMPLE_CONTRACT,
  SCHEMA_GUIDE,
  SYNTHETIC,
  SYNTHETIC_CSV,
} from "./examples";
import { briefErrors, buildBrief, limitations } from "./brief";
import {
  freshWorkspace,
  loadWorkspace,
  WORKSPACE_KEY,
  type Workspace,
} from "./workspace";

const n = (v: number) => v.toLocaleString("en-US");
const motionBehavior = (): ScrollBehavior =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
const initial = () => {
  try {
    return loadWorkspace(window.localStorage);
  } catch {
    return {
      workspace: freshWorkspace(),
      notice:
        "Browser storage is unavailable. Work is held in memory for this visit.",
    };
  }
};
export default function FrictionLabApp() {
  const [loaded] = useState(initial);
  const [workspace, setWorkspace] = useState<Workspace>(loaded.workspace);
  const [notice, setNotice] = useState<string | null>(loaded.notice);
  const [saveStatus, setSaveStatus] = useState("Saving locally…");
  const [saveEnabled, setSaveEnabled] = useState(true);
  const [saveError, setSaveError] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const analysis = useMemo(
    () => analyze(workspace.dataset, workspace.segment),
    [workspace.dataset, workspace.segment],
  );
  const [selected, setSelected] = useState(workspace.targetIndex);
  const evidenceRef = useRef<HTMLElement>(null);
  const experimentRef = useRef<HTMLElement>(null);
  const importRef = useRef<HTMLElement>(null);
  const location = useLocation();
  useEffect(() => {
    document.title = "Funnel analysis & experiments · FrictionLab";
  }, []);
  useEffect(() => {
    if (location.pathname.endsWith("/decision"))
      experimentRef.current?.scrollIntoView();
    if (location.pathname.endsWith("/evidence"))
      evidenceRef.current?.scrollIntoView();
  }, [location.pathname]);
  useEffect(() => {
    if (!saveEnabled) return;
    try {
      localStorage.setItem(WORKSPACE_KEY, JSON.stringify(workspace));
      setSaveStatus("Saved on this device");
      setSaveError(false);
    } catch {
      setSaveStatus("Not saved · browser storage unavailable or full");
      setSaveError(true);
    }
  }, [workspace, saveEnabled]);
  const updateWorkspace = (next: Workspace) => {
    setSaveEnabled(true);
    setWorkspace(next);
  };
  const replace = (dataset: Dataset) => {
    const a = analyze(dataset);
    if (!a.valid.ok) return;
    const targetIndex = a.biggest ?? 1;
    updateWorkspace({
      version: 2,
      dataset,
      experiment: proposeExperiment(a),
      targetIndex,
      segment: "",
    });
    setSelected(targetIndex);
    setImportOpen(false);
    setNotice(
      `${dataset.provenance === "synthetic" ? "Synthetic example loaded" : "Validated dataset replaced the previous dataset"}. Experiment draft reset to match this population.`,
    );
    document.getElementById("analysis-title")?.focus();
  };
  const selectSegment = (segment: string) => {
    const a = analyze(workspace.dataset, segment);
    const targetIndex = a.biggest ?? 1;
    updateWorkspace({
      ...workspace,
      segment,
      targetIndex,
      experiment: proposeExperiment(a),
    });
    setSelected(targetIndex);
    setNotice(
      "Segment changed. Experiment draft reset so its audience and denominators match.",
    );
  };
  const startExperiment = () => {
    const targetIndex = selected || analysis.biggest || 1;
    updateWorkspace({
      ...workspace,
      targetIndex,
      experiment: proposeExperiment(analysis, targetIndex),
    });
    setNotice(
      "An unvalidated test proposal is ready to edit. No experiment has been launched.",
    );
    experimentRef.current?.scrollIntoView({
      behavior: motionBehavior(),
      block: "start",
    });
    document.getElementById("hypothesis")?.focus({ preventScroll: true });
  };
  const clear = () => {
    try {
      localStorage.removeItem(WORKSPACE_KEY);
    } catch {
      setNotice(
        "Could not clear browser storage. Your current work remains in memory.",
      );
      return;
    }
    setSaveEnabled(false);
    setImportOpen(false);
    setWorkspace(freshWorkspace());
    setSelected(1);
    setSaveStatus("Local work cleared · example in memory");
    setSaveError(false);
    setNotice(
      "This workspace’s saved dataset and draft were removed. The synthetic example is shown in memory; your next edit starts a new local save.",
    );
  };
  const c = workspace.dataset.contract;
  const cohort = c.grain === "cohort_users";
  const overallReading = analysis.overall === null ? "—" : pct(analysis.overall);
  return (
    <div className="fi-root">
      <a className="fi-skip-link" href="#main">
        Skip to analysis
      </a>
      <header className="fi-topbar">
        <Link to="/frictionlab" className="fi-brand">
          <FrictionLabLogo />
          <span>
            FrictionLab
            <span className="fi-brand-sub">
              Funnel analysis / experiment design
            </span>
          </span>
        </Link>
        <nav aria-label="FrictionLab">
          <a href="#main"><span aria-hidden="true">01</span> Analyze</a>
          <a href="#evidence"><span aria-hidden="true">02</span> Evidence</a>
          <a href="#experiment"><span aria-hidden="true">03</span> Experiment</a>
        </nav>
        <Link to="/" className="fi-portfolio">
          Zayyan Latif <ArrowRight size={14} aria-hidden="true" />
        </Link>
      </header>
      <main id="main" className="fi-main" tabIndex={-1}>
        <div className="fi-workbar">
          <span className="fi-eyebrow">WORK SAMPLE 02 / PRODUCT ANALYTICS</span>
          <span className="fi-save" role={saveError ? "alert" : "status"}>
            {saveStatus}
          </span>
        </div>
        <div className="fi-heading">
          <div>
            <h1 id="analysis-title" tabIndex={-1}>
              <span>Find the friction.</span>{" "}
              <span className="fi-heading-next">Design the test.</span>
            </h1>
            <p>Trace every number. Separate what happened from why.</p>
          </div>
          <button
            className="fi-button fi-dark"
            aria-expanded={importOpen}
            aria-controls="import-panel"
            onClick={() => {
              setImportOpen(!importOpen);
              if (!importOpen)
                setTimeout(
                  () =>
                    importRef.current?.scrollIntoView({
                      block: "start",
                      behavior: motionBehavior(),
                    }),
                  0,
                );
            }}
          >
            <Upload size={15} aria-hidden="true" />
            Import funnel data
          </button>
        </div>
        {notice && (
          <div className="fi-notice" role="status">
            <span>{notice}</span>
            <button aria-label="Dismiss notice" onClick={() => setNotice(null)}>
              <X size={15} aria-hidden="true" />
            </button>
          </div>
        )}
        {importOpen && (
          <section
            className="fi-import"
            id="import-panel"
            ref={importRef}
            aria-labelledby="import-title"
          >
            <ImportPanel
              onReplace={replace}
              onClose={() => setImportOpen(false)}
            />
          </section>
        )}
        <section className="fi-dataset" aria-label="Active dataset">
          <div className="fi-dataset-title">
            <span
              className={`fi-tag ${workspace.dataset.provenance === "synthetic" ? "fi-synthetic" : ""}`}
            >
              {workspace.dataset.provenance === "synthetic"
                ? "SYNTHETIC EXAMPLE"
                : "IMPORTED · UNVERIFIED"}
            </span>
            <strong>{workspace.dataset.name}</strong>
            <span>
              {analysis.valid.rows} rows ·{" "}
              {c.source === "aggregate" ? "aggregate counts" : "event log"}
            </span>
          </div>
          <div className="fi-contract">
            <span>{GRAINS[c.grain]}</span>
            <span>
              {cohort
                ? `${c.windowDays}-day conversion window`
                : "Independent interval counts"}
            </span>
            <span>
              {c.cohortStart.slice(0, 10)} → {c.cohortEnd.slice(0, 10)}{" "}
              <span className="fi-muted">(end exclusive, UTC)</span>
            </span>
            <span>Observed through {c.observedThrough.slice(0, 10)} UTC</span>
          </div>
          <details className="fi-contract-details">
            <summary>Inspect data contract & definitions</summary>
            <p>
              {cohort
                ? `Users with earliest signup in the declared interval, counted once at each strictly ordered stage within ${c.windowDays} days of signup. Only complete observation windows enter the denominator.`
                : `Each stage is counted independently during the declared interval. The recorded ${c.windowDays}-day window is metadata and is not applied to reach counts. Ratios may exceed 100%; they are not user conversion.`}
            </p>
            <p>
              {c.source === "aggregate"
                ? "Aggregate cohort nesting and disjoint segments are declared assumptions. Counts cannot prove them or reveal user journeys."
                : "Repeated events do not create extra users. The earliest signup anchors the window; events at tied timestamps cannot establish order."}{" "}
              Zero denominator means “not estimable”.
            </p>
            <button
              className="fi-text-button"
              onClick={() =>
                downloadText("frictionlab-schema.txt", SCHEMA_GUIDE)
              }
            >
              Download full CSV schema
            </button>
            <button
              className="fi-text-button"
              onClick={() =>
                downloadText(
                  "frictionlab-active-data.csv",
                  workspace.dataset.csv,
                  "text/csv",
                )
              }
            >
              Download active source CSV
            </button>
          </details>
        </section>
        <section className="fi-analysis" aria-labelledby="funnel-title">
          <div className="fi-instrument-header">
            <span className="fi-eyebrow"><i aria-hidden="true" /> 01 / THE FUNNEL</span>
                <label className="fi-segment">
                  Segment
                  <select
                    value={workspace.segment}
                    onChange={(e) => selectSegment(e.target.value)}
                    disabled={analysis.valid.segments.length < 2}
                  >
                    <option value="">All supplied segments</option>
                    {analysis.valid.segments.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </label>
          </div>
          <div className="fi-analysis-top">
            <div className="fi-primary">
              <span className="fi-eyebrow">
                {cohort
                  ? `${c.windowDays}-DAY END-TO-END CONVERSION`
                  : c.grain === "events"
                    ? "FINAL / ENTRY EVENT RATIO"
                    : "FINAL / ENTRY USER REACH RATIO"}
              </span>
              <div
                className="fi-hero"
                style={{ "--fi-reading-characters": overallReading.length } as CSSProperties}
              >
                {overallReading}
              </div>
              <p>
                <strong>{n(analysis.metrics[2].count)}</strong>{" "}
                {cohort ? "completed" : "at final stage"} /{" "}
                <strong>{n(analysis.metrics[0].count)}</strong>{" "}
                {cohort ? "eligible users" : `entry-stage ${analysis.unit}`}
              </p>
              {cohort ? (
                <p className="fi-uncertainty">
                  95% Wilson interval: {intervalLabel(analysis.overallInterval)}
                  {workspace.dataset.provenance === "synthetic"
                    ? " · illustrative"
                    : ""}
                </p>
              ) : (
                <p className="fi-uncertainty">
                  Independent counts · no conversion inference
                </p>
              )}
            </div>
            <div className="fi-reading">
              <div className="fi-reading-heading">
                <span className="fi-eyebrow">
                  {analysis.priority === "investigate"
                    ? "INVESTIGATE FIRST"
                    : analysis.priority === "small"
                      ? "SMALL SAMPLE · FRAGILE LEAD"
                      : analysis.priority === "measurement"
                        ? "MEASUREMENT REVIEW FIRST"
                        : "READ THE LIMITS"}
                </span>
              </div>
              <h2 id="funnel-title">
                {analysis.biggest === null
                  ? "Counts before conclusions."
                  : `${LABELS[analysis.metrics[analysis.biggest].stage]}.`}
              </h2>
              <p>{describePriority(analysis)}</p>
              <p className="fi-muted">
                {cohort
                  ? "A missing next event is an observed gap. Motivation, usability and technical causes remain unknown."
                  : "Instrument an ordered cohort before prioritizing a user friction point."}
              </p>
            </div>
          </div>
          <FunnelChart
            analysis={analysis}
            selected={selected}
            setSelected={setSelected}
            cohort={cohort}
          />
          <div className="fi-chart-footer">
            <span>
              <i className="fi-legend-series" />
              {cohort
                ? "Users reaching each ordered stage"
                : `Independent ${analysis.unit} at each stage`}
            </span>
            <span>
              <i className="fi-legend-loss" />
              {cohort ? "Observed loss from prior stage" : "No loss inferred"}
            </span>
            <span>
              Select a stage below to inspect its denominator{" "}
              <ArrowDown size={13} aria-hidden="true" />
            </span>
          </div>
          <div
            className="fi-stage-controls"
            aria-label="Inspect a funnel stage"
          >
            {analysis.metrics.map((m, i) => (
              <button
                key={m.stage}
                aria-pressed={selected === i}
                onClick={() => setSelected(i)}
              >
                <span className="fi-stage-number">0{i + 1}</span>
                <span>
                  <strong>{LABELS[m.stage]}</strong>
                  <span className="fi-stage-count">
                    {n(m.count)} {analysis.unit}
                    {i > 0
                      ? ` · ${pct(m.rate)} ${cohort ? "of prior" : "ratio"}`
                      : " · entry population"}
                  </span>
                </span>
                <span className="fi-stage-arrow" aria-hidden="true"><ArrowDown size={16} /></span>
              </button>
            ))}
          </div>
        </section>
        <section
          className="fi-evidence"
          id="evidence"
          ref={evidenceRef}
          aria-labelledby="evidence-title"
        >
          <StageEvidence
            dataset={workspace.dataset}
            analysis={analysis}
            selected={selected}
            onExperiment={startExperiment}
          />
        </section>
        <section
          className="fi-experiment"
          id="experiment"
          ref={experimentRef}
          aria-labelledby="experiment-title"
        >
          <ExperimentBuilder
            dataset={workspace.dataset}
            analysis={analysis}
            targetIndex={workspace.targetIndex}
            experiment={workspace.experiment}
            onEdit={(experiment) =>
              updateWorkspace({ ...workspace, experiment })
            }
          />
        </section>
        <section className="fi-method">
          <details>
            <summary>Method, limits & what I built</summary>
            <p>{limitations(workspace.dataset, analysis)}</p>
            <p>
              Built by Zayyan Latif with AI coding assistance. This work sample
              demonstrates a data contract, deterministic calculations,
              uncertainty, evidence boundaries and a measurable experiment
              brief. It does not claim commercial traction, real customer
              findings, or a completed experiment.
            </p>
            <p>
              The largest absolute loss is a transparent triage rule. n &lt; 30
              is a caution threshold, not a power calculation. Binomial
              intervals assume independent users; tracking errors and population
              selection remain outside that model.
            </p>
            <button
              className="fi-text-button"
              onClick={() =>
                downloadText("frictionlab-schema.txt", SCHEMA_GUIDE)
              }
            >
              CSV schema & methodology
            </button>
          </details>
        </section>
        <footer className="fi-footer">
          <span>Local analysis. Deterministic math. No paid API.</span>
          <button className="fi-text-button" onClick={clear}>
            Clear this workspace’s local work
          </button>
        </footer>
      </main>
    </div>
  );
}

function FunnelChart({
  analysis: a,
  selected,
  setSelected,
  cohort,
}: {
  analysis: Analysis;
  selected: number;
  setSelected: (i: number) => void;
  cohort: boolean;
}) {
  const max = Math.max(1, ...a.metrics.map((m) => m.count));
  const xs = [110, 405, 700];
  const bar = 112;
  const top = 62;
  const height = 240;
  const base = top + height;
  const ys = a.metrics.map((m) => base - (m.count / max) * height);
  // Low-volume datasets need distinct integer ticks, including a true zero.
  const ticks = [...new Set([0, 0.25, 0.5, 0.75, 1].map((p) => Math.round(max * p)))];
  // Reserve space for the exact labels even at the largest valid counts.
  // The mobile type sizes are the limiting case, so these gutters also fit desktop.
  const axisGutter = Math.max(0, n(max).length * 15 - 43);
  const lossCharacters = Math.max(...a.metrics.map((m) => m.loss === null ? 0 : n(m.loss).length + 1));
  const lossGutter = cohort ? Math.max(0, lossCharacters * 17 - 80) : 0;
  return (
    <div className="fi-chart-wrap">
      <div className="fi-plot-heading" aria-hidden="true">
        <span>{cohort ? "POPULATION TRACE" : "ACTIVITY TRACE"}</span>
        <span>{a.unit.toUpperCase()} / ABSOLUTE COUNTS</span>
      </div>
      <svg
        className="fi-chart"
        viewBox={`0 0 ${930 + axisGutter + lossGutter} 378`}
        role="img"
        aria-labelledby="chart-title chart-desc"
      >
        <title id="chart-title">
          {cohort ? "Ordered conversion funnel" : "Independent stage counts"}
        </title>
        <desc id="chart-desc">
          {a.metrics
            .map(
              (m, i) =>
                `${LABELS[m.stage]}: ${m.count} ${a.unit}${i ? `, ${cohort ? "conversion" : "ratio"} ${pct(m.rate)}${m.loss === null ? "" : `, loss ${m.loss}`}` : ""}`,
            )
            .join(". ")}
          . Use the stage buttons below for keyboard-accessible details.
        </desc>
        <defs>
          <pattern
            id="fi-hatch"
            width="6"
            height="6"
            patternTransform="rotate(35)"
            patternUnits="userSpaceOnUse"
          >
            <rect width="6" height="6" className="fi-hatch-ground" />
            <line x1="0" y1="0" x2="0" y2="6" className="fi-hatch-line" />
          </pattern>
        </defs>
        <g transform={`translate(${axisGutter}, 0)`}>
        {ticks.map((tick) => (
          <g key={tick} aria-hidden="true">
            <line
              x1="62"
              y1={base - (tick / max) * height}
              x2="906"
              y2={base - (tick / max) * height}
              className={tick === 0 ? "fi-baseline" : "fi-gridline"}
            />
            <line x1="54" x2="62" y1={base - (tick / max) * height} y2={base - (tick / max) * height} className="fi-calibration" />
            <text x="43" y={base - (tick / max) * height + 4} textAnchor="end" className="fi-axis">
              {n(tick)}
            </text>
          </g>
        ))}
        <g
          className="fi-selection-frame"
          style={{ transform: `translateX(${xs[selected] - 18}px)` }}
          aria-hidden="true"
        >
          <rect x="0" y="20" width={bar + 36} height="325" className="fi-selection-ground" />
          <path d={`M0,33 V20 H13 M${bar + 23},20 H${bar + 36} V33 M0,332 V345 H13 M${bar + 23},345 H${bar + 36} V332`} className="fi-selection-corners" />
        </g>
        {a.metrics.slice(0, -1).map((m, i) => (
          <g key={m.stage} aria-hidden="true">
            <path
              d={`M${xs[i] + bar},${ys[i]} C${xs[i] + 210},${ys[i]} ${xs[i + 1] - 96},${ys[i + 1]} ${xs[i + 1]},${ys[i + 1]} L${xs[i + 1]},${base} L${xs[i] + bar},${base} Z`}
              className="fi-flow-fill"
            />
            <path
              d={`M${xs[i] + bar},${ys[i]} C${xs[i] + 210},${ys[i]} ${xs[i + 1] - 96},${ys[i + 1]} ${xs[i + 1]},${ys[i + 1]}`}
              className="fi-flow-line"
            />
          </g>
        ))}
        {a.metrics.map((m, i) => (
          <g
            key={m.stage}
            aria-hidden="true"
            className={`fi-chart-stage${selected === i ? " is-selected" : ""}`}
            onClick={() => setSelected(i)}
          >
            <rect x={xs[i] - 18} y="20" width={bar + 36} height="325" fill="transparent" />
            {i > 0 && cohort && m.loss! > 0 && (
              <rect
                x={xs[i]}
                y={ys[i - 1]}
                width={bar}
                height={Math.max(0, ys[i] - ys[i - 1])}
                fill="url(#fi-hatch)"
              />
            )}
            <rect
              x={xs[i]}
              y={ys[i]}
              width={bar}
              height={Math.max(0, base - ys[i])}
              className="fi-count-bar"
            />
            <line x1={xs[i]} x2={xs[i] + bar} y1={ys[i]} y2={ys[i]} className="fi-count-cap" />
            <text
              x={xs[i] + bar / 2}
              y={Math.max(46, ys[i] - 12)}
              textAnchor="middle"
              className="fi-chart-value"
            >
              {n(m.count)}
            </text>
            {i > 0 && cohort && (
              <g>
                <line x1={xs[i] + bar + 8} x2={xs[i] + bar + 20} y1={Math.min(286, Math.max(83, ys[i - 1] + 24)) - 5} y2={Math.min(286, Math.max(83, ys[i - 1] + 24)) - 5} className="fi-loss-leader" />
                <text
                  x={xs[i] + bar + 26}
                  y={Math.min(286, Math.max(83, ys[i - 1] + 24))}
                  className="fi-chart-loss"
                >
                  −{n(m.loss!)}
                </text>
              </g>
            )}
            <text x={xs[i] + bar / 2} y="328" textAnchor="middle" className="fi-chart-label">
              0{i + 1}
            </text>
            <circle cx={xs[i] + bar / 2} cy="345" r="3" className="fi-stage-dot" />
          </g>
        ))}
        </g>
      </svg>
      <div className="fi-plot-caption">
        <span>Inspecting stage 0{selected + 1}</span>
        <span>{LABELS[a.metrics[selected].stage]}</span>
      </div>
    </div>
  );
}

function StageEvidence({
  dataset,
  analysis: a,
  selected,
  onExperiment,
}: {
  dataset: Dataset;
  analysis: Analysis;
  selected: number;
  onExperiment: () => void;
}) {
  const m = a.metrics[selected];
  const cohort = dataset.contract.grain === "cohort_users";
  const paths = a.paths.filter(
    (p) => p.mature && (selected === 0 || p.times[selected - 1]),
  );
  return (
    <>
      <div className="fi-section-heading">
        <div>
          <span className="fi-eyebrow">02 / INSPECT THE EVIDENCE <span className="fi-section-reference">STAGE 0{selected + 1}</span></span>
          <h2 id="evidence-title">{LABELS[m.stage]}</h2>
        </div>
        <button className="fi-button" onClick={onExperiment}>
          <FlaskConical size={16} aria-hidden="true" />
          {selected === 0
            ? a.biggest === null
              ? "Draft a measurement plan"
              : "Draft test for largest loss"
            : "Draft a test for this stage"}
          <ArrowRight size={14} aria-hidden="true" />
        </button>
      </div>
      <div className="fi-evidence-grid" key={m.stage}>
        <div>
          <div className="fi-observation-label">
            OBSERVED /{" "}
            {dataset.provenance === "synthetic"
              ? "SYNTHETIC COUNTS"
              : "IMPORTED COUNTS"}
          </div>
          <p className="fi-observation">
            {selected === 0 ? (
              <>
                <strong>
                  {n(m.count)} {a.unit}
                </strong>{" "}
                in the entry population.
              </>
            ) : (
              <>
                <strong>
                  {n(m.count)} / {n(m.denominator)}
                </strong>{" "}
                {cohort
                  ? `eligible users reached ${LABELS[m.stage].toLowerCase()}`
                  : "independent stage counts"}
                .
              </>
            )}
          </p>
          <dl className="fi-definition-list">
            <dt>{selected && cohort ? "Step conversion" : "Stage ratio"}</dt>
            <dd>
              {pct(m.rate)}
              {selected && cohort
                ? ` · 95% interval ${intervalLabel(m.interval)}`
                : ""}
            </dd>
            <dt>Denominator</dt>
            <dd>
              {selected
                ? `${n(m.denominator)} ${a.unit} at ${LABELS[a.metrics[selected - 1].stage].toLowerCase()}`
                : `${n(m.denominator)} entry-stage ${a.unit}`}
            </dd>
            <dt>{cohort ? "Absolute observed loss" : "Loss inference"}</dt>
            <dd>
              {m.loss === null
                ? cohort
                  ? "Entry stage; no prior denominator"
                  : "Unavailable for independent counts"
                : `${n(m.loss)} users = ${n(m.denominator)} − ${n(m.count)}`}
            </dd>
            <dt>Calculation</dt>
            <dd>
              {selected
                ? `${m.count} ÷ ${m.denominator}${m.denominator === 0 ? " = not estimable" : ` = ${pct(m.rate)}`}`
                : "Entry count / itself; not a conversion transition"}
            </dd>
          </dl>
          {m.denominator < 30 && cohort && (
            <p className="fi-caution">
              Small n: wide uncertainty. Collect more observations before
              treating this ranking as stable.
            </p>
          )}
        </div>
        <div className="fi-inference">
          <div className="fi-observation-label">POSSIBLE CAUSES / UNTESTED</div>
          <h3>The reason is still unknown.</h3>
          <p>
            A missed event could reflect an incomplete journey, a tracking gap,
            an identity problem or an experience problem. These numbers cannot
            distinguish them.
          </p>
          <p>
            <strong>Next evidence:</strong> reconcile instrumentation, review
            error logs, then observe a few consented usability sessions.
            Document what was seen before proposing an explanation.
          </p>
          <p className="fi-muted">
            No interviews, session recordings, customer quotations or behavioral
            explanations are present in this dataset.
          </p>
        </div>
      </div>
      <details className="fi-raw">
        <summary>
          Inspect source{" "}
          {dataset.contract.source === "aggregate"
            ? "rows & declared assumptions"
            : cohort
              ? "user paths & exclusions"
              : "events & interval"}
        </summary>
        {dataset.contract.source === "aggregate" ? (
          <>
            <p>
              {cohort
                ? "These are declared nested counts from one cohort, with disjoint segments."
                : "These are independent counts with disjoint declared segments; they do not establish an ordered journey."}{" "}
              Aggregate data cannot verify membership, ordering, duplicates
              within the supplied counts, or causes.
            </p>
            <div className="fi-table-wrap">
              <table>
                <caption>
                  Rows supporting {LABELS[m.stage]} and its denominator
                </caption>
                <thead>
                  <tr>
                    <th>CSV row</th>
                    <th>Cohort</th>
                    <th>Segment</th>
                    <th>Stage</th>
                    <th>Count</th>
                  </tr>
                </thead>
                <tbody>
                  {a.valid.aggregates
                    .filter(
                      (r) =>
                        (a.segment === "" || r.segment === a.segment) &&
                        (r.stage === m.stage ||
                          (selected > 0 &&
                            r.stage === a.metrics[selected - 1].stage)),
                    )
                    .map((r) => (
                      <tr key={r.row}>
                        <td>{r.row}</td>
                        <td>{r.cohort_id}</td>
                        <td>{r.segment}</td>
                        <td>{r.stage}</td>
                        <td>{n(r.count)}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </>
        ) : !cohort ? (
          <IndependentEventRows
            dataset={dataset}
            analysis={a}
            selected={selected}
          />
        ) : (
          <>
            <p>
              {a.excludedImmature} immature users excluded; {a.excludedOutside}{" "}
              outside cohort; {a.ignoredSequence} out-of-order or outside-window
              events ignored; {a.repeats} repeat events collapsed. Window ends
              are inclusive; signup cohort end is exclusive. Timestamp ties do
              not establish order.
            </p>
            <div className="fi-table-wrap">
              <table>
                <caption>
                  {Math.min(paths.length, 20)} of {paths.length} eligible user
                  paths for this denominator
                </caption>
                <thead>
                  <tr>
                    <th>User</th>
                    <th>Signup UTC</th>
                    <th>Selected stage UTC</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {paths.slice(0, 20).map((p) => (
                    <tr key={p.user}>
                      <td>{p.user}</td>
                      <td>{p.signup}</td>
                      <td>{p.times[selected] ?? "No qualifying event"}</td>
                      <td>{p.times[selected] ? "Reached" : "Not observed"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </details>
    </>
  );
}

function IndependentEventRows({
  dataset,
  analysis: a,
  selected,
}: {
  dataset: Dataset;
  analysis: Analysis;
  selected: number;
}) {
  const start = Date.parse(dataset.contract.cohortStart);
  const end = Date.parse(dataset.contract.cohortEnd);
  const rows = a.valid.events.filter(
    (e) =>
      (a.segment === "" || e.segment === a.segment) &&
      e.stage === a.metrics[selected].stage &&
      Date.parse(e.occurred_at) >= start &&
      Date.parse(e.occurred_at) < end,
  );
  const unique = new Set(rows.map((e) => e.user_id)).size;
  return (
    <>
      <p>
        {rows.length} event rows and {unique} distinct users at this stage
        inside the measurement interval.{" "}
        {dataset.contract.grain === "events"
          ? "Every distinct event counts, including repeat events by a user."
          : "Each user counts once at this stage, even with repeat events."}{" "}
        This is not an ordered cohort and does not identify who dropped out.
      </p>
      <div className="fi-table-wrap">
        <table>
          <caption>
            First {Math.min(20, rows.length)} of {rows.length} source events at{" "}
            {LABELS[a.metrics[selected].stage]}
          </caption>
          <thead>
            <tr>
              <th>CSV row</th>
              <th>Event ID</th>
              <th>User</th>
              <th>UTC timestamp</th>
              <th>Segment</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 20).map((e) => (
              <tr key={e.event_id}>
                <td>{e.row}</td>
                <td>{e.event_id}</td>
                <td>{e.user_id}</td>
                <td>{e.occurred_at}</td>
                <td>{e.segment}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function ExperimentBuilder({
  dataset,
  analysis: a,
  targetIndex,
  experiment: e,
  onEdit,
}: {
  dataset: Dataset;
  analysis: Analysis;
  targetIndex: number;
  experiment: Experiment;
  onEdit: (e: Experiment) => void;
}) {
  const [pp, setPP] = useState(5);
  const [exportNotice, setExportNotice] = useState("");
  useEffect(() => setExportNotice(""), [dataset, e, a.segment, targetIndex]);
  const errors = briefErrors(e);
  const hypothetical = scenario(a, targetIndex, pp);
  const exportBrief = () => {
    if (errors.length) {
      setExportNotice("Complete the required fields before export.");
      return;
    }
    try {
      downloadText(
        "frictionlab-decision-brief.html",
        buildBrief(dataset, e, a.segment),
        "text/html",
      );
      setExportNotice(
        "Decision brief downloaded. Open the HTML file and use Print / save as PDF for a one-page copy.",
      );
    } catch {
      setExportNotice(
        "Export failed. Review validation and experiment fields, then try again.",
      );
    }
  };
  return (
    <>
      <div className="fi-section-heading">
        <div>
          <span className="fi-eyebrow">03 / PROPOSE A MEASURABLE TEST</span>
          <h2 id="experiment-title">A hypothesis, not a conclusion.</h2>
        </div>
        <span className="fi-tag">DRAFT · NOT RUN</span>
      </div>
      <div className="fi-builder-grid">
        <div className="fi-form-grid">
          {(Object.keys(EXPERIMENT_LABELS) as (keyof Experiment)[]).map((k) => (
            <label
              className={`fi-field ${k === "decisionRule" || k === "instrumentation" ? "fi-field-wide" : ""}`}
              key={k}
              htmlFor={k}
            >
              <span>
                {EXPERIMENT_LABELS[k]}{" "}
                <span className="fi-required">required</span>
              </span>
              <textarea
                id={k}
                required
                maxLength={700}
                value={e[k]}
                rows={k === "decisionRule" ? 4 : 3}
                onChange={(ev) => onEdit({ ...e, [k]: ev.target.value })}
                aria-invalid={!e[k].trim()}
              />
            </label>
          ))}
        </div>
        <aside className="fi-test-rail">
          <div className="fi-eyebrow">TEST TARGET</div>
          <h3>{LABELS[a.metrics[targetIndex].stage]}</h3>
          <p>
            Audience: {a.segment === "" ? "all supplied segments" : a.segment}.{" "}
            {dataset.contract.windowDays}-day declared window.
          </p>
          <div className="fi-rail-rule" />
          <div className="fi-eyebrow">HYPOTHETICAL SCENARIO</div>
          {hypothetical ? (
            <>
              <label className="fi-slider">
                Improve this transition by{" "}
                <strong>+{pp} percentage points</strong>
                <input
                  type="range"
                  min="0"
                  max="20"
                  step="1"
                  value={pp}
                  onChange={(ev) => setPP(Number(ev.target.value))}
                  aria-label="Hypothetical transition improvement in percentage points"
                />
              </label>
              <div className="fi-scenario-number">
                ≈ {Math.round(hypothetical.additionalFinal)}{" "}
                <span>additional final completions</span>
              </div>
              <p>
                Across the same {n(a.metrics[0].count)} entry users; end-to-end
                would be {pct(hypothetical.projectedOverall)}.
              </p>
              <p className="fi-muted">
                Scenario only. Caps the transition at 100%; holds audience,
                volume and later-stage conversion constant. Fractional expected
                counts are rounded for display. This is neither a forecast nor a
                measured effect. Excluded from the decision brief.
              </p>
            </>
          ) : (
            <p>
              No upside estimate: an ordered cohort with estimable downstream
              conversion is required.
            </p>
          )}
          <div className="fi-rail-rule" />
          <p className="fi-muted">
            No test runner or live intervention. Review baseline, power,
            instrumentation and guardrails before launch.
          </p>
        </aside>
      </div>
      <div className="fi-export">
        <div>
          <FileText size={24} aria-hidden="true" />
          <div>
            <h3>One-page decision brief</h3>
            <p>
              Dataset, definitions, observed issue, proposed experiment and
              limitations.
            </p>
          </div>
        </div>
        <button
          className="fi-button fi-dark"
          onClick={exportBrief}
          disabled={errors.length > 0}
        >
          <Download size={15} aria-hidden="true" />
          Export decision brief
        </button>
      </div>
      {errors.length > 0 && (
        <ul className="fi-errors" aria-live="polite">
          {errors.map((error) => (
            <li key={error}>{error}</li>
          ))}
        </ul>
      )}
      {exportNotice && (
        <p className="fi-export-notice" role="status">
          {exportNotice}
        </p>
      )}
    </>
  );
}

function ImportPanel({
  onReplace,
  onClose,
}: {
  onReplace: (d: Dataset) => void;
  onClose: () => void;
}) {
  const [source, setSource] = useState<Contract["source"]>("aggregate");
  const [grain, setGrain] = useState<Grain | "">("");
  const [windowDays, setWindowDays] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [cutoff, setCutoff] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [text, setText] = useState("");
  const [name, setName] = useState("Imported funnel");
  const [issues, setIssues] = useState<Issue[] | null>(null);
  const [validFingerprint, setValidFingerprint] = useState("");
  const [reading, setReading] = useState(false);
  const [fileError, setFileError] = useState("");
  const readSequence = useRef(0);
  useEffect(
    () => () => {
      readSequence.current++;
    },
    [],
  );
  const [provenance, setProvenance] =
    useState<Dataset["provenance"]>("imported");
  const current: Dataset = {
    name,
    provenance,
    csv: text,
    contract: {
      source,
      grain: grain as Grain,
      windowDays: Number(windowDays),
      cohortStart: start,
      cohortEnd: end,
      observedThrough: cutoff,
      aggregateConfirmed: confirmed,
    },
  };
  const fingerprint = JSON.stringify(current);
  const passed =
    validFingerprint === fingerprint &&
    issues?.length === 0 &&
    !fileError &&
    !reading;
  const load = (kind: "aggregate" | "event_log" | "invalid") => {
    readSequence.current++;
    setReading(false);
    const isAggregate = kind === "aggregate";
    const c = isAggregate ? SAMPLE_CONTRACT : EVENT_CONTRACT;
    setSource(c.source);
    setGrain(c.grain);
    setWindowDays(String(c.windowDays));
    setStart(c.cohortStart);
    setEnd(c.cohortEnd);
    setCutoff(c.observedThrough);
    setConfirmed(false);
    setText(
      isAggregate
        ? SYNTHETIC_CSV
        : kind === "invalid"
          ? INVALID_CSV
          : EVENT_EXAMPLE,
    );
    setName(
      kind === "invalid"
        ? "Invalid synthetic fixture"
        : isAggregate
          ? SYNTHETIC.name
          : "Synthetic eight-user event fixture",
    );
    setProvenance("synthetic");
    setIssues(null);
    setValidFingerprint("");
    setFileError("");
  };
  const validate = () => {
    const v = validateDataset(current);
    const next = [...v.issues];
    setIssues(next);
    setValidFingerprint(fingerprint);
  };
  const read = async (file?: File) => {
    if (!file) return;
    const sequence = ++readSequence.current;
    setReading(true);
    setValidFingerprint("");
    setIssues(null);
    setFileError("");
    try {
      if (file.size > MAX_INPUT)
        throw new Error("File exceeds 1 MB. Split the dataset before import.");
      const content = await file.text();
      if (sequence !== readSequence.current) return;
      setText(content);
      setName(file.name.slice(0, 120));
      setProvenance("imported");
    } catch (error) {
      if (sequence !== readSequence.current) return;
      setFileError(
        error instanceof Error
          ? error.message
          : "Could not read this file. Try a local UTF-8 CSV.",
      );
    } finally {
      if (sequence === readSequence.current) setReading(false);
    }
  };
  return (
    <>
      <div className="fi-section-heading">
        <div>
          <span className="fi-eyebrow">01 / DEFINE & VALIDATE</span>
          <h2 id="import-title">Bring a denominator you can defend.</h2>
        </div>
        <button
          className="fi-icon-button"
          aria-label="Close import"
          onClick={onClose}
        >
          <X size={19} />
        </button>
      </div>
      <p className="fi-muted">
        Local, synthetic or de-identified test data only. Validated imports
        replace the current dataset. The active analysis stays unchanged until
        you apply.
      </p>
      <div className="fi-import-examples">
        <button className="fi-text-button" onClick={() => load("aggregate")}>
          Load synthetic aggregate
        </button>
        <button className="fi-text-button" onClick={() => load("event_log")}>
          Load eight-user event fixture
        </button>
        <button className="fi-text-button" onClick={() => load("invalid")}>
          Load invalid fixture
        </button>
        <button
          className="fi-text-button"
          onClick={() => downloadText("frictionlab-schema.txt", SCHEMA_GUIDE)}
        >
          Download schema
        </button>
      </div>
      <div className="fi-import-fields">
        <label className="fi-field">
          <span>Dataset name</span>
          <input
            value={name}
            maxLength={120}
            onChange={(ev) => {
              setName(ev.target.value);
              setProvenance("imported");
            }}
          />
        </label>
        <label className="fi-field">
          <span>Input structure</span>
          <select
            value={source}
            onChange={(ev) => setSource(ev.target.value as Contract["source"])}
          >
            <option value="aggregate">Aggregate CSV</option>
            <option value="event_log">Event log CSV</option>
          </select>
        </label>
        <label className="fi-field">
          <span>Data grain · required</span>
          <select
            value={grain}
            onChange={(ev) => setGrain(ev.target.value as Grain)}
          >
            <option value="">Choose a grain…</option>
            {Object.entries(GRAINS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="fi-field">
          <span>Conversion window · days</span>
          <input
            type="number"
            min="1"
            max="90"
            step="1"
            value={windowDays}
            onChange={(ev) => setWindowDays(ev.target.value)}
          />
        </label>
        <label className="fi-field">
          <span>
            {grain === "cohort_users"
              ? "Signup cohort"
              : "Measurement interval"}{" "}
            start · inclusive
          </span>
          <input
            placeholder="2025-04-01T00:00:00Z"
            value={start}
            onChange={(ev) => setStart(ev.target.value)}
          />
        </label>
        <label className="fi-field">
          <span>End · exclusive</span>
          <input
            placeholder="2025-04-08T00:00:00Z"
            value={end}
            onChange={(ev) => setEnd(ev.target.value)}
          />
        </label>
        <label className="fi-field">
          <span>Observed through · explicit UTC/offset</span>
          <input
            placeholder="2025-04-15T00:00:00Z"
            value={cutoff}
            onChange={(ev) => setCutoff(ev.target.value)}
          />
        </label>
        <label className="fi-field fi-file">
          <span>Open a local CSV · max 1 MB</span>
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={(ev) => {
              void read(ev.target.files?.[0]);
            }}
          />
        </label>
      </div>
      <p className="fi-schema-line">
        <code>
          {source === "event_log"
            ? "event_id,user_id,stage,occurred_at[,segment]"
            : "cohort_id,stage,count,grain,window_days,cohort_start,cohort_end,observed_through[,segment]"}
        </code>
      </p>
      <label className="fi-field">
        <span>CSV contents</span>
        <textarea
          className="fi-csv"
          value={text}
          maxLength={MAX_INPUT + 1}
          spellCheck={false}
          onChange={(ev) => {
            readSequence.current++;
            setReading(false);
            setText(ev.target.value);
            setProvenance("imported");
            setFileError("");
          }}
          rows={7}
        />
      </label>
      {source === "aggregate" && (
        <label className="fi-confirm">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(ev) => setConfirmed(ev.target.checked)}
          />
          <span>
            I confirm these counts describe one population and that segments are
            disjoint and exhaustive
            {grain === "cohort_users"
              ? ", with nested distinct users completing ordered stages within the declared window. Every signup has a full observation window"
              : ""}
            . These assumptions cannot be verified from counts.
          </span>
        </label>
      )}
      {source === "aggregate" && grain !== "cohort_users" && (
        <p className="fi-muted">
          Independent counts can increase across stages. Ratios describe
          activity or reach; they cannot estimate user conversion.
        </p>
      )}
      {reading && <p role="status">Reading local file…</p>}
      {fileError && (
        <p role="alert" className="fi-errors">
          {fileError}
        </p>
      )}
      {issues && validFingerprint === fingerprint && (
        <div
          className={
            issues.length
              ? "fi-validation fi-validation-error"
              : "fi-validation"
          }
          role={issues.length ? "alert" : "status"}
        >
          <strong>
            {issues.length
              ? `${issues.length} validation errors · nothing applied`
              : "Validation passed · ready to replace the active dataset"}
          </strong>
          {issues.length > 0 && (
            <ul>
              {issues.slice(0, 40).map((issue, i) => (
                <li key={i}>
                  {issue.row ? `CSV row ${issue.row}: ` : ""}
                  {issue.message}
                </li>
              ))}
            </ul>
          )}
          {issues.length > 40 && (
            <p>
              {issues.length - 40} additional errors. Download the report to
              inspect all rows.
            </p>
          )}
          {issues.length > 0 && (
            <button
              className="fi-text-button"
              onClick={() =>
                downloadText(
                  "frictionlab-validation-errors.txt",
                  issues
                    .map((i) => `${i.row ? `Row ${i.row}: ` : ""}${i.message}`)
                    .join("\n"),
                )
              }
            >
              Download all validation errors
            </button>
          )}
        </div>
      )}
      {issues && validFingerprint !== fingerprint && (
        <p role="status">Input changed. Validate again before applying.</p>
      )}
      <div className="fi-import-actions">
        <button
          className="fi-button"
          disabled={reading || !!fileError}
          onClick={validate}
        >
          <Check size={15} aria-hidden="true" />
          Validate dataset
        </button>
        <button
          className="fi-button fi-dark"
          disabled={!passed || (source === "aggregate" && !confirmed)}
          onClick={() => onReplace(current)}
        >
          Replace active dataset
          <ArrowRight size={15} aria-hidden="true" />
        </button>
        <span className="fi-muted">
          No network upload. No mixing with the sample.
        </span>
      </div>
    </>
  );
}
