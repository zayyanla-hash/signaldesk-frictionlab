import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, Route, Routes, useLocation } from 'react-router-dom';
import { AlertTriangle, ArrowUpRight, X } from 'lucide-react';
import { RiUploadCloud2Line } from '@remixicon/react';
import '@fontsource-variable/dm-sans';
import './frictionlab.css';
import { createSaveTracker, loadStored } from '../lib/storage';
import { downloadText, parseCSV, toCSV } from '../lib/utils';
import { cx } from '@/components/tremor/lib/utils';
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRoot, TableRow } from '@/components/tremor/Table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/tremor/Tabs';
import { Drawer, DrawerBody, DrawerContent, DrawerHeader, DrawerTitle, DrawerTrigger } from '@/components/tremor/Drawer';
import FrictionLabShell from './FrictionLabShell';
import { computeFunnel, eligibleSignupRange, formatDateRangeLabel, funnelSteps, validateEventsRows } from './analytics';
import { applyDecisionEdit, approveDecision, buildIssuePayload, canExportDecision, clearMockSubmissions, decisionToMarkdown, evidenceOrigins, evidenceSnapshot, isApprovalCurrent, mockSubmit, simulateSubmit, type FunnelExportInfo } from './githubAdapter';
import { classifyFeedback, editTheme, feedbackJoinWarnings, matchThemeFeedback } from './evidence';
import { generateMainSample, SAMPLE_FEEDBACK } from './generator';
import { validateFeedbackCSV } from './feedbackImport';
import type { Decision, FeedbackRecord, LabEvent, Theme } from './types';
import { SNAPSHOT_ISO, isDecision, isFeedbackArray, isLabEventArray, isThemeArray } from './types';

const K_EVENTS = 'fl-events-v1';
const K_FEEDBACK = 'fl-feedback-v1';
const K_THEMES = 'fl-themes-v1';
const K_DECISION = 'fl-decision-v1';

export const MAX_EVENTS = 50000;
export const MAX_FEEDBACK = 5000;

const DEFAULT_THEMES: Theme[] = [
  {
    id: 't1',
    title: 'Confusing data-source choice',
    notes: 'Transparent rule: messages mentioning the data source or too many options. Reviewable heuristic, not ground truth.',
    rule: { keywords: ['data source', 'source', 'option'], conflictKeywords: ['source was clear', 'easy to choose'] },
    status: 'draft',
  },
  {
    id: 't2',
    title: 'Setup errors without guidance',
    notes: 'Transparent rule: messages mentioning an error or a confusing setup step. Reviewable heuristic, not ground truth.',
    rule: { keywords: ['error', 'setup', 'stuck', 'confusing'], conflictKeywords: ['setup was smooth', 'no errors'] },
    status: 'reviewed',
  },
  {
    id: 't3',
    title: 'Unclear next step after connect',
    notes: 'Transparent rule: messages mentioning the connection flow, the dashboard, or an unclear next step. Conflicting records (flow described as smooth) are kept visible, never counted as support.',
    rule: { keywords: ['connect', 'next step', 'not clear', 'unclear', 'dashboard'], conflictKeywords: ['flow was smooth', 'no issues', 'no problems', 'worked fine'] },
    status: 'draft',
  },
];

const PROBLEM_OPTIONS = [
  'Hypothesis (unvalidated): new accounts may stall at data connection because source choice is unclear.',
  'Setup errors leave users without a next action.',
  'Users expect immediate value but land on an empty state.',
];

/** The default problem must match whichever funnel stage drops the most
 * accounts (same computation as the Funnel chart), not a fixed guess. This
 * only seeds a fresh install; any persisted user selection always wins. */
function computeDefaultProblem(): string {
  const sample = generateMainSample(42);
  const funnel = computeFunnel(sample.events);
  const steps = funnelSteps(funnel);
  const worst = steps.slice(1).reduce((w, s) => (s.dropped > w.dropped ? s : w), steps[1]);
  if (worst.key === 'first_action') return PROBLEM_OPTIONS[2];
  return PROBLEM_OPTIONS[0];
}

const DEFAULT_DECISION: Decision = {
  problem: computeDefaultProblem(),
  evidence: 'Observed: connected-to-action drop in the eligible cohort, the largest drop in the funnel. Hypothesis (unvalidated): accounts land on an empty state after connecting data and do not find an obvious first action. Correlation is not causation.',
  alternatives: 'A) Guided first-run checklist. B) Pre-populate a sample view. C) Inline empty-state helper.',
  scope: 'Post-connect empty state and first-action prompts only.',
  nonGoals: 'No SSO work, no pricing changes.',
  acceptance: 'User reaches a successful first useful action (query run or view created) without landing on an empty dead-end after connecting.',
  metric: 'Connected-to-first-action rate for eligible cohorts over the next 4 weeks.',
  state: 'draft',
};

interface S {
  events: LabEvent[];
  feedback: FeedbackRecord[];
  themes: Theme[];
  decision: Decision;
  notices: string[];
  saveError: string | null;
  setEvents: (e: LabEvent[]) => void;
  setFeedback: (f: FeedbackRecord[]) => void;
  setThemes: (t: Theme[]) => void;
  editDecision: (patch: Partial<Decision>) => boolean;
  setDecisionState: (s: Decision['state']) => void;
  reset: () => void;
  snapshot: string;
}

function useFLState(): S {
  const initial = useMemo(() => generateMainSample(42), []);
  const sampleFeedback = useMemo(() => [...initial.feedback.slice(0, 20), ...SAMPLE_FEEDBACK], [initial]);
  const [boot] = useState(() => ({
    events: loadStored(K_EVENTS, isLabEventArray, initial.events),
    feedback: loadStored(K_FEEDBACK, isFeedbackArray, sampleFeedback),
    themes: loadStored(K_THEMES, isThemeArray, DEFAULT_THEMES),
    decision: loadStored(K_DECISION, isDecision, DEFAULT_DECISION),
  }));
  const [events, setEventsState] = useState<LabEvent[]>(boot.events.value);
  const [feedback, setFeedbackState] = useState<FeedbackRecord[]>(boot.feedback.value);
  const [themes, setThemesState] = useState<Theme[]>(boot.themes.value);
  const [decision, setDecisionInner] = useState<Decision>(boot.decision.value);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [editNotice, setEditNotice] = useState<string | null>(null);
  const notices = [boot.events.notice, boot.feedback.notice, boot.themes.notice, boot.decision.notice, editNotice].filter(
    (n): n is string => !!n
  );

  // Sticky tracking: a failure on one key followed by successes on other keys
  // must not hide the failure. Warnings stay until every key is durable.
  const [tracker] = useState(() => createSaveTracker());
  const store = (key: string, value: unknown) => {
    tracker.save(key, value);
    setSaveError(tracker.error());
  };
  const setEvents = (e: LabEvent[]) => {
    setEventsState(e);
    store(K_EVENTS, e);
    checkUpstreamEvidence({ events: e, feedback, themes });
  };
  const setFeedback = (f: FeedbackRecord[]) => {
    setFeedbackState(f);
    store(K_FEEDBACK, f);
    checkUpstreamEvidence({ events, feedback: f, themes });
  };
  const setThemes = (t: Theme[]) => {
    setThemesState(t);
    store(K_THEMES, t);
    checkUpstreamEvidence({ events, feedback, themes: t });
  };
  /** Returns true when the edit invalidated a prior approval. */
  const editDecision = (patch: Partial<Decision>): boolean => {
    const { decision: next, invalidated } = applyDecisionEdit(decision, patch);
    setDecisionInner(next);
    store(K_DECISION, next);
    setEditNotice(invalidated ? 'Edits changed the approved contents, so approval was reset to draft. Review and approve again before export.' : null);
    return invalidated;
  };
  // Supporting-evidence changes invalidate an approval whose stamp no longer matches.
  const checkUpstreamEvidence = (next: { events: LabEvent[]; feedback: FeedbackRecord[]; themes: Theme[] }) => {
    if (decision.state !== 'approved') return;
    const snapshot = evidenceSnapshot(next);
    if (!isApprovalCurrent(decision, snapshot)) {
      const reverted = { ...decision, state: 'draft' as const };
      setDecisionInner(reverted);
      store(K_DECISION, reverted);
      setEditNotice('Supporting evidence (events, feedback, or themes) changed, so approval was reset to draft. Review and approve again before export.');
    }
  };
  const setDecisionState = (s: Decision['state']) => {
    if (s === 'approved') {
      const reviewedThemeCount = themes.filter((t) => t.status === 'reviewed').length;
      if (reviewedThemeCount === 0) {
        setEditNotice('Approval refused: at least one evidence theme must be reviewed before approval.');
        return;
      }
      const snapshot = evidenceSnapshot({ events, feedback, themes });
      const r = approveDecision(decision, snapshot);
      if (!r.ok) {
        setEditNotice(`Approval refused: ${r.errors.join(' ')}`);
        return;
      }
      setDecisionInner(r.decision);
      store(K_DECISION, r.decision);
      setEditNotice(null);
      return;
    }
    const next = { ...decision, state: s };
    setDecisionInner(next);
    store(K_DECISION, next);
  };
  const reset = () => {
    setEventsState(initial.events);
    setFeedbackState(sampleFeedback);
    setThemesState(DEFAULT_THEMES);
    setDecisionInner(DEFAULT_DECISION);
    setEditNotice(null);
    store(K_EVENTS, initial.events);
    store(K_FEEDBACK, sampleFeedback);
    store(K_THEMES, DEFAULT_THEMES);
    store(K_DECISION, DEFAULT_DECISION);
  };
  const snapshot = evidenceSnapshot({ events, feedback, themes });
  return { events, feedback, themes, decision, notices, saveError, setEvents, setFeedback, setThemes, editDecision, setDecisionState, reset, snapshot };
}

