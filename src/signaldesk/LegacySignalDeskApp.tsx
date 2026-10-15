import { useState } from 'react';
import { Link, Navigate, Route, Routes, useNavigate, useParams } from 'react-router-dom';
import { createSaveTracker, loadStored } from '../lib/storage';
import '@fontsource-variable/dm-sans';

import { isValidHttpUrl } from '../lib/datetime';
import { downloadText } from '../lib/utils';
import { DEFAULT_CRITERIA, SAMPLE_ACCOUNTS, CSV_SCHEMA_DOC } from './sampleData';
import { getResearchedAccounts } from './researched';
import { migrateAccounts } from './migration';
import { checkExclusions, normalizeWeights, rankAccounts, scoreAccount, validateWeights } from './scoring';
import type { Account, ICPCriteria, ReviewState, ScoreWeights } from './types';
import { DEFAULT_WEIGHTS, isAccountArray, isICPCriteria, isScoreWeights, validateCriteria } from './types';
import { validateSignalCSV } from './csvImport';
import { approvedToCSV, briefToMarkdown, criteriaSummary, eligibleExportAccounts } from './export';
import { SignalDeskShell } from './SignalDeskShell';
import { Opportunities } from './Opportunities';
import { AccountLogo } from '@/components/untitled/account-logo';

// Realistic CSV demonstrating the quarantine table: two importable rows plus
// five rows that each fail a distinct validation rule (bad URL, invalid
// date, a positive score asserted with no evidence, a formula-like cell,
// and a duplicate company+domain), so every quarantine reason is visible
// at once instead of a single bare parse failure.
const INVALID_EXAMPLE_CSV = [
  'company,domain,source_url,source_date,evidence_text,tags',
  'Brightline Robotics,brightline-robotics.example,https://brightline-robotics.example/blog/webhook-retries,2026-09-15,Platform engineers mentioned manual webhook retries during a support call.,fit:65;intent:40',
  'Cobalt Fintech,cobalt-fintech.example,,2026-08-01,Support ticket referenced delayed payment webhook delivery.,intent:55',
  'Driftwood Media,driftwood-media.example,htp:/bad-url,2026-07-01,Mentioned in a sales call.,fit:50',
  'Emberlight Labs,emberlight-labs.example,https://emberlight-labs.example/docs,13/40/2026,Noted in a forum post.,fit:60',
  'Fallowfield Analytics,fallowfield-analytics.example,,2026-06-01,,fit:80;intent:70',
  "=cmd|'/c calc'!A1,formulafield.example,,2026-05-01,Formula-like company name should never be trusted as plain text.,fit:30",
  'Cobalt Fintech,cobalt-fintech.example,,2026-08-02,Second mention of the same account should be flagged as a duplicate.,intent:60',
].join('\n');

const K_ACCOUNTS = 'sd-accounts-v1';
const K_WEIGHTS = 'sd-weights-v1';
const K_CRITERIA = 'sd-criteria-v1';
const K_DATASET = 'sd-dataset-v1';

export type DatasetChoice = 'researched' | 'synthetic';
export const MAX_ACCOUNTS = 2000;

function datasetAccounts(choice: DatasetChoice): Account[] {
  return choice === 'researched' ? getResearchedAccounts() : SAMPLE_ACCOUNTS;
}

function isDatasetChoice(x: unknown): x is DatasetChoice {
  return x === 'researched' || x === 'synthetic';
}

export interface SDState {
  accounts: Account[];
  weights: ScoreWeights;
  criteria: ICPCriteria;
  dataset: DatasetChoice;
  notices: string[];
  saveError: string | null;
  persist: (a: Account[], w: ScoreWeights, c: ICPCriteria) => void;
  reset: () => void;
  switchDataset: (d: DatasetChoice) => void;
  setAccounts: (a: Account[]) => void;
  setWeights: (w: ScoreWeights) => void;
  setCriteria: (c: ICPCriteria) => void;
}

/**
 * Resolve persisted accounts without bypassing the version guard:
 * - Missing storage is fresh (researched default, no notice).
 * - Wrapped values with an unknown version never migrate; they recover.
 * - Only the known legacy schema (a bare unwrapped array, or v1 data that
 *   fails strict validation) may migrate, with visible repair notes.
 */
