import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, SlidersHorizontal, X } from 'lucide-react';
import { isValidHttpUrl } from '../lib/datetime';
import { cn } from '../lib/utils';
import { scoreAccount, normalizeWeights, rankAccounts } from './scoring';
import { SAMPLE_ACCOUNTS } from './sampleData';
import { getResearchedAccounts } from './researched';
import type { Account, ReviewState } from './types';
import { AccountLogo } from '@/components/untitled/account-logo';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type { SDState, DatasetChoice } from './SignalDeskApp';

/** Hostname of a validated http(s) URL, for citation display. Never invents
 * a source: returns null for anything invalid or absent. */
function sourceHost(url: string | null): string | null {
  if (!url || !isValidHttpUrl(url)) return null;
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}

function SourceLink({ url }: { url: string | null }) {
  const host = sourceHost(url);
  if (!host || !url) return null;
  return (
    <a href={url} target="_blank" rel="noopener noreferrer">
      {host}
    </a>
  );
}

export const STATUS_FILTERS: { key: string; label: string; test: (a: Account, s: ReturnType<typeof scoreAccount>) => boolean }[] = [
  { key: 'all', label: 'All', test: () => true },
  { key: 'in-review', label: 'In review', test: (a, s) => !s.excluded && a.reviewState === 'in-review' },
  { key: 'needs-review', label: 'Needs review', test: (a, s) => !s.excluded && a.evidenceQuality === 'needs-review' },
  { key: 'approved', label: 'Approved', test: (a, s) => !s.excluded && a.reviewState === 'approved' },
  { key: 'excluded', label: 'Excluded', test: (_a, s) => s.excluded },
];

/** Capability keys, display labels (must match researched.ts's own label
 * strings so the documented-absence wording check below can find them) and
 * the short column abbreviations used in the matrix header. */
const CAPABILITIES: { key: string; label: string; abbr: string }[] = [
  { key: 'signature_verification', label: 'Signature verification', abbr: 'SIG' },
  { key: 'retry_policy', label: 'Retry policy', abbr: 'RTY' },
  { key: 'delivery_logs', label: 'Delivery logs', abbr: 'LOG' },
  { key: 'manual_redelivery', label: 'Manual redelivery', abbr: 'RPL' },
  { key: 'event_filtering', label: 'Event filtering', abbr: 'FLT' },
  { key: 'local_testing', label: 'Local testing', abbr: 'TST' },
];

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Capability matrix cell state. 'on' when a cited fact signal documents the
 * capability. 'absent' only when the account's single capability-unknown
 * signal names this capability in the documented-absence wording researched.ts
 * uses ("{label}: {note}"), never for a capability that is merely missing
 * from the docs (that stays empty: absence of evidence is not evidence of absence).
 */
function capabilityCell(account: Account, cap: { key: string; label: string }): { state: 'on' | 'absent' | ''; title: string; srLabel: string } {
  const fact = account.signals.find((s) => s.kind === 'fact' && s.id.endsWith(`-cap-${cap.key}`));
  if (fact) return { state: 'on', title: `${cap.label}: documented. ${fact.detail}`, srLabel: `${cap.label}: documented.` };
  const unknown = account.signals.find((s) => s.kind === 'unknown' && s.id.endsWith('-cap-unknown'));
  if (unknown && new RegExp(`${escapeRegExp(cap.label)}:\\s`).test(unknown.detail)) {
    return { state: 'absent', title: `${cap.label}: docs explicitly state this is absent.`, srLabel: `${cap.label}: docs state absent.` };
  }
  return { state: '', title: `${cap.label}: not confirmed either way in official docs.`, srLabel: `${cap.label}: not found in official docs.` };
}

const DIMENSION_KEYS = ['fit', 'intent', 'engagement', 'timing'] as const;
type DimensionKey = (typeof DIMENSION_KEYS)[number];

/** Dimensions with a positive (non-zero) score, i.e. actually assessed. */
function assessedDims(a: Account): DimensionKey[] {
  return DIMENSION_KEYS.filter((k) => a.scores[k] > 0);
}

/**
 * Meaningful qualification summary: which dimensions carry evidence, not a
 * static restatement of all four dimension names on every row.
 */