function StateNotices({ state }: { state: S }) {
  return (
    <div aria-live="polite">
      {state.notices.map((n, i) => (
        <div key={i} className="warn-box" role="status">
          {n}
        </div>
      ))}
      {state.saveError && (
        <div className="error-box" role="alert">
          {state.saveError}
        </div>
      )}
    </div>
  );
}

function originBadge(origin: FeedbackRecord['origin']) {
  return origin === 'user-provided' ? (
    <span className="badge amber fl-token-chip fl-token-chip-amber">User-provided, unverified</span>
  ) : (
    <span className="badge gray fl-token-chip">Synthetic sample</span>
  );
}

const ROUTE_TITLES: Record<string, string> = {
  '/frictionlab': 'Funnel',
  '/frictionlab/': 'Funnel',
  '/frictionlab/evidence': 'Evidence',
  '/frictionlab/decision': 'Decision',
};

export default function FrictionLabApp() {
  const state = useFLState();
  const needsReviewCount = state.themes.filter((t) => t.status !== 'reviewed').length;
  const location = useLocation();
  // Exactly one h1 per page: each route (Funnel, Evidence, Decision) renders
  // its own visible h1 with that page's actual title, so there is no second,
  // hidden, generic "FrictionLab" heading. The document title follows the
  // same per-route name. The "About this demo" disclosure itself lives in
  // FrictionLabShell, visible on every route.
  useEffect(() => {
    const page = ROUTE_TITLES[location.pathname];
    if (page) document.title = `${page} · FrictionLab`;
  }, [location.pathname]);
  return (
    <FrictionLabShell needsReviewCount={needsReviewCount}>
      <main className="fl-app" id="main">
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          <div className="px-4 min-[900px]:px-6"><StateNotices state={state} /></div>
          <Routes>
            <Route index element={<Funnel state={state} />} />
            <Route path="evidence" element={<div className="px-4 py-4 min-[900px]:px-6 min-[900px]:py-6"><Evidence state={state} /></div>} />
            <Route path="decision" element={<div className="px-4 py-4 min-[900px]:px-6 min-[900px]:py-6"><DecisionView state={state} /></div>} />
            <Route path="*" element={<div className="px-4 py-4 min-[900px]:px-6 min-[900px]:py-6"><SectionNotFound /></div>} />
          </Routes>
        </div>
      </main>
    </FrictionLabShell>
  );
}

function SectionNotFound() {
  return (
    <section className="card" role="alert">
      <h2>Section not found</h2>
      <p className="muted">That FrictionLab address does not exist.</p>
      <p>
        <Link className="btn small primary" to="/frictionlab">Back to Funnel</Link>{' '}
        <Link className="btn small" to="/frictionlab/evidence">Evidence</Link>{' '}
        <Link className="btn small" to="/frictionlab/decision">Decision and Handoff</Link>
      </p>
    </section>
  );
}