export function resolveStoredAccounts(rawText: string | null): { value: Account[]; notice?: string } {
  if (rawText == null) return { value: datasetAccounts('researched') };
  let raw: unknown;
  try {
    raw = JSON.parse(rawText);
  } catch {
    return { value: datasetAccounts('researched'), notice: 'Saved accounts were not valid JSON. Researched default restored.' };
  }
  if (raw && typeof raw === 'object' && !Array.isArray(raw) && 'v' in raw) {
    const version = (raw as { v: unknown }).v;
    if (version !== 1) {
      return {
        value: datasetAccounts('researched'),
        notice: 'Saved accounts used an unknown storage version. Researched default restored; no legacy data was migrated.',
      };
    }
    const data = (raw as unknown as { data: unknown }).data;
    if (isAccountArray(data)) return { value: data };
    if (Array.isArray(data)) {
      const m = migrateAccounts(data);
      if (m.accounts.length > 0) {
        return { value: m.accounts, notice: [`Recovered ${m.accounts.length} saved account(s) with repairs`, ...m.notes].join(' ') };
      }
    }
    return { value: datasetAccounts('researched'), notice: 'Saved accounts failed validation. Researched default restored.' };
  }
  if (!Array.isArray(raw)) {
    return { value: datasetAccounts('researched'), notice: 'Saved accounts were unusable. Researched default restored.' };
  }
  const m = migrateAccounts(raw);
  if (m.accounts.length > 0) {
    return { value: m.accounts, notice: [`Recovered ${m.accounts.length} saved account(s) from the legacy format`, ...m.notes].join(' ') };
  }
  return { value: datasetAccounts('researched'), notice: ['Saved accounts were unusable. Researched default restored.', ...m.notes].join(' ') };
}

function loadAccountsWithMigration(): { value: Account[]; notice?: string } {
  const loaded = loadStored(K_ACCOUNTS, isAccountArray, null as unknown as Account[]);
  if (loaded.status !== 'recovered' && loaded.value !== null) {
    return loaded.value === null
      ? { value: datasetAccounts('researched') }
      : { value: loaded.value, notice: loaded.notice };
  }
  let rawText: string | null;
  try {
    rawText = localStorage.getItem(K_ACCOUNTS);
  } catch {
    return { value: datasetAccounts('researched'), notice: loaded.notice ?? 'Browser storage is unavailable. Researched default shown.' };
  }
  const resolved = resolveStoredAccounts(rawText);
  if (!resolved.notice && loaded.notice) return { value: resolved.value, notice: loaded.notice };
  return resolved;
}

function useSDState(): SDState {
  const [boot] = useState(() => ({
    accounts: loadAccountsWithMigration(),
    weights: loadStored(K_WEIGHTS, isScoreWeights, DEFAULT_WEIGHTS),
    criteria: loadStored(K_CRITERIA, isICPCriteria, DEFAULT_CRITERIA),
    dataset: loadStored(K_DATASET, isDatasetChoice, 'researched' as DatasetChoice),
  }));
  const [accounts, setAccountsState] = useState<Account[]>(boot.accounts.value);
  const [weights, setWeightsState] = useState<ScoreWeights>(boot.weights.value);
  const [criteria, setCriteriaState] = useState<ICPCriteria>(boot.criteria.value);
  const [dataset, setDatasetState] = useState<DatasetChoice>(boot.dataset.value);
  // Sticky multi-key tracking: a failure on one key followed by successes on
  // other keys must not hide the failure. Warnings stay until all durable.
  const [tracker] = useState(() => createSaveTracker());
  const [saveError, setSaveError] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const notices = [boot.accounts.notice, boot.weights.notice, boot.criteria.notice, boot.dataset.notice, actionNotice].filter(
    (n): n is string => !!n
  );

  // Sticky tracking: failures accumulate per key and clear only when that key
  // saves, so a later success elsewhere can never hide an earlier failure.
  const storeAll = (entries: [string, unknown][]) => {
    entries.forEach(([key, value]) => tracker.save(key, value));
    setSaveError(tracker.error());
  };
  const persist = (a: Account[], w: ScoreWeights, c: ICPCriteria) => {
    setAccountsState(a);
    setWeightsState(w);
    setCriteriaState(c);
    storeAll([
      [K_ACCOUNTS, a],
      [K_WEIGHTS, w],
      [K_CRITERIA, c],
    ]);
  };
  const setAccounts = (a: Account[]) => {
    setAccountsState(a);
    storeAll([[K_ACCOUNTS, a]]);
  };
  const setWeights = (w: ScoreWeights) => {
    setWeightsState(w);
    storeAll([[K_WEIGHTS, w]]);
  };
  const setCriteria = (c: ICPCriteria) => {
    setCriteriaState(c);
    storeAll([[K_CRITERIA, c]]);
  };
  const switchDataset = (d: DatasetChoice) => {
    const imported = accounts.filter((a) => a.dataset === 'imported');
    const next = [...datasetAccounts(d), ...imported];
    setDatasetState(d);
    setAccountsState(next);
    storeAll([
      [K_DATASET, d],
      [K_ACCOUNTS, next],
    ]);
    setActionNotice(
      `Now showing the ${d} dataset. ${imported.length} imported row(s) preserved; built-in review states were reset with the switch.`
    );
  };
  const reset = () => {
    const next = datasetAccounts('researched');
    setDatasetState('researched');
    setActionNotice('Reset to the researched default. Imported rows were cleared by this explicit reset.');
    persist(next, DEFAULT_WEIGHTS, DEFAULT_CRITERIA);
    storeAll([[K_DATASET, 'researched']]);
  };
  return { accounts, weights, criteria, dataset, notices, saveError, persist, reset, switchDataset, setAccounts, setWeights, setCriteria };
}