function qualificationSummary(a: Account): { main: string; sub: string } {
  const dims = assessedDims(a);
  if (dims.length === 0) return { main: 'Not assessed', sub: '0 of 4 assessed' };
  const main = dims.map((d) => d[0].toUpperCase() + d.slice(1)).join(' · ');
  return { main, sub: `${dims.length} of 4 assessed` };
}

const QUALITY_CLASS: Record<string, string> = { high: 'green', medium: 'blue', low: 'amber', 'needs-review': 'red' };

function sdStatusInfo(a: Account, s: ReturnType<typeof scoreAccount>): { cls: string; text: string } {
  if (s.excluded) return { cls: 'excluded', text: 'Excluded' };
  const map: Record<ReviewState, { cls: string; text: string }> = {
    'in-review': { cls: 'review', text: 'In review' },
    approved: { cls: 'approved', text: 'Approved' },
    rejected: { cls: 'rejected', text: 'Rejected' },
    unreviewed: { cls: 'unreviewed', text: 'Unreviewed' },
  };
  return map[a.reviewState];
}

const WIDE_BREAKPOINT = 1280;

export function Opportunities({ state }: { state: SDState }) {
  const { accounts, weights, criteria, dataset, switchDataset } = state;
  const [query, setQuery] = useState('');
  const [industry, setIndustry] = useState('All');
  const [hideExcluded, setHideExcluded] = useState(false);
  const [statusFilter, setStatusFilter] = useState('all');
  const [statusPopoverOpen, setStatusPopoverOpen] = useState(false);
  const [moreFiltersOpen, setMoreFiltersOpen] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState<boolean>(
    () => typeof window !== 'undefined' && window.innerWidth >= WIDE_BREAKPOINT
  );
  const [showAllEvidence, setShowAllEvidence] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const lastRowRef = useRef<HTMLElement | null>(null);

  const industries = useMemo(() => ['All', ...Array.from(new Set(accounts.map((a) => a.industry)))], [accounts]);
  const researchedCount = useMemo(() => getResearchedAccounts().length, []);
  const syntheticCount = SAMPLE_ACCOUNTS.length;
  const ranked = useMemo(() => rankAccounts(accounts, weights, criteria), [accounts, weights, criteria]);
  const norm = useMemo(() => normalizeWeights(weights), [weights]);
  const totalFacts = useMemo(
    () => accounts.reduce((acc, a) => acc + a.signals.filter((s) => s.kind === 'fact').length, 0),
    [accounts]
  );

  const statusCounts = useMemo(() => {
    const scored = ranked.map((a) => ({ a, s: scoreAccount(a, weights, criteria) }));
    const out: Record<string, number> = {};
    STATUS_FILTERS.forEach((f) => {
      out[f.key] = scored.filter(({ a, s }) => f.test(a, s)).length;
    });
    return out;
  }, [ranked, weights, criteria]);

  const statusTest = STATUS_FILTERS.find((f) => f.key === statusFilter)?.test ?? STATUS_FILTERS[0].test;
  const filtered = ranked.filter((a) => {
    const s = scoreAccount(a, weights, criteria);
    if (hideExcluded && s.excluded) return false;
    if (!statusTest(a, s)) return false;
    if (industry !== 'All' && a.industry !== industry) return false;
    if (query && !`${a.company} ${a.domain}`.toLowerCase().includes(query.toLowerCase())) return false;
    return true;
  });

  const selected = filtered.find((a) => a.id === openId) ?? filtered[0] ?? null;
  const selectedScore = selected ? scoreAccount(selected, weights, criteria) : null;
  const selectedRank = selected ? filtered.findIndex((a) => a.id === selected.id) + 1 : 0;

  useEffect(() => {
    setShowAllEvidence(false);
  }, [selected?.id]);

  // Auto-close the floating panel when the viewport narrows past the point
  // where it's reserved table space, so it doesn't linger as an unexpected
  // overlay after a resize.
  useEffect(() => {
    function onResize() {
      if (window.innerWidth < WIDE_BREAKPOINT && panelOpen && !openId) {
        setPanelOpen(false);
      }
    }
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [panelOpen, openId]);

  function selectRow(id: string, trigger?: HTMLElement) {
    setOpenId(id);
    setPanelOpen(true);
    if (trigger) lastRowRef.current = trigger;
  }

  function closePanel() {
    setPanelOpen(false);
  }

  // Focus management: steal focus into the panel only when it was explicitly
  // opened by the user (openId set by a row click/Enter) — never for the
  // panel shown by default on desktop load, so the first Tab after the skip
  // link still walks the page normally. Returning focus to the triggering
  // row on close is safe either way, since it only runs after an explicit
  // open set lastRowRef in the first place.
  const isModalPanel = openId !== null;
  useEffect(() => {
    if (panelOpen) {
      if (isModalPanel) panelRef.current?.focus();
    } else {
      lastRowRef.current?.focus();
    }
  }, [panelOpen, isModalPanel]);

  useEffect(() => {
    if (!panelOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') closePanel();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [panelOpen]);

  const statusLabel = STATUS_FILTERS.find((f) => f.key === statusFilter)?.label ?? 'All';

  return (
    <div className={cn('sd-opp', panelOpen && 'sd-panel-is-open')}>
      <header className="sd-opp-header">
        <h1 className="sd-page-title">Opportunities</h1>
      </header>

      {/* Chip row */}
      <div className="sd-chip-row">
        <div className="sd-chip sd-chip-search">
          <Search size={14} className="sd-chip-icon" aria-hidden="true" />
          <label htmlFor="sd-search" className="sr-only">
            Search accounts
          </label>
          <input
            id="sd-search"
            type="text"
            placeholder="Search company or domain"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        <Popover open={statusPopoverOpen} onOpenChange={setStatusPopoverOpen}>
          <PopoverTrigger asChild>
            <button type="button" className="sd-chip sd-chip-btn" aria-expanded={statusPopoverOpen}>
              Status
              <span className="sd-chip-value">{statusLabel}</span>
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="sd-popover-content">
            <div className="sd-seg" role="group" aria-label="Status filter">
              {STATUS_FILTERS.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  aria-pressed={statusFilter === f.key}
                  onClick={() => {
                    setStatusFilter(f.key);
                    setStatusPopoverOpen(false);
                  }}
                >
                  {f.label}
                  <span>{statusCounts[f.key] ?? 0}</span>
                </button>
              ))}
            </div>
          </PopoverContent>
        </Popover>

        <div className="sd-chip sd-chip-select">
          <label htmlFor="sd-industry" className="sr-only">
            Industry
          </label>
          <select id="sd-industry" value={industry} onChange={(e) => setIndustry(e.target.value)}>
            {industries.map((i) => (
              <option key={i} value={i}>
                {i}
              </option>
            ))}
          </select>
        </div>

        <div className="sd-chip sd-chip-select">
          <label htmlFor="sd-dataset" className="sr-only">
            Dataset
          </label>
          <select id="sd-dataset" value={dataset} onChange={(e) => switchDataset(e.target.value as DatasetChoice)}>
            <option value="researched">Researched ({researchedCount} accounts)</option>
            <option value="synthetic">Synthetic ({syntheticCount} accounts)</option>
          </select>
        </div>

        <Popover open={moreFiltersOpen} onOpenChange={setMoreFiltersOpen}>
          <PopoverTrigger asChild>
            <button type="button" className="sd-chip sd-chip-btn" aria-expanded={moreFiltersOpen}>
              <SlidersHorizontal size={13} className="sd-chip-icon" aria-hidden="true" />
              More filters
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" forceMount className="sd-popover-content sd-more-filters">
            <label htmlFor="sd-hide-excluded" className="sd-check-row">
              <input
                id="sd-hide-excluded"
                type="checkbox"
                checked={hideExcluded}
                onChange={(e) => setHideExcluded(e.target.checked)}
              />
              Hide excluded
            </label>
          </PopoverContent>
        </Popover>
      </div>

      {norm.equalFallback && (
        <div className="warn-box sd-warn" role="status">
          All weights are zero, so equal weighting is used. Edit weights in Target and Data to differentiate accounts.
        </div>
      )}

      {/* Summary line */}
      <div className="sd-summary">
        <div className="sd-summary-item">
          <span className="sd-summary-label">Accounts</span>
          <span className="sd-summary-value">{accounts.length}</span>
        </div>
        {dataset === 'researched' ? (
          <>
            <div className="sd-summary-item">
              <span className="sd-summary-label">Cited facts</span>
              <span className="sd-summary-value">{totalFacts}</span>
            </div>
            <div className="sd-summary-item">
              <span className="sd-summary-label">Commercial intent</span>
              <span className="sd-summary-value sd-summary-muted">Not assessed</span>
            </div>
          </>
        ) : (
          <div className="sd-summary-item">
            <span className="sd-summary-label">Sample</span>
            <span className="sd-summary-value sd-summary-muted">Synthetic, fictional companies</span>
          </div>
        )}
      </div>

      {/* Table */}
      <div className="sd-content">
        {filtered.length === 0 ? (
          <div className="warn-box" role="status">
            No accounts match these filters. Clear the search or include excluded accounts.
          </div>
        ) : (
          <>
          {dataset === 'researched' && (
            <div className="sd-matrix-legend" role="note">
              <span className="sd-matrix-legend-item"><span className="sd-cell on" aria-hidden="true" /> Documented</span>
              <span className="sd-matrix-legend-item"><span className="sd-cell absent" aria-hidden="true" /> Docs state absent</span>
              <span className="sd-matrix-legend-item"><span className="sd-cell" aria-hidden="true" /> Not found</span>
            </div>
          )}
          <table className="sd-ledger">
            <thead>
              <tr>
                <th scope="col">#</th>
                <th scope="col">Account</th>
                <th scope="col" className="hidden md:table-cell" title={dataset === 'researched' ? 'Documented capabilities, confirmed from official docs' : 'Fit, intent, engagement and timing scores'}>
                  {dataset === 'researched' ? 'Capabilities' : 'Scores'}
                </th>
                <th scope="col" className="hidden md:table-cell">
                  Qualification
                </th>
                <th scope="col" className="text-right">
                  Score
                </th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((a, idx) => {
                const s = scoreAccount(a, weights, criteria);
                const isSelected = selected?.id === a.id && panelOpen;
                const status = sdStatusInfo(a, s);
                const qual = qualificationSummary(a);
                const leadWithFit = a.scoreOrigin === 'analyst-heuristic';
                return (
                  <tr
                    key={a.id}
                    id={`sd-row-${a.id}`}
                    aria-selected={isSelected}
                    tabIndex={0}
                    className={cn(s.excluded && 'is-excluded')}
                    onClick={(e) => selectRow(a.id, e.currentTarget)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') selectRow(a.id, e.currentTarget);
                    }}
                  >
                    <td className="num" style={{ color: 'var(--sd-faint)' }}>
                      {idx + 1}
                    </td>
                    <td className="max-w-[38vw] md:max-w-none">
                      <div className="sd-account-cell">
                        <AccountLogo company={a.company} domain={a.domain} size={28} />
                        <div className="flex flex-col min-w-0 flex-1">
                          <span className="truncate sd-account-name">{a.company}</span>
                          <span className="truncate sd-account-domain">{a.domain}</span>
                        </div>
                      </div>
                    </td>
                    <td className="hidden md:table-cell" title={dataset === 'researched' ? 'Documented capabilities' : undefined}>
                      {a.dataset === 'researched' ? (
                        <div className="sd-matrix" role="group" aria-label={`${a.company} documented webhook capabilities`}>
                          {CAPABILITIES.map((c) => {
                            const cell = capabilityCell(a, c);
                            return (
                              <span key={c.key} className="sd-matrix-item">
                                <span className={cn('sd-cell', cell.state)} title={cell.title} aria-hidden="true" />
                                <span className="sr-only">{cell.srLabel}</span>
                              </span>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="sd-dims" title={`Fit ${a.scores.fit}% · Intent ${a.scores.intent}% · Engagement ${a.scores.engagement}% · Timing ${a.scores.timing}%`}>
                          {DIMENSION_KEYS.map((k) => (
                            <div key={k} className="sd-dim">
                              <i style={{ height: `${a.scores[k]}%` }} />
                            </div>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="hidden md:table-cell">
                      <div className="sd-qual-cell" title={`${qual.sub} (${qual.main})`}>
                        <span className="sd-qual-main">{qual.main}</span>
                        <span className="sd-qual-sub">{qual.sub}</span>
                      </div>
                    </td>
                    <td className="num sd-score">
                      {leadWithFit ? (
                        <>
                          <div className="sd-score-fit-lead">
                            <span className="sd-score-fit-value">Fit {a.scores.fit}</span>
                            <span className="sd-score-assessed">{assessedDims(a).length} of 4 assessed</span>
                          </div>
                          <div className="sd-score-weighted" title="Weighted total counts unassessed dimensions as 0">
                            <strong>{s.excluded ? 'excl' : s.total}</strong>
                            <small>/100 weighted</small>
                          </div>
                        </>
                      ) : (
                        <>
                          <strong>{s.excluded ? 'excl' : s.total}</strong>
                          <small>/100</small>
                        </>
                      )}
                    </td>
                    <td>
                      <div className="flex flex-col gap-0.5">
                        <span className={`sd-status ${status.cls}`} title={s.excluded ? s.exclusionReason ?? '' : undefined}>
                          {status.text}
                        </span>
                        <span className="sd-status-sub md:whitespace-nowrap">
                          Evidence <span className={`badge sd-quality ${QUALITY_CLASS[a.evidenceQuality] ?? 'gray'}`}>{a.evidenceQuality}</span>
                        </span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </>
        )}
      </div>

      {/* Floating detail panel */}
      {selected && selectedScore && panelOpen && (
        <Panel
          account={selected}
          score={selectedScore}
          rank={selectedRank}
          total={filtered.length}
          showAllEvidence={showAllEvidence}
          setShowAllEvidence={setShowAllEvidence}
          onClose={closePanel}
          panelRef={panelRef}
          isModal={isModalPanel}
        />
      )}
    </div>
  );
}

function Panel({
  account,
  score,
  rank,
  total,
  showAllEvidence,
  setShowAllEvidence,
  onClose,
  panelRef,
  isModal,
}: {
  account: Account;
  score: ReturnType<typeof scoreAccount>;
  rank: number;
  total: number;
  showAllEvidence: boolean;
  setShowAllEvidence: (v: boolean) => void;
  onClose: () => void;
  panelRef: React.RefObject<HTMLDivElement | null>;
  /** True once the user has explicitly opened a row (click/Enter), vs. the
   * panel shown by default on desktop: only the explicit case behaves as a
   * focus-stealing modal dialog. */
  isModal: boolean;
}) {
  const factSignals = account.signals.filter((x) => x.kind === 'fact');
  const hypothesisSignal = account.signals.find((x) => x.kind === 'hypothesis') ?? null;
  const unknownSignals = account.signals.filter((x) => x.kind === 'unknown');
  const nextStepSignal = account.signals.find((x) => x.kind === 'next-step') ?? null;
  const visibleFacts = showAllEvidence ? factSignals : factSignals.slice(0, 4);
  const validDomain = isValidHttpUrl(`https://${account.domain}`);
  const allUnknowns = [...unknownSignals.map((x) => x.detail), ...(account.unknowns ?? [])];

  return (
    <div className="sd-panel-backdrop">
      <div
        className="sd-panel"
        role={isModal ? 'dialog' : 'region'}
        aria-modal={isModal || undefined}
        aria-label={`${account.company} account detail`}
        ref={panelRef}
        tabIndex={isModal ? -1 : undefined}
      >
        <div className="sd-panel-head">
          <div className="sd-panel-company">
            <AccountLogo company={account.company} domain={account.domain} size={24} />
            <div className="flex flex-col min-w-0">
              <span className="sd-panel-company-name">{account.company}</span>
              {validDomain ? (
                <a href={`https://${account.domain}`} target="_blank" rel="noopener noreferrer" className="sd-panel-domain">
                  {account.domain}
                </a>
              ) : (
                <span className="sd-panel-domain muted">{account.domain}</span>
              )}
            </div>
          </div>
          <button type="button" className="sd-panel-close" onClick={onClose} aria-label="Close account detail">
            <X size={16} />
          </button>
        </div>

        <div className="sd-panel-body">
          {account.scoreOrigin === 'analyst-heuristic' ? (
            <>
              <div className="sd-panel-score">
                <span className="sd-panel-score-value">Fit {account.scores.fit}</span>
                <span className="sd-panel-score-unit">{assessedDims(account).length} of 4 assessed</span>
              </div>
              <p className="sd-panel-score-sub">
                Weighted total: <strong>{score.excluded ? 'excl' : score.total}</strong>/100
                <span className="sd-rec-hint"> Weighted total counts unassessed dimensions as 0.</span>
              </p>
            </>
          ) : (
            <>
              <div className="sd-panel-score">
                <span className="sd-panel-score-value">{score.excluded ? 'excl' : score.total}</span>
                <span className="sd-panel-score-unit">/100 heuristic score</span>
              </div>
              <p className="sd-panel-score-sub">
                {score.excluded ? (
                  <>
                    Hard-excluded <span style={{ color: 'var(--sd-oxide)' }}>&middot; {score.exclusionReason}</span>
                  </>
                ) : (
                  `Rank ${rank} of ${total}`
                )}
              </p>
            </>
          )}

          <section className="sd-section">
            <h3>Assessment</h3>
            <div className="sd-timeline">
              <div className="sd-tl-row">
                <span className="sd-tl-dot documented" />
                <div className="sd-tl-body">
                  <span className="sd-tl-label">Documented</span>
                  <span className="sd-tl-value">{factSignals.length} cited facts</span>
                </div>
              </div>
              <div className="sd-tl-row">
                <span className="sd-tl-dot hypothesis" />
                <div className="sd-tl-body">
                  <span className="sd-tl-label">Working hypothesis, unvalidated</span>
                  <span className="sd-tl-value">{account.problem ?? hypothesisSignal?.detail ?? 'No hypothesis documented.'}</span>
                </div>
              </div>
              <div className="sd-tl-row">
                <span className="sd-tl-dot unknown" />
                <div className="sd-tl-body">
                  <span className="sd-tl-label">Unknown</span>
                  <span className="sd-tl-value">{allUnknowns.length} open questions</span>
                </div>
              </div>
              {(nextStepSignal || account.discoveryQuestion) && (
                <div className="sd-tl-row">
                  <span className="sd-tl-dot next" />
                  <div className="sd-tl-body">
                    <span className="sd-tl-label">Next step</span>
                    <span className="sd-tl-value">
                      {nextStepSignal?.detail}
                      {account.discoveryQuestion && (
                        <em className="block mt-1">&ldquo;{account.discoveryQuestion}&rdquo;</em>
                      )}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </section>

          <section className="sd-section">
            <h3>Qualification</h3>
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
            <p className="sd-contrib">{score.parts.map((p) => `${p.key} wt ${p.weight} → +${p.contribution}`).join(' · ')}</p>
          </section>

          <section className="sd-section">
            <h3>Evidence ({factSignals.length})</h3>
            {visibleFacts.length === 0 && <p style={{ color: 'var(--sd-faint)' }}>No cited facts.</p>}
            {visibleFacts.map((x) => (
              <div key={x.id} className="sd-ev-row">
                <div>
                  <div className="sd-ev-label">{x.label}</div>
                  <div className="sd-ev-detail">{x.detail}</div>
                  <div className="sd-cite mt-1">
                    {sourceHost(x.provenance.sourceUrl) ? (
                      <>
                        <SourceLink url={x.provenance.sourceUrl} />
                        {x.provenance.retrievalDate ? ` · retrieved ${x.provenance.retrievalDate}` : ''}
                      </>
                    ) : (
                      'Synthetic sample, no public source'
                    )}
                  </div>
                </div>
              </div>
            ))}
            {factSignals.length > 4 && (
              <button type="button" className="sd-btn ghost mt-2" onClick={() => setShowAllEvidence(!showAllEvidence)}>
                {showAllEvidence ? 'Show fewer' : `Show all ${factSignals.length}`}
              </button>
            )}
          </section>

          {allUnknowns.length > 0 && (
            <section className="sd-section">
              <h3>Unknown</h3>
              <ul className="sd-unknown-list">
                {allUnknowns.map((u, i) => (
                  <li key={i}>{u}</li>
                ))}
              </ul>
            </section>
          )}

          {account.reasonsNotToPursue && account.reasonsNotToPursue.length > 0 && (
            <section className="sd-section">
              <h3>Reasons not to pursue</h3>
              <ul className="sd-reasons">
                {account.reasonsNotToPursue.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <div className="sd-panel-footer">
          <Link className="sd-btn primary w-full justify-center" to={`/signaldesk/brief/${account.id}`}>
            Open full brief
          </Link>
        </div>
      </div>
    </div>
  );
}