function Funnel({ state }: { state: S }) {
  const { events, feedback, themes, reset } = state;
  const [eventsText, setEventsText] = useState('event_id,account_id,event_name,occurred_at\ne100,acct-901,signed_up,2025-03-01T10:00:00Z');
  const [importNote, setImportNote] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'dropoffs' | 'findings' | 'events' | 'methodology' | 'quality'>('dropoffs');

  const funnel = useMemo(() => computeFunnel(events), [events]);
  const incompleteIds = useMemo(
    () => funnel.accountSteps.filter((a) => !a.eligible).map((a) => a.account_id),
    [funnel]
  );
  const hasImportedEvents = events.some((e) => e.origin === 'user-provided');

  const doImport = () => {
    const { header, rows, rowStarts, errors, skippedEmpty } = parseCSV(eventsText);
    if (!header.includes('event_id') || !header.includes('account_id') || !header.includes('event_name') || !header.includes('occurred_at')) {
      setImportNote(`Invalid events.csv header. Expected: event_id, account_id, event_name, occurred_at. ${errors.join(' ')}`);
      return;
    }
    const { events: clean, quarantined, skippedEmpty: skippedRows } = validateEventsRows(rows, rowStarts);
    if (state.events.length + clean.length > MAX_EVENTS) {
      setImportNote(`Import refused: ${state.events.length} events stored plus ${clean.length} incoming exceeds the ${MAX_EVENTS} event limit. Nothing was imported.`);
      return;
    }
    const parts = [
      `Imported ${clean.length} rows.`,
      `${quarantined.length} quarantined at import.`,
      `${skippedEmpty + skippedRows} blank lines skipped.`,
      ...errors,
      ...quarantined.slice(0, 3).map((q) => `Row ${q.row}: ${q.reason}`),
    ];
    if (clean.length === 0) {
      setImportNote(`No valid rows. ${parts.slice(1).join(' ')}`);
      return;
    }
    const next = [...state.events, ...clean];
    state.setEvents(next);
    setImportNote(`${parts.join(' ')} Recomputed funnel below; see quarantine table.`);
  };

  // Single canonical per-step view (shared with the Decision rail and
  // exports) so the drop numbers shown everywhere always agree.
  const steps = funnelSteps(funnel);

  const drops = steps.slice(1).map((s) => s.dropped);
  const maxDrop = drops.length ? Math.max(...drops) : 0;
  const worstStepIndex = drops.length ? 1 + drops.indexOf(maxDrop) : 1;

  const [selectedStepIndex, setSelectedStepIndex] = useState(worstStepIndex);
  const currentStep = steps[selectedStepIndex] ?? steps[1];

  const stepDropoffs = useMemo(() => {
    if (selectedStepIndex === 0) {
      return [];
    }
    if (selectedStepIndex === 1) {
      return funnel.accountSteps
        .filter((a) => a.eligible && a.signedUp && !a.connected)
        .map((a) => ({
          accountId: a.account_id,
          signedUp: a.signedUp!,
          lastEventAt: a.signedUp!,
          lastEvent: 'signed_up',
          stage: 'Signed up → Connected data',
          summary: 'Stalled before completing data connection',
        }));
    }
    return funnel.accountSteps
      .filter((a) => a.eligible && a.connected && !a.action)
      .map((a) => ({
        accountId: a.account_id,
        signedUp: a.signedUp!,
        connected: a.connected!,
        lastEventAt: a.connected!,
        lastEvent: 'connected_data',
        stage: 'Connected data → First useful action',
        summary: 'Connected source but did not run query or create view',
      }));
  }, [funnel, selectedStepIndex]);

  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const activeAccountId = selectedAccountId && stepDropoffs.some((d) => d.accountId === selectedAccountId)
    ? selectedAccountId
    : (stepDropoffs[0]?.accountId ?? null);
  const activeDropoff = stepDropoffs.find((d) => d.accountId === activeAccountId) ?? stepDropoffs[0] ?? null;

  const openAccountPanel = (accountId: string) => {
    setSelectedAccountId(accountId);
    setIsPanelOpen(true);
  };
  const closeAccountPanel = () => setIsPanelOpen(false);

  useEffect(() => {
    if (!isPanelOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeAccountPanel();
    };
    window.addEventListener('keydown', onKey);
    panelRef.current?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [isPanelOpen]);

  const [selectedThemeId, setSelectedThemeId] = useState<string | null>(null);
  const activeThemeId = selectedThemeId && themes.some((t) => t.id === selectedThemeId)
    ? selectedThemeId
    : (themes[0]?.id ?? null);
  const activeTheme = themes.find((t) => t.id === activeThemeId) ?? themes[0] ?? null;

  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const activeEventId = selectedEventId && events.some((e) => e.event_id === selectedEventId)
    ? selectedEventId
    : (events[0]?.event_id ?? null);
  const activeEvent = events.find((e) => e.event_id === activeEventId) ?? events[0] ?? null;

  const accountTimeline = useMemo(() => {
    if (!activeDropoff) return [];
    return events
      .filter((e) => e.account_id === activeDropoff.accountId)
      .slice()
      .sort((a, b) => Date.parse(a.occurred_at) - Date.parse(b.occurred_at));
  }, [events, activeDropoff]);

  const missingStepLabel = selectedStepIndex === 1 ? 'connected_data' : 'first_useful_action';

  const linkedFeedbackForAccount = useMemo(() => {
    if (!activeDropoff) return [];
    return feedback.filter(
      (f) => f.account_id === activeDropoff.accountId && classifyFeedback(f, themes).status === 'support'
    );
  }, [feedback, themes, activeDropoff]);

  // Flow-chart geometry, Insights-style: a shared 0..100% axis, dotted
  // gridlines, one column per stage, amber drop ghosts above each column,
  // stage names/counts below the baseline. viewBox: W x CHART_H.
  const W = 720;
  const CW = 104;
  const PH = 280;
  const TOP = 24;
  const B = TOP + PH; // baseline = 0% of cohort
  const CHART_H = 380;
  const n = steps.length;
  const colSpacing = n > 1 ? (W - 120 - CW) / (n - 1) : 0;
  const xs = steps.map((_, i) => 60 + i * colSpacing);
  const heights = steps.map((s) => (PH * s.fromStart) / 100);

  const gridlines = [0, 25, 50, 75, 100].map((pct) => ({
    pct,
    y: B - (PH * pct) / 100,
  }));

  // Converted bars, one per column: translucent when unselected, solid periwinkle when selected.
  const bars = steps.map((s, i) => ({
    key: s.key,
    x: xs[i],
    y: B - heights[i],
    width: CW,
    height: heights[i],
    isSelected: i === selectedStepIndex,
  }));

  // Dropped "ghost" ribbons sitting above bar i, for i >= 1, with a small amber label.
  const ghosts = steps.slice(1).map((s, i) => {
    const idx = i + 1;
    const y = B - heights[idx - 1];
    const height = heights[idx - 1] - heights[idx];
    const label = `−${s.dropped} · ${s.dropPct}%`;
    const chipWidth = label.length * 6.4 + 14;
    return {
      key: s.key,
      x: xs[idx],
      y,
      width: CW,
      height,
      stepIndex: idx,
      isWorst: idx === worstStepIndex,
      label,
      chipWidth,
      labelX: xs[idx] + CW / 2,
      labelY: Math.max(y - 12, TOP - 4),
    };
  });

  // Narrative findings (left column), derived only from data already computed above.
  const worstStep = steps[worstStepIndex];
  const quarantinedTotal = funnel.quarantined.reduce((sum, q) => sum + q.count, 0);
  const topThemes = themes.slice(0, 2).map((t) => {
    const m = matchThemeFeedback(t, feedback);
    return { theme: t, linked: m.supporting, uniqueAccounts: m.uniqueAccounts };
  });

  const timeInStepHours = (iso: string) => Math.round(((Date.parse(SNAPSHOT_ISO) - Date.parse(iso)) / 3600000) * 10) / 10;

  // Reporting window: derived from the eligible cohort's actual signup
  // dates, never a hardcoded string. Recomputes whenever events change.
  const reportingWindowLabel = formatDateRangeLabel(eligibleSignupRange(funnel));

  const chipRow = (
    <div className="fl-chip-row">
      <span className="fl-chip">7-day window</span>
      <span className="fl-chip">{reportingWindowLabel}</span>
      <span className="fl-chip">{hasImportedEvents ? 'Sample + imported rows' : 'Synthetic sample'}</span>
      <Drawer open={importOpen} onOpenChange={setImportOpen}>
        <DrawerTrigger asChild>
          <button type="button" className="fl-chip fl-chip-interactive">
            <RiUploadCloud2Line className="size-3.5" aria-hidden="true" />
            Import events
          </button>
        </DrawerTrigger>
        <DrawerContent side="right">
          <DrawerHeader>
            <DrawerTitle>Data source: import events.csv</DrawerTitle>
          </DrawerHeader>
          <DrawerBody className="flex flex-col gap-3">
            <p className="font-mono text-xs text-[var(--fl-text-subtle)]">
              event_id, account_id, event_name, occurred_at (explicit timezone required)
            </p>
            <div className="field flex flex-col gap-1">
              <label htmlFor="fl-events" className="text-xs font-medium text-[var(--fl-text-subtle)]">
                Paste CSV
              </label>
              <textarea
                id="fl-events"
                value={eventsText}
                onChange={(e) => setEventsText(e.target.value)}
                className="h-32 w-full rounded-md border border-[var(--fl-border)] bg-white p-2 font-mono text-xs text-[var(--fl-text)] outline-none focus:border-[var(--fl-amber)]"
              />
            </div>
            <div className="toolbar flex flex-wrap gap-2 pt-1">
              <button className="btn primary small" onClick={doImport}>
                Validate and add
              </button>
              <button
                className="btn small"
                onClick={() => {
                  setEventsText('event_id,account_id,event_name,occurred_at\neBAD,,bogus,not-a-date');
                }}
              >
                Load invalid example
              </button>
              <button className="btn small" onClick={reset}>
                Reset sample
              </button>
            </div>
            {importNote && (
              <p className="small text-xs" role="status">
                {importNote}
              </p>
            )}
            <p className="small muted text-xs text-[var(--fl-text-faint)]">
              Imported data stays in this browser only. Counts recompute in code, never from model output.
            </p>
          </DrawerBody>
        </DrawerContent>
      </Drawer>
    </div>
  );

  const metricStrip = (
    <div className="fl-metric-strip">
      <div className="fl-metric-primary">
        <span className="fl-metric-label">Overall conversion</span>
        <div className="fl-type-hero">{funnel.rates.signupToAction}%</div>
        <span className="fl-type-label">{funnel.stepCounts.first_action} of {funnel.eligible} eligible accounts</span>
      </div>
      <div className="fl-metric-secondary">
        <span className="fl-metric-label">Median time to value</span>
        <div className="fl-type-secondary">{funnel.medianTTVHours !== null ? `${funnel.medianTTVHours}h` : 'n/a'}</div>
        <span className="fl-type-label">n = {funnel.ttvDenominator} activated</span>
      </div>
      <div className="fl-metric-secondary">
        <span className="fl-metric-label">Eligible cohort</span>
        <div className="fl-type-secondary">{funnel.eligible}</div>
        <span className="fl-type-label">accounts in the 7-day window</span>
      </div>
    </div>
  );

  const narrativeRows = (
    <div>
      <div className="fl-narrative-row">
        <ArrowUpRight className="fl-narrative-arrow" aria-hidden="true" />
        <div>
          <p className="fl-narrative-title">Largest drop</p>
          <p className="fl-narrative-text">
            <span className="fl-token-chip">{worstStep?.label}</span> lost{' '}
            <span className="fl-token-chip fl-token-chip-amber">&minus;{worstStep?.dropped} accounts</span>{' '}
            (<span className="fl-token-chip fl-token-chip-amber">{worstStep?.dropPct}%</span>), the biggest drop in this funnel.
          </p>
        </div>
      </div>
      <div className="fl-narrative-row">
        <ArrowUpRight className="fl-narrative-arrow" aria-hidden="true" />
        <div>
          <p className="fl-narrative-title">Time to value</p>
          <p className="fl-narrative-text">
            Accounts that activate take a median of{' '}
            <span className="fl-token-chip">{funnel.medianTTVHours !== null ? `${funnel.medianTTVHours}h` : 'n/a'}</span> to reach first
            useful action (<span className="fl-token-chip">n = {funnel.ttvDenominator}</span>).
          </p>
        </div>
      </div>
      <div className="fl-narrative-row">
        <ArrowUpRight className="fl-narrative-arrow" aria-hidden="true" />
        <div>
          <p className="fl-narrative-title">Feedback themes</p>
          <p className="fl-narrative-text">
            {topThemes.length === 0 ? (
              'No feedback themes recorded yet.'
            ) : (
              <>
                {topThemes.map(({ theme, linked, uniqueAccounts }, i) => (
                  <span key={theme.id}>
                    {i > 0 ? ', ' : ''}
                    <span className="fl-token-chip">{theme.title}</span>{' '}
                    (<span className="fl-token-chip">{linked.length} {linked.length === 1 ? 'message' : 'messages'}</span>,{' '}
                    <span className="fl-token-chip">{uniqueAccounts} {uniqueAccounts === 1 ? 'account' : 'accounts'}</span>)
                  </span>
                ))}
                . Reviewable heuristics linked by account, not a causal claim.
              </>
            )}
          </p>
        </div>
      </div>
      <div className="fl-narrative-row">
        <ArrowUpRight className="fl-narrative-arrow" aria-hidden="true" />
        <div>
          <p className="fl-narrative-title">Data quality</p>
          <p className="fl-narrative-text">
            <span className="fl-token-chip">{funnel.incomplete} accounts</span> sit in an incomplete observation window and are
            excluded from the cohort; <span className="fl-token-chip">{quarantinedTotal} records</span> were quarantined at
            import.
          </p>
        </div>
      </div>
    </div>
  );

  const chart = (
    <div className="fl-flow-chart">
      <svg
        className="fl-flow-svg"
        viewBox={`0 0 ${W} ${CHART_H}`}
        preserveAspectRatio="xMidYMid meet"
        aria-hidden="true"
      >
        <defs>
          <pattern id="fl-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="6" height="6" fill="var(--fl-amber-soft)" />
            <line x1="0" y1="0" x2="0" y2="6" stroke="var(--fl-amber)" strokeOpacity="0.55" strokeWidth="1.4" />
          </pattern>
        </defs>

        {/* Selected-stage highlight band, Insights-style */}
        <rect
          className="fl-select-band"
          x={xs[selectedStepIndex] - 14}
          y={0}
          width={CW + 28}
          height={CHART_H}
        />

        {/* Dotted gridlines with muted % axis labels */}
        {gridlines.map((g) => (
          <g key={g.pct}>
            <line x1={0} y1={g.y} x2={W} y2={g.y} className="fl-gridline" />
            <text x={4} y={g.y - 4} className="fl-axis-label">{g.pct}%</text>
          </g>
        ))}

        {bars.map((b) => (
          <rect
            key={b.key}
            className={b.isSelected ? 'fl-bar-fill-selected' : 'fl-bar-fill'}
            x={b.x}
            y={b.y}
            width={b.width}
            height={b.height}
            rx={3}
          />
        ))}
        {ghosts.map((g) => (
          <rect key={g.key} x={g.x} y={g.y} width={g.width} height={g.height} rx={3} fill="url(#fl-hatch)" />
        ))}
        {ghosts.map((g) => (
          <g key={`${g.key}-label`}>
            <rect x={g.labelX - g.chipWidth / 2} y={g.labelY - 14} width={g.chipWidth} height={18} rx={4} className="fl-drop-chip" />
            <text x={g.labelX} y={g.labelY - 1} textAnchor="middle" className={cx('fl-drop-text', g.isWorst && 'fl-drop-text-worst')}>
              {g.label}
            </text>
          </g>
        ))}

        {steps.map((s, idx) => {
          const isSelected = selectedStepIndex === idx;
          return (
            <g key={s.key} className={cx('fl-col-outline', isSelected && 'fl-col-outline-selected')}>
              <rect x={xs[idx] - 12} y={2} width={CW + 24} height={CHART_H - 4} rx={6} />
            </g>
          );
        })}

        {steps.map((s, idx) => {
          const colCx = xs[idx] + CW / 2;
          return (
            <g key={s.key}>
              <text x={colCx} y={B + 22} textAnchor="middle" className="fl-label-name">
                {s.label}
              </text>
              <text x={colCx} y={B + 42} textAnchor="middle" className="fl-label-pct">
                {s.converted} &middot; {s.fromStart}%
              </text>
            </g>
          );
        })}
      </svg>
      {steps.map((s, idx) => {
        const isSelected = selectedStepIndex === idx;
        const leftPct = ((xs[idx] - 12) / W) * 100;
        const widthPct = ((CW + 24) / W) * 100;
        return (
          <button
            key={s.key}
            type="button"
            onClick={() => setSelectedStepIndex(idx)}
            aria-pressed={isSelected}
            className="fl-stage-btn"
            style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
          >
            <span className="sr-only">
              {s.label}: {s.converted} accounts, {s.fromStart}% of cohort
            </span>
          </button>
        );
      })}
    </div>
  );

  const mobileBars = (
    <div className="flex flex-col">
      {steps.map((s, idx) => (
        <div key={s.key}>
          <button
            type="button"
            onClick={() => setSelectedStepIndex(idx)}
            aria-pressed={selectedStepIndex === idx}
            className="fl-stage-row-btn"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="fl-stage-name">{s.label}</span>
              <span className="fl-stage-count">{s.converted}</span>
            </div>
            <div className="fl-stage-row-track">
              <div className="fl-stage-row-fill" style={{ width: `${s.fromStart}%` }} />
            </div>
            <span className="fl-stage-pct">{s.fromStart}% of cohort</span>
          </button>
          {idx < steps.length - 1 && (
            <div className={cx('fl-stage-row-drop', idx + 1 === worstStepIndex && 'fl-stage-row-drop-worst')}>
              &minus;{steps[idx + 1].dropped} &middot; {steps[idx + 1].dropPct}% dropped
            </div>
          )}
        </div>
      ))}
    </div>
  );

  const accountDetailPanel = isPanelOpen && activeDropoff && (
    <div
      ref={panelRef}
      className="fl-detail-panel"
      role="dialog"
      aria-modal="true"
      aria-label={`Account ${activeDropoff.accountId} detail`}
      tabIndex={-1}
    >
      <div className="fl-detail-panel-header">
        <span className="fl-mono text-[15px] font-medium text-[var(--fl-text)]">{activeDropoff.accountId}</span>
        <button type="button" className="fl-detail-close" onClick={closeAccountPanel} aria-label="Close account detail">
          <X className="size-4" aria-hidden="true" />
        </button>
      </div>
      <div className="fl-detail-panel-body">
        <span className="fl-status-chip">Stalled at {currentStep.label}</span>
        <div className="fl-timeline">
          {accountTimeline.map((e) => (
            <div className="fl-timeline-item" key={e.event_id}>
              <span className="fl-timeline-dot" aria-hidden="true" />
              <span className="fl-timeline-ts">{e.occurred_at.slice(0, 16).replace('T', ' ')}Z</span>
              <span className="fl-timeline-name">{e.event_name}</span>
            </div>
          ))}
          <div className="fl-timeline-item">
            <span className="fl-timeline-dot fl-timeline-dot-missing" aria-hidden="true" />
            <span className="fl-timeline-missing-label">{missingStepLabel} not observed within 7 days</span>
          </div>
        </div>
        <div>
          <span className="fl-type-section">Linked feedback</span>
          {linkedFeedbackForAccount.length === 0 ? (
            <p className="fl-type-body mt-1">No feedback linked to this account.</p>
          ) : (
            <div className="mt-1 flex flex-col gap-2">
              {linkedFeedbackForAccount.map((f) => (
                <p key={f.feedback_id} className="fl-type-body">&ldquo;{f.text}&rdquo;</p>
              ))}
            </div>
          )}
        </div>
        <div>
          <span className="fl-type-section">Facts</span>
          <div className="mt-1">
            <div className="fl-fact-row">
              <span className="fl-fact-label">Signup</span>
              <span className="fl-fact-value">{activeDropoff.signedUp.slice(0, 10)}</span>
            </div>
            <div className="fl-fact-row">
              <span className="fl-fact-label">Last event</span>
              <span className="fl-fact-value">{activeDropoff.lastEvent}</span>
            </div>
            <div className="fl-fact-row">
              <span className="fl-fact-label">Time in step</span>
              <span className="fl-fact-value">{timeInStepHours(activeDropoff.lastEventAt)}h</span>
            </div>
            <div className="fl-fact-row">
              <span className="fl-fact-label">Window</span>
              <span className="fl-fact-value">7 days (complete)</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <section aria-label="Funnel" className="fl-app flex flex-col">
      {/* 1. Header: title, chips */}
      <div className="flex flex-col gap-4 border-b border-[var(--fl-border)] bg-transparent px-4 py-5 min-[900px]:px-6">
        <h1 className="fl-type-title">Signup to first useful action</h1>
        {chipRow}
      </div>

      {/* 2. Metric strip, then body split: narrative left, chart right (mobile: metric, bars, narrative, list) */}
      <div className="flex flex-col gap-6 px-4 py-5 min-[900px]:px-6 min-[900px]:py-6">
        {metricStrip}

        {/* Desktop (>=900px): narrative left (32%), chart right (68%), side by side */}
        <div className="hidden min-[900px]:flex min-[900px]:flex-row min-[900px]:gap-8">
          <div className="min-[900px]:w-[32%] min-[900px]:shrink-0">{narrativeRows}</div>
          <div className="min-[900px]:w-[68%] min-[900px]:flex-1">{chart}</div>
        </div>

        {/* Tablet (700-899px): chart full width, narrative below */}
        <div className="hidden min-[700px]:flex min-[700px]:flex-col min-[700px]:gap-6 min-[900px]:hidden">
          {chart}
          {narrativeRows}
        </div>

        {/* Mobile (<700px): metric already above, then horizontal bars, then narrative */}
        <div className="flex flex-col gap-6 min-[700px]:hidden">
          {mobileBars}
          {narrativeRows}
        </div>
      </div>

      {/* 3. Investigation workspace */}
      <div className="fl-workspace-container border-t border-[var(--fl-border)] bg-transparent px-4 py-4 min-[900px]:px-6 min-[900px]:py-5">
        <p className="fl-context-line mb-3">
          Accounts that stalled at <strong>{currentStep.label}</strong> &middot; {stepDropoffs.length} accounts did not complete within 7 days
        </p>
        <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v as typeof activeTab); setIsPanelOpen(false); }} className="flex flex-col">
          <TabsList className="fl-tabbar border-b border-[var(--fl-border)]">
            <TabsTrigger value="dropoffs">Drop-offs ({stepDropoffs.length})</TabsTrigger>
            <TabsTrigger value="findings">Findings ({themes.length})</TabsTrigger>
            <TabsTrigger value="events">Raw events ({events.length})</TabsTrigger>
            <TabsTrigger value="methodology">Methodology</TabsTrigger>
            <TabsTrigger value="quality">Data quality ({funnel.quarantined.length + (funnel.incomplete > 0 ? 1 : 0)})</TabsTrigger>
          </TabsList>

          {/* TAB 1: DROP-OFFS */}
          <TabsContent value="dropoffs" forceMount className="pt-4">
            <p className="fl-type-section mb-2">
              {stepDropoffs.length} accounts at step {currentStep.stepNum}
            </p>
            {stepDropoffs.length === 0 ? (
              <p className="fl-type-body py-6 text-center">
                No accounts dropped off here. Select a later stage to inspect drop-offs.
              </p>
            ) : (
              <div className="max-h-[420px] overflow-y-auto">
                {stepDropoffs.map((d) => (
                  <button
                    key={d.accountId}
                    type="button"
                    onClick={() => openAccountPanel(d.accountId)}
                    data-selected={isPanelOpen && activeAccountId === d.accountId}
                    className="fl-txn-row"
                  >
                    <span className="fl-mono fl-txn-id">{d.accountId}</span>
                    <span className="fl-txn-event">{d.lastEvent}</span>
                    <span className="fl-mono fl-txn-date">{d.signedUp.slice(0, 10)}</span>
                    <span className="fl-mono fl-txn-time">{timeInStepHours(d.lastEventAt)}h</span>
                  </button>
                ))}
              </div>
            )}
            {accountDetailPanel}
          </TabsContent>

          {/* TAB 2: FINDINGS */}
          <TabsContent value="findings" forceMount className="pt-4">
            <div className="flex flex-col gap-5 min-[900px]:flex-row">
              <div className="min-[900px]:w-[60%]">
                <p className="fl-type-section mb-2">Evidence themes</p>
                <div className="max-h-[360px] overflow-y-auto">
                  {themes.map((t) => {
                    const stats = matchThemeFeedback(t, feedback);
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setSelectedThemeId(t.id)}
                        data-selected={activeThemeId === t.id}
                        className="fl-dense-row-btn"
                      >
                        <span className={cx('fl-dot', t.status === 'reviewed' ? 'fl-dot-slate' : 'fl-dot-amber')} aria-hidden="true" />
                        <span className="min-w-0 flex-1 truncate text-xs font-semibold text-[var(--fl-text)]">{t.title}</span>
                        <span className="fl-mono shrink-0 text-xs text-[var(--fl-text-faint)]">{stats.supporting.length} msg</span>
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="min-[900px]:w-[40%] min-[900px]:border-l min-[900px]:border-[var(--fl-border)] min-[900px]:pl-5">
                {activeTheme ? (
                  <div className="flex flex-col gap-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[15px] font-semibold text-[var(--fl-text)]">{activeTheme.title}</span>
                      <Link to="/frictionlab/evidence" className="text-xs font-medium text-[var(--fl-amber-strong)] hover:underline">
                        Open Evidence
                      </Link>
                    </div>
                    <span className="fl-type-section">Linked feedback</span>
                    <div className="flex flex-col gap-2">
                      {matchThemeFeedback(activeTheme, feedback).supporting.map((fb) => (
                        <div key={fb.feedback_id} className="rounded border border-[var(--fl-border)] p-2.5 text-xs">
                          <div className="flex items-center justify-between text-[11px] text-[var(--fl-text-faint)]">
                            <span className="fl-mono font-medium text-[var(--fl-text)]">{fb.account_id}</span>
                            <span>{fb.received_at.slice(0, 10)}</span>
                          </div>
                          <p className="mt-1 text-[var(--fl-text)]">&ldquo;{fb.text}&rdquo;</p>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="fl-type-body py-6 text-center">Select a theme to inspect linked records.</p>
                )}
              </div>
            </div>
          </TabsContent>

          {/* TAB 3: RAW EVENTS */}
          <TabsContent value="events" forceMount className="pt-4">
            <div className="flex flex-col gap-5 min-[900px]:flex-row">
              <div className="min-[900px]:w-[60%]">
                <p className="fl-type-section mb-2">{events.length} validated {hasImportedEvents ? '' : 'synthetic '}events</p>
                <div className="max-h-[360px] overflow-y-auto">
                  {events.slice(0, 80).map((e) => (
                    <button
                      key={e.event_id}
                      type="button"
                      onClick={() => setSelectedEventId(e.event_id)}
                      data-selected={activeEventId === e.event_id}
                      className="fl-dense-row-btn"
                    >
                      <span className="fl-mono shrink-0 text-[var(--fl-text-faint)]">{e.event_id}</span>
                      <span className="fl-mono shrink-0 font-medium text-[var(--fl-text)]">{e.account_id}</span>
                      <span className="min-w-0 flex-1 truncate text-xs text-[var(--fl-slate)]">{e.event_name}</span>
                      <span className="fl-mono shrink-0 text-[11px] text-[var(--fl-text-faint)]">{e.occurred_at}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="min-[900px]:w-[40%] min-[900px]:border-l min-[900px]:border-[var(--fl-border)] min-[900px]:pl-5">
                {activeEvent ? (
                  <div className="flex flex-col gap-3">
                    <div className="fl-timeline">
                      <div className="fl-timeline-item">
                        <span className="fl-timeline-dot" aria-hidden="true" />
                        <span className="fl-timeline-ts">{activeEvent.occurred_at}</span>
                        <span className="fl-timeline-name">{activeEvent.event_name}</span>
                      </div>
                    </div>
                    <div className="fl-fact-row">
                      <span className="fl-fact-label">account_id</span>
                      <span className="fl-fact-value">{activeEvent.account_id}</span>
                    </div>
                    <div className="fl-fact-row">
                      <span className="fl-fact-label">origin</span>
                      <span className="fl-fact-value">{activeEvent.origin ?? 'synthetic'}</span>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </TabsContent>

          {/* TAB 4: METHODOLOGY */}
          <TabsContent value="methodology" forceMount className="max-h-[380px] overflow-y-auto pt-4">
            <div className="flex max-w-2xl flex-col gap-3 text-xs leading-relaxed text-[var(--fl-text-subtle)]">
              <p className="fl-type-section">Deterministic funnel contract and invariants</p>
              <ul className="fl-bullet-list flex flex-col gap-2">
                <li>
                  <strong>Explicit timezone normalization:</strong> All timestamps require ISO-8601 with explicit Z or &plusmn;HH:MM offsets. Naive timestamps are isolated to quarantine.
                </li>
                <li>
                  <strong>Snapshot boundary ({SNAPSHOT_ISO}):</strong> Events occurring after the fixed snapshot timestamp are ignored to preserve historical determinism.
                </li>
                <li>
                  <strong>Full 7-day window:</strong> Accounts are eligible for cohort analysis only after a full 7 days have elapsed since their signup timestamp.
                </li>
                <li>
                  <strong>Strict sequential progression:</strong> Downstream steps (data connection, first action) must occur strictly after prerequisite steps within the window.
                </li>
                <li>
                  <strong>Account-level aggregation:</strong> Metrics count unique accounts, not aggregate event ping volume. Duplicates by event_id are ignored after validation.
                </li>
                <li>
                  <strong>Zero silent drops:</strong> Invalid rows are tracked with explicit units (events or accounts) in the quarantine register.
                </li>
              </ul>
            </div>
          </TabsContent>

          {/* TAB 5: DATA QUALITY */}
          <TabsContent value="quality" forceMount className="max-h-[380px] overflow-y-auto pt-4">
            <div className="flex max-w-3xl flex-col gap-4">
              <div className="warn-box fl-cohort-note rounded border border-amber-200 p-3 text-xs" style={{ background: 'var(--fl-amber-soft)' }} role="status">
                <AlertTriangle className="icon size-4 shrink-0" aria-hidden="true" />
                <div className="fl-cohort-note-body flex flex-col gap-1">
                  <p className="font-medium" style={{ color: 'var(--fl-amber-strong)' }}>
                    {funnel.incomplete} accounts are in an incomplete observation window and shown separately. Eligible cohort: {funnel.eligible}. Median time to value uses {funnel.ttvDenominator} activated accounts only{funnel.medianTTVHours !== null ? `: ${funnel.medianTTVHours}h` : ' (none yet)'}.
                  </p>
                  {incompleteIds.length > 0 && (
                    <p className="fl-mono text-[11px]">
                      Incomplete accounts: {incompleteIds.slice(0, 12).join(', ')}
                      {incompleteIds.length > 12 ? ` and ${incompleteIds.length - 12} more` : ''}.
                    </p>
                  )}
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <p className="fl-type-section">Quarantine accounting</p>
                {funnel.quarantined.length === 0 ? (
                  <p className="fl-type-body">No quarantined records in current dataset.</p>
                ) : (
                  <TableRoot>
                    <Table>
                      <TableHead>
                        <TableRow>
                          <TableHeaderCell>Reason</TableHeaderCell>
                          <TableHeaderCell className="text-right">Count</TableHeaderCell>
                          <TableHeaderCell>Unit</TableHeaderCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {funnel.quarantined.map((q, i) => (
                          <TableRow key={i}>
                            <TableCell>{q.reason}</TableCell>
                            <TableCell className="text-right tabular-nums">{q.count}</TableCell>
                            <TableCell>{q.unit}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableRoot>
                )}
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </section>
  );
}

function Evidence({ state }: { state: S }) {
  const { feedback, themes, setThemes, setFeedback, events } = state;
  const [showReviewedOnly, setShowReviewedOnly] = useState(false);
  const [feedbackText, setFeedbackText] = useState('feedback_id,account_id,text,received_at\nf900,acct-001,The source picker was confusing.,2025-03-05T12:00:00Z');
  const [importNote, setImportNote] = useState<string | null>(null);
  const [expandedAccount, setExpandedAccount] = useState<string | null>(null);
  const [themeNotice, setThemeNotice] = useState<string | null>(null);
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);

  const funnel = useMemo(() => computeFunnel(events), [events]);
  const accountStepByAccount = useMemo(() => new Map(funnel.accountSteps.map((a) => [a.account_id, a])), [funnel]);
  const eventsByAccount = useMemo(() => {
    const m = new Map<string, LabEvent[]>();
    events.forEach((e) => {
      const list = m.get(e.account_id) ?? [];
      list.push(e);
      m.set(e.account_id, list);
    });
    m.forEach((list) => list.sort((a, b) => Date.parse(a.occurred_at) - Date.parse(b.occurred_at)));
    return m;
  }, [events]);

  const themeStats = useMemo(() => {
    return themes.map((t) => ({ theme: t, ...matchThemeFeedback(t, feedback) }));
  }, [themes, feedback]);

  const classifications = useMemo(() => {
    const m = new Map<string, ReturnType<typeof classifyFeedback>>();
    feedback.forEach((f) => m.set(f.feedback_id, classifyFeedback(f, themes)));
    return m;
  }, [feedback, themes]);

  const joinWarnings = useMemo(() => {
    const m = new Map<string, string>();
    feedbackJoinWarnings(feedback, events).forEach((w) => m.set(w.feedback_id, w.warning));
    return m;
  }, [feedback, events]);

  const updateTheme = (id: string, patch: Partial<Theme>) => {
    const next = themes.map((t) => (t.id === id ? editTheme(t, patch).theme : t));
    const changed = themes.find((t) => t.id === id);
    setThemes(next);
    setThemeNotice(
      changed && changed.status === 'reviewed' && editTheme(changed, patch).invalidated
        ? 'Theme edits returned this reviewed theme to draft. Review it again before relying on it.'
        : null
    );
  };

  const doImport = () => {
    const { header, errors, skippedEmpty } = parseCSV(feedbackText);
    if (!header.includes('feedback_id') || !header.includes('account_id') || !header.includes('text') || !header.includes('received_at')) {
      setImportNote(`Invalid feedback.csv header. Expected: feedback_id, account_id, text, received_at. ${errors.join(' ')}`);
      return;
    }
    const knownAccountIds = new Set(events.map((e) => e.account_id));
    const existingIds = new Set(feedback.map((f) => f.feedback_id));
    const r = validateFeedbackCSV(feedbackText, { knownAccountIds, existingIds });
    if (feedback.length + r.records.length > MAX_FEEDBACK) {
      setImportNote(`Import refused: ${feedback.length} records stored plus ${r.records.length} incoming exceeds the ${MAX_FEEDBACK} feedback limit. Nothing was imported.`);
      return;
    }
    const parts = [
      `Imported ${r.records.length} records (labeled user-provided, unverified).`,
      `${r.quarantined.length} quarantined.`,
      `${r.skippedEmpty + skippedEmpty} blank lines skipped.`,
      ...r.parseErrors,
      ...r.quarantined.slice(0, 4).map((q) => `Row ${q.row} (${q.feedback_id}): ${q.reason}`),
    ];
    if (r.records.length > 0) setFeedback([...feedback, ...r.records]);
    setImportNote(parts.join(' '));
  };

  const visible = feedback.filter((f) => {
    if (!showReviewedOnly) return true;
    const c = classifications.get(f.feedback_id);
    if (!c || c.status !== 'support' || !c.themeId) return false;
    return themes.some((t) => t.id === c.themeId && t.status === 'reviewed');
  });

  const [selectedThemeId, setSelectedThemeId] = useState<string>(themes[0]?.id ?? 't1');
  const activeTheme = themes.find((t) => t.id === selectedThemeId) ?? themes[0];
  const activeStats = activeTheme ? matchThemeFeedback(activeTheme, feedback) : { supporting: [], conflicting: [], uniqueAccounts: 0 };
  const reviewedCount = themes.filter((t) => t.status === 'reviewed').length;

  const themeFunnelStage = (t: Theme): string | null => {
    for (const fb of matchThemeFeedback(t, feedback).supporting) {
      const a = accountStepByAccount.get(fb.account_id);
      if (!a || !a.eligible) continue;
      if (a.signedUp && !a.connected) return 'Signed up → Connected data';
      if (a.connected && !a.action) return 'Connected data → First action';
    }
    return null;
  };

  const openTheme = (id: string) => {
    setSelectedThemeId(id);
    setIsPanelOpen(true);
  };
  const closePanel = () => setIsPanelOpen(false);

  useEffect(() => {
    if (!isPanelOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closePanel();
    };
    window.addEventListener('keydown', onKey);
    panelRef.current?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [isPanelOpen]);

  const datasetChipLabel = feedback.some((f) => f.origin === 'user-provided') ? 'Sample + imported records' : 'Synthetic sample';

  // Import controls stay inline and visible (not behind a drawer trigger) so
  // automated checks and operators can reach them directly from this page.
  const importPanel = (
    <div id="fl-import-feedback" className="fl-field-row">
      <div className="flex items-center justify-between gap-2">
        <span className="fl-field-label">Import feedback.csv</span>
        <span className="fl-type-label fl-mono">feedback_id, account_id, text, received_at</span>
      </div>
      <div className="field flex flex-col gap-1">
        <label htmlFor="fl-feedback" className="fl-type-label">
          Paste CSV
        </label>
        <textarea
          id="fl-feedback"
          value={feedbackText}
          onChange={(e) => setFeedbackText(e.target.value)}
          style={{ minHeight: 84 }}
          className="fl-field-textarea fl-mono"
        />
      </div>
      <div className="toolbar flex flex-wrap gap-2 pt-1">
        <button className="btn primary small" onClick={doImport}>
          Validate and add
        </button>
        <button
          className="btn small"
          onClick={() => {
            setFeedbackText('feedback_id,account_id,text,received_at\nfbad,,,\n');
          }}
        >
          Load invalid example
        </button>
      </div>
      {importNote && (
        <div className="warn-box mt-1" role="status">
          {importNote}
        </div>
      )}
      <p className="fl-type-label">Imported data stays in this browser only, labeled user-provided and unverified.</p>
    </div>
  );

  const detailContent = activeTheme && (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2">
          <span className={cx('fl-dot', activeTheme.status === 'reviewed' ? 'fl-dot-slate' : 'fl-dot-amber')} aria-hidden="true" />
          <span className="fl-state-chip fl-state-chip-on">{activeTheme.status}</span>
        </span>
        <button
          type="button"
          className="btn small"
          onClick={() => updateTheme(activeTheme.id, { status: activeTheme.status === 'reviewed' ? 'draft' : 'reviewed' })}
        >
          {activeTheme.status === 'reviewed' ? 'Unreview' : 'Mark reviewed'}
        </button>
      </div>

      <div className="field flex flex-col gap-1">
        <label htmlFor={`fl-theme-${activeTheme.id}`} className="fl-field-label">
          Title
        </label>
        <input
          id={`fl-theme-${activeTheme.id}`}
          type="text"
          value={activeTheme.title}
          onChange={(e) => updateTheme(activeTheme.id, { title: e.target.value })}
          className="fl-field-textarea"
        />
      </div>
      <div className="field flex flex-col gap-1">
        <label htmlFor={`fl-notes-${activeTheme.id}`} className="fl-field-label">
          Notes
        </label>
        <textarea
          id={`fl-notes-${activeTheme.id}`}
          value={activeTheme.notes}
          onChange={(e) => updateTheme(activeTheme.id, { notes: e.target.value })}
          className="fl-field-textarea"
          rows={2}
        />
      </div>
      <div className="field flex flex-col gap-1">
        <label htmlFor={`fl-keywords-${activeTheme.id}`} className="fl-field-label">
          Rule: keywords (comma separated, case-insensitive substring match)
        </label>
        <input
          id={`fl-keywords-${activeTheme.id}`}
          type="text"
          value={activeTheme.rule.keywords.join(', ')}
          onChange={(e) =>
            updateTheme(activeTheme.id, {
              rule: { ...activeTheme.rule, keywords: e.target.value.split(',').map((x) => x.trim()).filter(Boolean) },
            })
          }
          className="fl-field-textarea fl-mono"
        />
      </div>
      <div className="field flex flex-col gap-1">
        <label htmlFor={`fl-conflicts-${activeTheme.id}`} className="fl-field-label">
          Rule: conflict phrases (comma separated; a keyword match plus a conflict phrase counts as conflicting, not support)
        </label>
        <input
          id={`fl-conflicts-${activeTheme.id}`}
          type="text"
          value={activeTheme.rule.conflictKeywords.join(', ')}
          onChange={(e) =>
            updateTheme(activeTheme.id, {
              rule: { ...activeTheme.rule, conflictKeywords: e.target.value.split(',').map((x) => x.trim()).filter(Boolean) },
            })
          }
          className="fl-field-textarea fl-mono"
        />
      </div>
      <p className="fl-type-label">
        Matching rule: keywords [{activeTheme.rule.keywords.join(', ') || 'none'}]; conflicts [{activeTheme.rule.conflictKeywords.join(', ') || 'none'}]
      </p>
      <p className="fl-type-label">
        {activeStats.supporting.length} supporting messages, {activeStats.uniqueAccounts} unique accounts, {activeStats.conflicting.length} conflicting.
      </p>

      <div>
        <span className="fl-type-section">Supporting feedback</span>
        <div className="mt-1">
          {activeStats.supporting.length === 0 ? (
            <p className="fl-type-body py-2">No feedback matches this theme&rsquo;s rule.</p>
          ) : (
            activeStats.supporting.map((f) => {
              const warning = joinWarnings.get(f.feedback_id);
              return (
                <div key={f.feedback_id} className="fl-quote-row">
                  <div className="fl-quote-meta">
                    <span className="fl-mono" style={{ fontSize: 12, fontWeight: 500, color: 'var(--fl-text)' }}>
                      {f.account_id}
                    </span>
                    <span className="fl-type-label">{f.received_at.slice(0, 10)}</span>
                  </div>
                  <p className="fl-quote-text">&ldquo;{f.text}&rdquo;</p>
                  <div className="mt-1.5 flex items-center gap-2">
                    {originBadge(f.origin)}
                    {warning && <span className="fl-type-label" style={{ color: 'var(--fl-amber-strong)' }}>{warning}</span>}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {activeStats.conflicting.length > 0 && (
        <div>
          <span className="fl-type-section">Conflicting feedback (matches a keyword but contradicts the theme; excluded from support)</span>
          <div className="mt-1">
            {activeStats.conflicting.map((f) => (
              <div key={f.feedback_id} className="fl-quote-row">
                <div className="fl-quote-meta">
                  <span className="fl-mono" style={{ fontSize: 12, fontWeight: 500, color: 'var(--fl-text)' }}>
                    {f.account_id}
                  </span>
                  <span className="fl-type-label">{f.received_at.slice(0, 10)}</span>
                </div>
                <p className="fl-quote-text">&ldquo;{f.text}&rdquo;</p>
                <div className="mt-1.5 flex items-center gap-2">
                  {originBadge(f.origin)}
                  <span className="badge amber fl-token-chip fl-token-chip-amber">Conflicting</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  return (
    <section aria-label="Evidence" className="flex flex-col gap-5">
      {/* 1. Header: title, chips */}
      <div className="fl-page-head">
        <div className="fl-breadcrumb">
          <span>Analytics</span>
          <span>/</span>
          <span>Onboarding</span>
          <span>/</span>
          <strong>Evidence</strong>
        </div>
        <div className="fl-page-head-row">
          <div>
            <h1 className="fl-type-title">Evidence</h1>
            <p className="fl-page-sub">Link user feedback to funnel friction stages. Reviewable heuristics, not ground truth.</p>
          </div>
          <span className="fl-state-chip fl-state-chip-on">{reviewedCount} of {themes.length} reviewed</span>
        </div>
        <div className="fl-chip-row mt-2">
          <span className="fl-chip">{feedback.length} messages &middot; {new Set(feedback.map((f) => f.account_id)).size} accounts</span>
          <span className="fl-chip">{datasetChipLabel}</span>
          <a href="#fl-import-feedback" className="fl-chip fl-chip-interactive">
            <RiUploadCloud2Line className="size-3.5" aria-hidden="true" />
            Import feedback
          </a>
          <label htmlFor="fl-reviewed-only" className="fl-chip fl-chip-interactive" style={{ cursor: 'pointer' }}>
            <input
              id="fl-reviewed-only"
              type="checkbox"
              checked={showReviewedOnly}
              onChange={(e) => setShowReviewedOnly(e.target.checked)}
              className="size-3.5 accent-[var(--fl-periwinkle)]"
            />
            Show only reviewed
          </label>
        </div>
        {themeNotice && (
          <div className="warn-box mt-2" role="status">
            {themeNotice}
          </div>
        )}
      </div>

      {/* 2. Themes as 52px rows; selecting one opens the floating detail panel */}
      <div>
        <p className="fl-type-section mb-2">{themes.length} evidence themes</p>
        <div className="max-h-[480px] overflow-y-auto">
          {themeStats.map(({ theme: t, supporting, uniqueAccounts }) => {
            const stage = themeFunnelStage(t);
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => openTheme(t.id)}
                data-selected={isPanelOpen && activeTheme?.id === t.id}
                className="fl-txn-row"
              >
                <span className={cx('fl-dot', t.status === 'reviewed' ? 'fl-dot-slate' : 'fl-dot-amber')} aria-hidden="true" />
                <span className="fl-txn-event" style={{ flex: '1 1 auto', fontWeight: 500, color: 'var(--fl-text)' }}>{t.title}</span>
                <span className="fl-txn-date">{supporting.length} msg</span>
                <span className="fl-txn-date">{uniqueAccounts} acct</span>
                <span className="fl-txn-time" style={{ minWidth: 'auto' }}>{stage ?? 'no funnel join'}</span>
              </button>
            );
          })}
        </div>
        <p className="fl-type-label mt-2">
          Theme suggestions use transparent rules. They link to original records and stay editable. Prioritization is a heuristic, not a correct roadmap.
        </p>
      </div>

      {isPanelOpen && activeTheme && (
        <div
          ref={panelRef}
          className="fl-detail-panel"
          role="dialog"
          aria-modal="true"
          aria-label={`${activeTheme.title} detail`}
          tabIndex={-1}
        >
          <div className="fl-detail-panel-header">
            <span className="text-[15px] font-medium text-[var(--fl-text)]">{activeTheme.title}</span>
            <button type="button" className="fl-detail-close" onClick={closePanel} aria-label="Close theme detail">
              <X className="size-4" aria-hidden="true" />
            </button>
          </div>
          <div className="fl-detail-panel-body">{detailContent}</div>
        </div>
      )}

      {importPanel}

      {/* 3. Complete source records, ledger-style */}
      <div>
        <div className="flex items-center justify-between border-b border-[var(--fl-border)] pb-2">
          <p className="fl-type-section">Source records</p>
          <span className="fl-type-label">{visible.length} records displayed</span>
        </div>
        <div className="table-scroll mt-2 overflow-x-auto">
          <table className="fl-ledger">
            <thead>
              <tr>
                <th scope="col">Date</th>
                <th scope="col">Account</th>
                <th scope="col">Feedback</th>
                <th scope="col">Origin</th>
                <th scope="col">Evidence</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((f) => (
                <tr key={f.feedback_id} id={`fb-${f.feedback_id}`}>
                  <td className="fl-mono" style={{ whiteSpace: 'nowrap', color: 'var(--fl-text-faint)' }}>
                    {f.received_at.slice(0, 10)}
                  </td>
                  <td className="fl-mono" style={{ whiteSpace: 'nowrap', fontWeight: 500 }}>
                    {f.account_id}
                  </td>
                  <td>
                    <p>&ldquo;{f.text}&rdquo;</p>
                    <span className="fl-type-label" style={{ display: 'block', marginTop: 2 }}>
                      {classifications.get(f.feedback_id)?.label ?? 'no linked theme'}
                    </span>
                    {classifications.get(f.feedback_id)?.status === 'conflict' && (
                      <div className="mt-1 flex items-center gap-1.5">
                        <span className="badge amber fl-token-chip fl-token-chip-amber">Conflicting</span>
                      </div>
                    )}
                    {joinWarnings.get(f.feedback_id) && (
                      <div className="mt-1 flex items-center gap-1.5">
                        <span className="badge amber fl-token-chip fl-token-chip-amber">Weak join</span>
                        <span className="fl-type-label">{joinWarnings.get(f.feedback_id)}</span>
                      </div>
                    )}
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>{originBadge(f.origin)}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button
                      className="btn small"
                      onClick={() => setExpandedAccount(expandedAccount === f.feedback_id ? null : f.feedback_id)}
                      aria-expanded={expandedAccount === f.feedback_id}
                    >
                      {expandedAccount === f.feedback_id ? 'Hide' : 'View'} account events
                    </button>
                    {expandedAccount === f.feedback_id && (
                      <div className="fl-type-label mt-2 fl-mono" style={{ border: '1px solid var(--fl-border)', borderRadius: 6, padding: 8 }}>
                        {(eventsByAccount.get(f.account_id) ?? []).length === 0 ? (
                          <span>No events recorded for this account.</span>
                        ) : (
                          <ul className="tight space-y-1">
                            {eventsByAccount.get(f.account_id)!.map((e) => (
                              <li key={e.event_id}>
                                <span style={{ color: 'var(--fl-text-faint)' }}>{e.occurred_at.slice(0, 16).replace('T', ' ')}Z</span>{' '}
                                <span style={{ fontWeight: 500, color: 'var(--fl-text)' }}>{e.event_name}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-2 flex flex-col gap-1 border-t border-[var(--fl-border)] pt-2">
          <p className="fl-type-label">
            Conflicting evidence is kept: one record reports a smooth flow. Having events for an account does not prove feedback caused the drop.
          </p>
          <p className="fl-type-label">
            Event accounts in sample: {new Set(events.map((e) => e.account_id)).size}. Feedback accounts: {new Set(feedback.map((f) => f.account_id)).size}.
          </p>
        </div>
      </div>
    </section>
  );
}

function DecisionView({ state }: { state: S }) {
  const { decision, editDecision, setDecisionState, themes, feedback, events, snapshot } = state;
  const [issueNote, setIssueNote] = useState<string | null>(null);
  const [showMd, setShowMd] = useState(false);

  const save = (patch: Partial<Decision>) => {
    editDecision(patch);
  };

  // Friction stage + dropped cohort: the exact same per-step computation the
  // Funnel chart uses, so the rail, the chart, and the export always agree.
  const funnelForRail = computeFunnel(events);
  const railSteps = funnelSteps(funnelForRail);
  const worstRailStep = railSteps.slice(1).reduce((worst, s) => (s.dropped > worst.dropped ? s : worst), railSteps[1]);
  const worstRailPct = worstRailStep.dropPct;
  const reportingWindowLabel = formatDateRangeLabel(eligibleSignupRange(funnelForRail));

  const funnelExportInfo: FunnelExportInfo = {
    stageLabel: worstRailStep.label,
    entered: worstRailStep.entered,
    converted: worstRailStep.converted,
    dropped: worstRailStep.dropped,
    dropPct: worstRailStep.dropPct,
    eligibleCohort: funnelForRail.eligible,
    periodLabel: reportingWindowLabel,
  };

  const origins = evidenceOrigins(feedback, events);
  const md = decisionToMarkdown(decision, origins, funnelExportInfo);
  const payload = buildIssuePayload(decision, origins);
  const approved = canExportDecision(decision) && isApprovalCurrent(decision, snapshot);
  const staleApproval =
    !approved && typeof decision.approvalStamp === 'string' && !isApprovalCurrent(decision, snapshot);
  const problemOptions = PROBLEM_OPTIONS.includes(decision.problem)
    ? PROBLEM_OPTIONS
    : [...PROBLEM_OPTIONS, decision.problem];
  const reviewedThemeCount = themes.filter((t) => t.status === 'reviewed').length;
  const canApprove = reviewedThemeCount > 0;

  const exportCSV = () => {
    const rows = [['feedback_id', 'account_id', 'text', 'received_at', 'origin']];
    feedback.forEach((f) => rows.push([f.feedback_id, f.account_id, f.text, f.received_at, f.origin]));
    downloadText('feedback-export.csv', toCSV(rows), 'text/csv');
  };

  const downloadMd = () => {
    if (!approved) {
      setIssueNote('Refused: decision is not approved. Set state to approved before downloading the handoff.');
      return;
    }
    downloadText('issue-handoff.md', md, 'text/markdown');
  };

  const submitMock = () => {
    if (!approved) {
      setIssueNote('Refused: decision is not approved. Mock submission requires an approved decision; preview above is marked draft.');
      return;
    }
    const r = mockSubmit(payload);
    if (!r.ok) {
      setIssueNote(`Mock adapter (validation only): ${r.error} Status: implemented, live integration unverified.`);
      return;
    }
    setIssueNote(`Submitted: ${r.remoteId}`);
  };

  const submitSimulated = () => {
    if (!approved) {
      setIssueNote('Refused: decision is not approved.');
      return;
    }
    const r = simulateSubmit(payload);
    if (!r.ok) {
      setIssueNote(`Simulation refused: ${r.error}`);
      return;
    }
    setIssueNote(
      r.duplicate
        ? `Simulated repeat: already recorded as ${r.remoteId}. Nothing new was created.`
        : `SIMULATED success (not a real delivery): recorded as ${r.remoteId}. Repeats return this ID.`
    );
  };

  return (
    <section aria-label="Decision and handoff" className="flex flex-col gap-5">
      {/* 1. Header */}
      <div className="fl-page-head">
        <div className="fl-breadcrumb">
          <span>Analytics</span>
          <span>/</span>
          <span>Onboarding</span>
          <span>/</span>
          <strong>Decision and Handoff</strong>
        </div>
        <div className="fl-page-head-row">
          <div>
            <h1 className="fl-type-title">Decision and Handoff</h1>
            <p className="fl-page-sub">Turn qualitative findings and funnel drop-offs into an approved, actionable product decision.</p>
          </div>
          <span className="flex items-center gap-2">
            <span className={cx('fl-dot', decision.state === 'draft' ? 'fl-dot-amber' : 'fl-dot-slate')} aria-hidden="true" />
            <span className="fl-state-chip fl-state-chip-on">{decision.state}</span>
          </span>
        </div>
      </div>

      {/* 2. Main document (max ~720px) + right properties rail (300px) */}
      <div className="flex flex-col gap-6 min-[900px]:flex-row">
        <div className="flex flex-col min-[900px]:max-w-[720px] min-[900px]:flex-1">
          <div className="field fl-field-row">
            <label htmlFor="fl-problem" className="fl-field-label">
              Selected problem (persisted; changing it resets approval)
            </label>
            <select
              id="fl-problem"
              value={decision.problem}
              onChange={(e) => save({ problem: e.target.value })}
              className="fl-field-select"
            >
              {problemOptions.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>

          {(['evidence', 'alternatives', 'scope', 'nonGoals', 'acceptance', 'metric'] as const).map((k) => (
            <div className="field fl-field-row" key={k}>
              <label htmlFor={`fl-${k}`} className="fl-field-label" style={{ textTransform: 'capitalize' }}>
                {k === 'nonGoals' ? 'Non-goals' : k}
              </label>
              <textarea
                id={`fl-${k}`}
                value={decision[k]}
                onChange={(e) => save({ [k]: e.target.value } as Partial<Decision>)}
                className="fl-field-textarea"
                rows={k === 'evidence' ? 3 : 2}
              />
            </div>
          ))}

          {staleApproval && (
            <div className="warn-box mt-4" role="status">
              A previous approval is stale: supporting evidence or contents changed since it was granted. Review and approve again before export.
            </div>
          )}

          {!canApprove && decision.state !== 'approved' && (
            <div className="warn-box mt-4" role="status">
              Approval is blocked: at least one evidence theme must be reviewed before this decision can be approved. Review a theme on the Evidence page first.
            </div>
          )}

          {showMd && (
            <div className="mt-4 flex flex-col gap-2">
              {!approved && (
                <div className="warn-box" role="status">
                  Draft preview, not approved for export. Approval metadata is validated at the preamble only.
                </div>
              )}
              <pre className="export max-h-72 overflow-y-auto rounded-md border border-[var(--fl-border)] bg-gray-900 p-3.5 font-mono text-xs text-gray-100">
                {md}
              </pre>
            </div>
          )}

          <div className="fl-field-row">
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" className="btn small" onClick={() => setShowMd(!showMd)} aria-expanded={showMd}>
                {showMd ? 'Hide' : 'Show'} Markdown
              </button>
              <button
                type="button"
                className="btn small primary"
                onClick={downloadMd}
                disabled={!approved}
                title={approved ? 'Download approved handoff' : 'Requires approved state'}
              >
                Download Markdown
              </button>
              <button type="button" className="btn small" onClick={exportCSV}>
                Download feedback CSV
              </button>
            </div>
            <p className="fl-type-label mt-1">
              Reviewed themes: {reviewedThemeCount} of {themes.length}. Only approved content should be exported.
            </p>
          </div>
        </div>

        {/* Right properties rail */}
        <div className="flex flex-col gap-5 min-[900px]:w-[300px] min-[900px]:flex-shrink-0">
          <div className="fl-rail">
            <div className="fl-rail-section">
              <p className="fl-rail-title">Issue properties</p>
              <div className="fl-rail-row">
                <span className="fl-rail-row-label">Friction stage</span>
                <span className="fl-rail-row-value">{worstRailStep.label}</span>
              </div>
              <div className="fl-rail-row">
                <span className="fl-rail-row-label">Dropped cohort</span>
                <span className="fl-rail-row-value" style={{ color: 'var(--fl-amber-strong)' }}>
                  {worstRailStep.dropped} accounts ({worstRailPct}%)
                </span>
              </div>
              <div className="fl-rail-row">
                <span className="fl-rail-row-label">Evidence telemetry</span>
                <span className="fl-rail-row-value fl-mono">{events.length} validated events</span>
              </div>
              <div className="fl-rail-row">
                <span className="fl-rail-row-label">Themes reviewed</span>
                <span className="fl-rail-row-value">{reviewedThemeCount} of {themes.length}</span>
              </div>
            </div>

            <div className="fl-rail-section">
              <p className="fl-rail-title">Status</p>
              <div className="flex flex-wrap items-center gap-1.5">
                {(['draft', 'in-review', 'approved'] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    className={cx('fl-state-chip fl-chip-interactive', decision.state === s && 'fl-state-chip-on')}
                    style={decision.state === s ? { borderColor: 'var(--fl-periwinkle)', color: 'var(--fl-slate-strong)' } : undefined}
                    onClick={() => setDecisionState(s)}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            <div className="fl-rail-section">
              <p className="fl-mock-label">Mock, no live delivery</p>
              <p className="fl-type-body mt-2">
                Public demo is credential-free and read-only. Mock submission is validation-only and always fails honestly without a destination. An explicitly labeled simulation is available for the success path. Owner-run live export additionally requires the repo allowlist and an explicit --live flag.
              </p>
              <div className="fl-fact-row mt-2" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}>
                <span className="fl-fact-label">Title</span>
                <span className="fl-fact-value" style={{ whiteSpace: 'normal' }}>{payload.title}</span>
              </div>
              <div className="fl-fact-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}>
                <span className="fl-fact-label">Labels</span>
                <span className="fl-fact-value" style={{ whiteSpace: 'normal' }}>{payload.labels.join(', ')}</span>
              </div>
              <div className="toolbar mt-3 flex flex-col gap-2">
                <button
                  type="button"
                  className="btn small primary"
                  onClick={submitMock}
                  disabled={!approved}
                  title={approved ? 'Validate via mock adapter' : 'Requires approved state'}
                >
                  Validate via mock adapter
                </button>
                <button
                  type="button"
                  className="btn small"
                  onClick={submitSimulated}
                  disabled={!approved}
                  title={approved ? 'Simulated success, labeled' : 'Requires approved state'}
                >
                  Simulate success (labeled)
                </button>
                <button
                  type="button"
                  className="btn small"
                  onClick={() => {
                    clearMockSubmissions();
                    setIssueNote('Cleared all submission records (simulated receipts and dedupe state).');
                  }}
                >
                  Clear record
                </button>
              </div>
              {issueNote && (
                <div className="warn-box mt-3" role="status">
                  {issueNote}
                </div>
              )}
              <div className="fl-handoff-panel mt-3">
                <h3 className="fl-type-section">Owner-run live export (optional)</h3>
                <pre className="export mt-1 max-h-40 overflow-y-auto rounded border border-[var(--fl-border)] bg-white p-2 font-mono text-[10px] text-[var(--fl-text-subtle)]">
                  {`# 1. Approve the decision above (state must read "approved").
# 2. Download the Markdown, then point ONLY at your own disposable demo repo:
PORTFOLIO_DEMO_REPO=OWNER/demo-repo node scripts/github-issue.mjs --repo OWNER/demo-repo --file issue-handoff.md --dry-run
# 3. Only after dry-run passes, write with an explicit flag:
PORTFOLIO_DEMO_REPO=OWNER/demo-repo node scripts/github-issue.mjs --repo OWNER/demo-repo --file issue-handoff.md --live
# Refuses on allowlist mismatch, unapproved or ambiguous content, or missing --live. Successful writes store a local receipt; repeats return it. Never use an employer, customer, or production repo.`}
                </pre>
                <p className="fl-type-label mt-1.5">
                  Status: implemented, live integration unverified (no authorized demo destination in this session).
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