function Notices({ state }: { state: SDState }) {
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

export default function SignalDeskApp() {
  const state = useSDState();
  return (
    <SignalDeskShell
      recordCount={state.accounts.length}
      demoNote={
        <>
          <strong className="text-foreground">What this demonstrates:</strong> transparent heuristic ranking, hard exclusions, review states, validated CSV import, and brief export.{' '}
          <span className="badge blue">Researched examples</span> Twelve webhook vendors with checked primary documentation URLs. Sources document capabilities, not purchasing demand; RelayWatch is fictional.{' '}
          <span className="badge gray">Synthetic sample</span> available via the dataset switch. Imported rows are labeled user-provided and unverified.
        </>
      }
    >
      <Notices state={state} />
      <Routes>
        <Route index element={<Opportunities state={state} />} />
        <Route path="brief" element={<BriefRedirect state={state} />} />
        <Route path="brief/:id" element={<Brief state={state} />} />
        <Route path="data" element={<TargetData state={state} />} />
        <Route path="*" element={<SectionNotFound />} />
      </Routes>
    </SignalDeskShell>
  );
}

function SectionNotFound() {
  return (
    <section className="card" role="alert">
      <h2>Section not found</h2>
      <p className="muted">That SignalDesk address does not exist.</p>
      <p>
        <Link className="btn small primary" to="/signaldesk">Back to Opportunities</Link>{' '}
        <Link className="btn small" to="/signaldesk/data">Target and Data</Link>
      </p>
    </section>
  );
}

const QUALITY_CLASS: Record<string, string> = { high: 'green', medium: 'blue', low: 'amber', 'needs-review': 'red' };

/** Hostname of a validated http(s) URL, for citation display. Never invents a source. */
function citeHost(url: string | null): string | null {
  if (!url || !isValidHttpUrl(url)) return null;
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}

function CiteLink({ url }: { url: string | null }) {
  const host = citeHost(url);
  if (!host || !url) return null;
  return (
    <a href={url} target="_blank" rel="noopener noreferrer">
      {host}
    </a>
  );
}

const REVIEW_STATUS: Record<ReviewState, { cls: string; text: string }> = {
  'in-review': { cls: 'review', text: 'In review' },
  approved: { cls: 'approved', text: 'Approved' },
  rejected: { cls: 'rejected', text: 'Rejected' },
  unreviewed: { cls: 'unreviewed', text: 'Unreviewed' },
};

function datasetLabel(dataset: Account['dataset']): string {
  if (dataset === 'researched') return 'Researched primary source';
  if (dataset === 'imported') return 'User-provided import, unverified';
  return 'Synthetic sample';
}

function datasetNote(dataset: Account['dataset']): string {
  if (dataset === 'researched') return 'Primary-source research; capabilities are documented, not purchasing demand.';
  if (dataset === 'imported') return 'User-provided import, unverified.';
  return 'Fictional company and reserved-domain sample; no public sources are claimed.';
}

/**
 * Resolves the brief landing link to a currently valid record: the top-ranked
 * account under the active dataset and criteria. Never hardcodes an ID, so a
 * researched default (res-* IDs only) cannot land on a missing brief.
 */
function BriefRedirect({ state }: { state: SDState }) {
  const { accounts, weights, criteria } = state;
  const ranked = rankAccounts(accounts, weights, criteria);
  if (ranked.length === 0) {
    return (
      <section className="card" role="alert">
        <h2>No accounts to brief</h2>
        <p className="muted">The current dataset has no accounts. Reset or import data first.</p>
        <p><Link className="btn small primary" to="/signaldesk/data">Go to Target and Data</Link></p>
      </section>
    );
  }
  return <Navigate to={`/signaldesk/brief/${ranked[0].id}`} replace />;
}

function Brief({ state }: { state: SDState }) {
  const { accounts, weights, criteria, setAccounts } = state;
  const { id } = useParams();
  const navigate = useNavigate();
  const [showExport, setShowExport] = useState(false);
  const [draftNotice, setDraftNotice] = useState<string | null>(null);
  const account = accounts.find((a) => a.id === id);

  if (!account) {
    return (
      <section className="sd-empty-state" role="alert">
        <h2>Account not found</h2>
        <p className="muted">There is no account with ID “{id}”. It may have been removed, or the link may be wrong. Nothing else was opened in its place.</p>
        <div className="toolbar">
          <Link className="sd-btn primary" to="/signaldesk">Back to Opportunities</Link>
          <Link className="sd-btn ghost" to="/signaldesk/data">Target and Data</Link>
        </div>
      </section>
    );
  }

  const s = scoreAccount(account, weights, criteria);
  const statusInfo = s.excluded ? { cls: 'excluded', text: 'Excluded' } : REVIEW_STATUS[account.reviewState];

  const setReview = (rs: ReviewState) => {
    const next = accounts.map((a) => (a.id === account.id ? { ...a, reviewState: rs } : a));
    setAccounts(next);
  };
  const setDraft = (v: string) => {
    // Approved exports must represent current reviewed content: editing an
    // approved outreach draft returns the account to in-review.
    const wasApproved = account.reviewState === 'approved';
    const next = accounts.map((a) =>
      a.id === account.id
        ? { ...a, outreachDraft: v, reviewState: wasApproved ? ('in-review' as const) : a.reviewState }
        : a
    );
    setAccounts(next);
    setDraftNotice(wasApproved ? 'Outreach edits returned this approved brief to in-review. Review and approve again before export.' : null);
  };

  const md = briefToMarkdown(account, weights, criteria);
  const groups = (kind: string) => account.signals.filter((x) => x.kind === kind);
  const factSignals = groups('fact');
  const hypothesisSignals = groups('hypothesis');
  const primaryHypothesis = account.problem ?? hypothesisSignals[0]?.detail ?? 'No hypothesis documented.';
  // Avoid repeating the same sentence twice: skip whichever hypothesis signal
  // supplied the primary line above, and any other signal with identical text.
  const extraHypotheses = hypothesisSignals.filter((x, i) => !(account.problem == null && i === 0) && x.detail !== account.problem);
  const nextStepSignal = groups('next-step')[0] ?? null;
  const allUnknowns = [...groups('unknown').map((x) => `${x.label}: ${x.detail}`), ...(account.unknowns ?? [])];
  const validDomain = isValidHttpUrl(`https://${account.domain}`);
  const retrievalDates = Array.from(
    new Set(account.signals.map((x) => x.provenance.retrievalDate).filter((d): d is string => !!d))
  );

  return (
    <section aria-label={`Account brief for ${account.company}`}>
      <header className="sd-brief-header">
        <div className="sd-brief-identity">
          <AccountLogo company={account.company} domain={account.domain} size={40} />
          <div className="sd-brief-title-col">
            <div className="sd-brief-title-row">
              <h1 className="sd-brief-company">{account.company}</h1>
              {validDomain ? (
                <a href={`https://${account.domain}`} target="_blank" rel="noopener noreferrer" className="sd-brief-domain">
                  {account.domain}
                </a>
              ) : (
                <span className="sd-brief-domain muted">{account.domain}</span>
              )}
            </div>
            <div className="sd-brief-status-line">
              <span className={`sd-status ${statusInfo.cls}`} title={s.excluded ? s.exclusionReason ?? '' : undefined}>
                {statusInfo.text}
              </span>
              <span className="sd-brief-status-sep">&middot;</span>
              <span>
                Evidence <span className={`badge sd-quality ${QUALITY_CLASS[account.evidenceQuality] ?? 'gray'}`}>{account.evidenceQuality}</span>
              </span>
              <span className="sd-brief-status-sep">&middot;</span>
              <span>
                <strong className="sd-display">{s.excluded ? 'excl' : s.total}</strong>
                <span className="sd-rec-hint">/100 heuristic</span>
              </span>
              <span className="sd-brief-status-sep">&middot;</span>
              <label htmlFor="sd-account" className="sr-only">Account</label>
              <span className="sd-brief-switcher">
                <select id="sd-account" value={account.id} onChange={(e) => navigate(`/signaldesk/brief/${e.target.value}`)}>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>{a.company}</option>
                  ))}
                </select>
              </span>
            </div>
          </div>
        </div>
        <div className="sd-brief-actions">
          <button className="sd-btn ghost" onClick={() => setReview('in-review')}>Mark in review</button>
          <button className="sd-btn primary" onClick={() => setReview('approved')}>Approve</button>
          <button className="sd-btn ghost" onClick={() => setReview('rejected')}>Reject</button>
          <button className="sd-btn ghost" onClick={() => setReview('unreviewed')}>Reset state</button>
          <button className="sd-btn ghost" onClick={() => setShowExport(!showExport)} aria-expanded={showExport}>
            {showExport ? 'Hide export' : 'Show Markdown export'}
          </button>
        </div>
      </header>

      <div className="sd-brief-body">
        <div className="sd-brief-main">
          <section className="sd-rec-section">
            <h3>Assessment <span className="sd-rec-hint">unvalidated</span></h3>
            <p className="sd-rec-text">{primaryHypothesis}</p>
            {extraHypotheses.map((x) => (
              <p className="sd-rec-text" key={x.id} style={{ marginTop: 8 }}>{x.label}: {x.detail}</p>
            ))}
            {account.scoreOrigin === 'user-asserted' && (
              <p className="sd-rec-badge-row"><span className="badge amber badge-wrap">Scores are user assertions from import, not substantiated facts</span></p>
            )}
            {account.scoreOrigin === 'analyst-heuristic' && (
              <p className="sd-rec-badge-row"><span className="badge blue badge-wrap">Scores are an analyst investigation heuristic (fit only), not demand evidence</span></p>
            )}
            {account.reviewNote && <p className="sd-rec-hint" style={{ marginTop: 8, display: 'block' }}>Review note: {account.reviewNote}</p>}
          </section>

          <section className="sd-rec-section">
            <h3>Supported by evidence ({factSignals.length})</h3>
            {factSignals.length === 0 && <p className="sd-rec-empty">No observed facts recorded.</p>}
            <div className="sd-ev-rows">
              {factSignals.map((x) => (
                <div key={x.id} className="sd-ev-row">
                  <div>
                    <div className="sd-ev-label">{x.label}</div>
                    <div className="sd-ev-detail">{x.detail}</div>
                    <div className="sd-cite mt-1">
                      {citeHost(x.provenance.sourceUrl) ? (
                        <>
                          <CiteLink url={x.provenance.sourceUrl} />
                          {x.provenance.retrievalDate ? ` · retrieved ${x.provenance.retrievalDate}` : ''}
                        </>
                      ) : (
                        x.sourceNote || 'Synthetic sample, no public source'
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="sd-rec-section">
            <h3>Unknowns</h3>
            {allUnknowns.length === 0 && <p className="sd-rec-empty">No unknowns recorded.</p>}
            <ul className="sd-unknown-list">
              {allUnknowns.map((u, i) => <li key={i}>{u}</li>)}
            </ul>
          </section>

          <section className="sd-rec-section">
            <h3>Next step and discovery question</h3>
            <p className="sd-rec-text">{nextStepSignal?.detail ?? '(no next validation step recorded)'}</p>
            {account.discoveryQuestion && <p className="sd-rec-text" style={{ marginTop: 8 }}><em>&ldquo;{account.discoveryQuestion}&rdquo;</em></p>}
          </section>

          <section className="sd-rec-section">
            <h3>Buyer hypothesis</h3>
            <p className="sd-rec-text">{account.buyerFunction ?? '(unknown)'}</p>
          </section>

          <section className="sd-rec-section">
            <h3>Reasons not to pursue</h3>
            <ul className="sd-reasons">
              {(account.reasonsNotToPursue ?? ['(none recorded)']).map((r, i) => <li key={i}>{r}</li>)}
            </ul>
          </section>

          <section className="sd-rec-section sd-rec-outreach">
            <h3>Outreach draft</h3>
            <label htmlFor="sd-outreach">Editable, stored locally</label>
            <textarea id="sd-outreach" value={account.outreachDraft ?? ''} onChange={(e) => setDraft(e.target.value)} />
            {draftNotice && <div className="warn-box" role="status" style={{ marginTop: 10 }}>{draftNotice}</div>}
          </section>
        </div>

        <aside className="sd-rail">
          <section className="sd-rail-section">
            <h4>Qualification</h4>
            {(['fit', 'intent', 'engagement', 'timing'] as const).map((k) => {
              const value = account.scores[k];
              const notAssessed = value === 0 && account.dataset === 'researched';
              return (
                <div key={k} className="sd-qual-row">
                  <span className="capitalize">{k}</span>
                  <div className="sd-qual-bar">
                    <i style={{ width: `${value}%` }} />
                  </div>
                  {notAssessed ? <span style={{ color: 'var(--sd-faint)' }}>Not assessed</span> : <span className="num">{value}</span>}
                </div>
              );
            })}
            <p className="sd-contrib">{s.parts.map((p) => `${p.key} wt ${p.weight} → +${p.contribution}`).join(' · ')}</p>
          </section>

          <section className="sd-rail-section">
            <h4>Provenance</h4>
            <div className="sd-rail-row">
              <span>Dataset</span>
              <span>{datasetLabel(account.dataset)}</span>
            </div>
            <p className="sd-rec-hint" style={{ display: 'block', marginTop: 2 }}>{datasetNote(account.dataset)}</p>
            <div className="sd-rail-row">
              <span>Retrieved</span>
              <span>{retrievalDates.length > 0 ? retrievalDates.join(', ') : '(none recorded)'}</span>
            </div>
            <div className="sd-rail-row">
              <span>Target criteria</span>
              <span>{criteriaSummary(criteria)}</span>
            </div>
          </section>

          {s.excluded && (
            <section className="sd-rail-section">
              <h4>Exclusion notice</h4>
              <div className="sd-rail-banner">
                Hard-excluded under the current target criteria and not eligible for the approved export: {s.exclusionReason}
              </div>
            </section>
          )}

          <section className="sd-rail-section">
            <h4>Export</h4>
            {!showExport && <p className="sd-rec-empty">Use Show Markdown export above to preview and download this brief.</p>}
            {showExport && (
              <div className="sd-rail-export-preview">
                <pre className="export">{md}</pre>
                <div className="sd-rail-export-actions">
                  <button className="sd-btn primary" onClick={() => downloadText(`${account.company}-brief.md`, md, 'text/markdown')}>Download .md</button>
                </div>
              </div>
            )}
          </section>
        </aside>
      </div>
    </section>
  );
}

function TargetData({ state }: { state: SDState }) {
  const { accounts, weights, criteria, persist, reset, setAccounts, setWeights } = state;
  const [w, setW] = useState<ScoreWeights>(weights);
  const [c, setC] = useState<ICPCriteria>(criteria);
  const [weightErrors, setWeightErrors] = useState<string[]>([]);
  const [criteriaErrors, setCriteriaErrors] = useState<string[]>([]);
  const [csvText, setCsvText] = useState('company,domain,source_url,source_date,evidence_text,tags\nAcme Test,acme-test.example,,2025-03-01,Sample import row,fit:70;intent:60;engagement:50;timing:40');
  const [result, setResult] = useState<{ ok: number; bad: { row: number; company: string; reason: string }[]; errors: string[]; skippedEmpty: number } | null>(null);

  const exportInfo = eligibleExportAccounts(accounts, weights, criteria);

  // Draft weight edits only persist through an explicit save (either the
  // dedicated button below or "Save target" in the criteria row); this
  // flag is the only thing that tells the user edits are not yet stored.
  const weightsDirty = (['fit', 'intent', 'engagement', 'timing'] as const).some((k) => w[k] !== weights[k]);

  const saveWeights = () => {
    const v = validateWeights({ fit: w.fit, intent: w.intent, engagement: w.engagement, timing: w.timing });
    setWeightErrors(v.errors);
    if (!v.ok) return;
    setWeights({ ...w });
  };
  const save = () => {
    const v = validateWeights({ fit: w.fit, intent: w.intent, engagement: w.engagement, timing: w.timing });
    const cv = validateCriteria({ ...c });
    setWeightErrors(v.errors);
    setCriteriaErrors(cv.errors);
    if (!v.ok || !cv.ok) return;
    persist(accounts, { ...w }, { ...c });
  };
  const doImport = () => {
    const r = validateSignalCSV(csvText);
    if (accounts.length + r.imported.length > MAX_ACCOUNTS) {
      setResult({
        ok: 0,
        bad: [],
        errors: [`Import refused: ${accounts.length} accounts stored plus ${r.imported.length} incoming exceeds the ${MAX_ACCOUNTS} account limit. Nothing was imported.`],
        skippedEmpty: r.skippedEmpty,
      });
      return;
    }
    if (r.imported.length > 0) {
      const next = [...accounts, ...r.imported];
      setAccounts(next);
    }
    setResult({ ok: r.imported.length, bad: r.quarantined, errors: r.parseErrors, skippedEmpty: r.skippedEmpty });
  };

  const effective = normalizeWeights(w).weights;

  return (
    <section aria-label="Target and data" className="sd-settings">
      <div className="sd-settings-row">
        <div className="sd-settings-label">
          <h3>Scoring weights</h3>
          <p>Finite numbers, 0 or greater. Weights are normalized to a 0-100 average; totals can never exceed 100. All-zero weights fall back to equal weighting.</p>
        </div>
        <div className="sd-settings-control">
          <div className="sd-settings-control-head">
            <span className="sd-rec-hint" role="status">
              {weightsDirty ? 'Unsaved changes' : 'Saved'}
            </span>
            <button className="sd-btn primary" onClick={saveWeights}>Save weights</button>
          </div>
          <table className="sd-weight-table">
            <thead>
              <tr>
                <th scope="col">Criterion</th>
                <th scope="col">Weight</th>
                <th scope="col" style={{ textAlign: 'right' }}>Effective %</th>
              </tr>
            </thead>
            <tbody>
              {(['fit', 'intent', 'engagement', 'timing'] as const).map((k) => (
                <tr key={k}>
                  <td className="sd-w-label">
                    <label htmlFor={`sd-w-${k}`}>{k}</label>
                  </td>
                  <td>
                    <input id={`sd-w-${k}`} type="number" min={0} step="any" value={w[k]} onChange={(e) => setW({ ...w, [k]: Number(e.target.value) })} />
                  </td>
                  <td className="sd-w-eff">{effective[k].toFixed(0)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
          {weightErrors.length > 0 && (
            <div className="error-box" role="alert">
              <ul className="tight">{weightErrors.map((e, i) => <li key={i}>{e}</li>)}</ul>
            </div>
          )}
        </div>
      </div>

      <div className="sd-settings-row">
        <div className="sd-settings-label">
          <h3>Target criteria</h3>
          <p>Hard exclusions override scores. An account matching any excluded rule never enters the approved export, regardless of score.</p>
        </div>
        <div className="sd-settings-control">
          <div className="sd-settings-control-head">
            <span className="sd-rec-hint">
              Check: {checkExclusions(accounts[0], c).excluded ? 'sample fails' : 'sample passes'} current exclusions.
            </span>
            <button className="sd-btn primary" onClick={save}>Save target</button>
          </div>
          <div className="sd-field-grid">
            <div className="sd-field-row">
              <label htmlFor="sd-min">Minimum headcount</label>
              <input id="sd-min" type="number" value={c.minEmployees} onChange={(e) => setC({ ...c, minEmployees: Number(e.target.value) })} />
            </div>
            <div className="sd-field-row">
              <label htmlFor="sd-max">Maximum headcount</label>
              <input id="sd-max" type="number" value={c.maxEmployees} onChange={(e) => setC({ ...c, maxEmployees: Number(e.target.value) })} />
            </div>
          </div>
          <div className="sd-field-row">
            <label htmlFor="sd-in-ind">Included industries (comma separated, empty means all)</label>
            <input id="sd-in-ind" type="text" value={c.includedIndustries.join(', ')} onChange={(e) => setC({ ...c, includedIndustries: e.target.value.split(',').map((x) => x.trim()).filter(Boolean) })} />
          </div>
          <div className="sd-field-row">
            <label htmlFor="sd-ex-ind">Excluded industries (comma separated)</label>
            <input id="sd-ex-ind" type="text" value={c.excludedIndustries.join(', ')} onChange={(e) => setC({ ...c, excludedIndustries: e.target.value.split(',').map((x) => x.trim()).filter(Boolean) })} />
          </div>
          <div className="sd-field-row">
            <label htmlFor="sd-ex-dom">Excluded domains (comma separated)</label>
            <input id="sd-ex-dom" type="text" value={c.excludedDomains.join(', ')} onChange={(e) => setC({ ...c, excludedDomains: e.target.value.split(',').map((x) => x.trim().toLowerCase()).filter(Boolean) })} />
          </div>
          <div className="sd-field-row">
            <label htmlFor="sd-min-quality">Minimum evidence quality</label>
            <select id="sd-min-quality" value={c.requireEvidenceQuality} onChange={(e) => setC({ ...c, requireEvidenceQuality: e.target.value as ICPCriteria['requireEvidenceQuality'] })}>
              <option value="any">Any quality</option>
              <option value="needs-review">Needs review or better</option>
              <option value="low">Low or better</option>
              <option value="medium">Medium or better</option>
              <option value="high">High only</option>
            </select>
          </div>
          {criteriaErrors.length > 0 && (
            <div className="error-box" role="alert">
              <ul className="tight">{criteriaErrors.map((e, i) => <li key={i}>{e}</li>)}</ul>
            </div>
          )}
        </div>
      </div>

      <div className="sd-settings-row">
        <div className="sd-settings-label">
          <h3>Import CSV</h3>
          <p>Fixed schema. Rows that fail validation are quarantined, not imported.</p>
        </div>
        <div className="sd-settings-control">
          <div className="sd-settings-control-head">
            <span className="sd-rec-hint" />
            <button className="sd-btn primary" onClick={doImport}>Validate and import</button>
          </div>
          <div className="sd-schema-doc">{CSV_SCHEMA_DOC}</div>
          <div className="sd-field-row">
            <label htmlFor="sd-csv">Paste CSV</label>
            <textarea id="sd-csv" value={csvText} onChange={(e) => setCsvText(e.target.value)} style={{ minHeight: 140 }} />
          </div>
          <div className="sd-settings-btn-row">
            <button className="sd-btn ghost" onClick={() => { setCsvText(INVALID_EXAMPLE_CSV); }}>Load invalid example</button>
          </div>
          {result && (
            <div role="status">
              <p className="sd-rec-text">Imported {result.ok} rows. Quarantined {result.bad.length} rows. Skipped {result.skippedEmpty} blank lines.</p>
              {result.errors.map((e, i) => <div key={i} className="error-box" role="alert">{e}</div>)}
              {result.bad.length > 0 && (
                <table className="sd-quarantine">
                  <thead><tr><th scope="col">Row</th><th scope="col">Company</th><th scope="col">Reason</th></tr></thead>
                  <tbody>{result.bad.map((b, i) => <tr key={i}><td>{b.row}</td><td>{b.company}</td><td>{b.reason}</td></tr>)}</tbody>
                </table>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="sd-settings-row">
        <div className="sd-settings-label">
          <h3>Export</h3>
          <p>Approved, non-excluded accounts become the CSV export. Formula cells are neutralized on export.</p>
        </div>
        <div className="sd-settings-control">
          <p className="sd-export-status" role="status">
            <strong>{accounts.filter((a) => a.reviewState === 'approved').length}</strong> approved,{' '}
            <strong>{exportInfo.approvedExcluded.length}</strong> hard-excluded,{' '}
            <strong>{exportInfo.eligible.length} eligible for export</strong>. Hard-excluded accounts never enter the CSV.
          </p>
          {exportInfo.approvedExcluded.length > 0 && (
            <p className="sd-rec-hint" style={{ display: 'block' }}>Excluded from export: {exportInfo.approvedExcluded.map((a) => a.company).join(', ')}</p>
          )}
          <div className="sd-settings-btn-row">
            <button className="sd-btn primary" onClick={() => downloadText('approved-accounts.csv', approvedToCSV(accounts, weights, criteria), 'text/csv')}>Download approved CSV</button>
          </div>
        </div>
      </div>

      <div className="sd-settings-row">
        <div className="sd-settings-label">
          <h3>Reset</h3>
          <p>Restores the researched default dataset and default weights and criteria. Imported rows are cleared.</p>
        </div>
        <div className="sd-settings-control">
          <div className="sd-settings-btn-row">
            <button className="sd-btn ghost" onClick={reset}>Reset to researched default (clears imports)</button>
          </div>
        </div>
      </div>
    </section>
  );
}
