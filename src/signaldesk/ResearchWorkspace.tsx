import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { SignalDeskLogo } from './SignalDeskLogo';
import { ArrowDown, ArrowRight, ArrowUpRight, BookOpen, Check, ChevronRight, Download, FileText, HelpCircle, ListFilter, Plus, Search, Settings2, ShieldCheck, Trash2, Upload, X } from 'lucide-react';
import { CRITERIA, blankEvidence, evidenceAge, isWorkspace, MAX_EVIDENCE, qualify, readWorkspace, RESEARCH_STORAGE, reviseAccount, today, validSourceUrl, type AssessmentState, type Criterion, type EvidenceRecord, type ResearchAccount, type ResearchWorkspace } from './researchModel';
import { exampleWorkspace } from './researchExamples';
import { writeWorkspace } from './researchStorage';
import { briefFacts, exportLimitations, researchMarkdown } from './researchExport';
import { mergeEvidence } from './researchImport';
import { AccountForm, EvidenceForm, ResearchDialog } from './ResearchDialogs';
import { ResearchImportPanel } from './ResearchImportPanel';
import { PrintBrief } from './ResearchBrief';
import { downloadText } from '../lib/utils';
import './research.css';
import './research-design.css';

type View = 'accounts' | 'import' | 'method';
type DetailTab = 'evidence' | 'qualification' | 'brief';
const MATRIX_LABELS: Record<Criterion, string> = { product: 'Product', customer: 'ICP', geography: 'US', timing: 'Timing', workflow: 'Need', access: 'Route' };
const MARKS: Record<AssessmentState, string> = { supported: '✓', contrary: '−', unknown: '?', stale: '↻', conflict: '!' };
function SourceLink({ e }: { e: EvidenceRecord }) { return validSourceUrl(e.sourceUrl) ? <a className="sd-r-source-link" href={e.sourceUrl} target="_blank" rel="noopener noreferrer">{e.sourceTitle || new URL(e.sourceUrl).hostname}<ArrowUpRight size={12} /></a> : <span>No source linked</span>; }
function load() {
  try {
    const raw = localStorage.getItem(RESEARCH_STORAGE);
    return { ...readWorkspace(raw, exampleWorkspace()), recovery: raw };
  } catch { return { workspace: exampleWorkspace(), notice: 'Browser storage is unavailable. Edits will stay in memory; download a backup before leaving.', recovery: null }; }
}

export default function ResearchWorkspaceApp() {
  const location = useLocation();
  const navigate = useNavigate();
  const [boot] = useState(load);
  const [workspace, setWorkspace] = useState(boot.workspace);
  const [saveError, setSaveError] = useState('');
  const savedRaw = useRef(boot.recovery);
  const [saveConflict, setSaveConflict] = useState(false);
  const [reloadModal, setReloadModal] = useState(false);
  const [message, setMessage] = useState('');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [sort, setSort] = useState<'name' | 'coverage'>('coverage');
  const [selectedId, setSelectedId] = useState(() => /\/(?:brief|print)\/([^/]+)$/.exec(location.pathname)?.[1] ?? boot.workspace.accounts[0]?.id ?? '');
  const [tab, setTab] = useState<DetailTab>('evidence');
  const [evidenceFilter, setEvidenceFilter] = useState('all');
  const [evidenceSearch, setEvidenceSearch] = useState('');
  const [criterionFilter, setCriterionFilter] = useState<Criterion | 'all'>('all');
  const [accountModal, setAccountModal] = useState<'new' | 'edit' | null>(null);
  const [editEvidence, setEditEvidence] = useState<EvidenceRecord | null>(null);
  const [deleteEvidence, setDeleteEvidence] = useState<EvidenceRecord | null>(null);
  const [deleteAccount, setDeleteAccount] = useState(false);
  const [reviewModal, setReviewModal] = useState(false);
  const [reviewChecked, setReviewChecked] = useState(false);
  const [sidebar, setSidebar] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const view: View = location.pathname.endsWith('/data') ? 'import' : location.pathname.endsWith('/method') ? 'method' : 'accounts';
  const routeId = /\/(?:brief|print)\/([^/]+)$/.exec(location.pathname)?.[1];
  const selected = workspace.accounts.find(a => a.id === (routeId ?? selectedId));
  const isPrint = /\/print\//.test(location.pathname);
  useEffect(() => { if (routeId) setSelectedId(routeId); }, [routeId]);
  // The public project root is owned by RouteMetadata; workspace screens keep their descriptive titles.
  useEffect(() => { if (!isPrint && !/^\/signaldesk\/?$/.test(location.pathname)) document.title = `${view === 'accounts' ? 'Account research' : view === 'import' ? 'Import research' : 'Research method'} · SignalDesk`; }, [view, isPrint, location.pathname]);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (e.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(tag) && !document.querySelector('dialog[open]')) { e.preventDefault(); searchRef.current?.focus(); }
      if (e.key === 'Escape') setSidebar(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);
  useEffect(() => {
    const handler = (event: StorageEvent) => {
      if (event.key === RESEARCH_STORAGE && event.newValue !== savedRaw.current) { setSaveConflict(true); setSaveError('Another tab changed the saved workspace. Download a backup of this tab before loading the latest saved research.'); }
    };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }, []);
  const filtered = useMemo(() => workspace.accounts.filter(a => {
    const q = qualify(a);
    return [a.name, a.domain, a.sector, ...a.evidence.map(e => e.claim)].join(' ').toLowerCase().includes(search.toLowerCase()) && (filter === 'all' || filter === 'reviewed' && a.review === 'reviewed' || filter === 'draft' && a.review === 'draft' || filter === 'attention' && (q.conflicts > 0 || q.stale > 0) || filter === 'user' && a.origin === 'user');
  }).sort((a, b) => sort === 'name' ? a.name.localeCompare(b.name) : qualify(b).supported - qualify(a).supported || a.name.localeCompare(b.name)), [workspace.accounts, search, filter, sort]);
  function persist(next: ResearchWorkspace, notice = 'Saved in this browser.') {
    if (!isWorkspace(next)) { setMessage('Change could not be saved: invalid record. Your current workspace is unchanged.'); return false; }
    setWorkspace(next);
    let result;
    try { result = writeWorkspace(localStorage, next, savedRaw.current); }
    catch { result = { status: 'unavailable' as const, message: 'Could not save to browser storage. Your changes are in memory only. Download a workspace backup before leaving.' }; }
    if (result.status === 'saved') { savedRaw.current = result.raw; setSaveError(''); setSaveConflict(false); setMessage(notice); }
    else { setSaveError(result.message); setSaveConflict(result.status === 'conflict'); setMessage(''); }
    return true;
  }
  function updateAccount(next: ResearchAccount, notice?: string) {
    const applied = persist({ ...workspace, accounts: workspace.accounts.some(a => a.id === next.id) ? workspace.accounts.map(a => a.id === next.id ? next : a) : [...workspace.accounts, next] }, notice);
    if (applied) setSelectedId(next.id);
    return applied;
  }
  function selectAccount(id: string) { setSelectedId(id); setCriterionFilter('all'); setEvidenceSearch(''); setEvidenceFilter('all'); navigate(`/signaldesk/brief/${id}`); }
  function openImport() { setSelectedId(selected?.id ?? workspace.accounts[0]?.id ?? ''); navigate('/signaldesk/data'); }
  const q = selected ? qualify(selected) : null;
  const facts = selected ? briefFacts(selected) : [];
  const visibleEvidence = selected?.evidence.filter(e => (criterionFilter === 'all' || e.criterion === criterionFilter) && (evidenceFilter === 'all' || evidenceFilter === 'unchecked' && e.verification === 'unverified' || e.kind === evidenceFilter || evidenceFilter === 'stale' && evidenceAge(e).stale || evidenceFilter === 'disputed' && e.verification === 'disputed') && `${e.claim} ${e.excerpt} ${e.sourceUrl}`.toLowerCase().includes(evidenceSearch.toLowerCase())) ?? [];
  if (isPrint) return selected ? <PrintBrief account={selected} /> : <div className="sd-r-missing"><h1>Account not found</h1><p>This browser has no saved account at this address. Import the research backup to use it on another device.</p><Link to="/signaldesk">Back to account research</Link></div>;
  return <div className="sd-research">
    <aside id="sd-workspace-navigation" className={`sd-r-sidebar ${sidebar ? 'is-open' : ''}`}>
      <Link to="/signaldesk" className="sd-r-brand"><SignalDeskLogo /><span>SignalDesk<span className="sd-r-brand-sub">THE RESEARCH LEDGER</span></span></Link>
      <div className="sd-r-workspace-name"><span className="sd-r-avatar" aria-hidden="true">01</span><div>Personal workspace<small>Independent account research</small></div></div>
      <p className="sd-r-nav-label">WORKSPACE</p>
      <nav aria-label="SignalDesk sections">
        <Link className={view === 'accounts' ? 'active' : ''} to={selected ? `/signaldesk/brief/${selected.id}` : '/signaldesk'} onClick={() => setSidebar(false)}><BookOpen size={17} />Accounts<span>{workspace.accounts.length}</span></Link>
        <Link className={view === 'import' ? 'active' : ''} to="/signaldesk/data" onClick={() => setSidebar(false)}><Upload size={17} />Import & backup</Link>
        <Link className={view === 'method' ? 'active' : ''} to="/signaldesk/method" onClick={() => setSidebar(false)}><HelpCircle size={17} />Method & walkthrough</Link>
      </nav>
      <div className="sd-r-sidebar-note"><span className="sd-r-eyebrow">THE RESEARCH STANDARD</span><p>Every claim needs a trail.</p><span>Facts have sources.<br />Hypotheses have labels.<br />Unknowns stay unknown.</span></div>
      <div className="sd-r-sidebar-bottom"><span><ShieldCheck size={15} />Local to this browser</span><small>Your sources. Your judgment.</small><Link className="sd-r-author" to="/">Zayyan Latif <ArrowUpRight size={12} /></Link><span className="sd-r-edition">SIGNALDESK <span>/</span> RESEARCH SYSTEM</span></div>
    </aside>
    <div className="sd-r-content">
      <div className="sd-r-topbar"><button className="sd-r-mobile-menu" onClick={() => setSidebar(!sidebar)} aria-expanded={sidebar} aria-controls="sd-workspace-navigation"><Settings2 size={16} /> Workspace</button><span className="sd-r-breadcrumb"><span className="sd-r-breadcrumb-root">Workspace</span> <ChevronRight size={12} /> {view === 'accounts' ? 'Account research' : view === 'import' ? 'Import & backup' : 'Method & walkthrough'}</span><span className="sd-r-top-note">Public sources <span>/</span> Independent research</span></div>
      <main id="main">
        <div className="sd-r-notices" aria-live="polite">{boot.notice && <p className="sd-r-warning">{boot.notice} <button onClick={openImport}>Backup & recovery</button></p>}{saveError && <p className="sd-r-error" role="alert">{saveError} <button onClick={openImport}>Download backup</button>{saveConflict && <button onClick={() => setReloadModal(true)}>Load latest saved research</button>}</p>}{message && <p className="sd-r-toast" role="status">{message}<button className="sd-r-icon" onClick={() => setMessage('')} aria-label="Dismiss notification"><X size={14} /></button></p>}</div>
        {view === 'accounts' && <>
          <header className="sd-r-page-head"><div><p className="sd-r-eyebrow sd-r-page-kicker"><span aria-hidden="true">●</span> THE RESEARCH LEDGER</p><h1>Account <em>research</em></h1><p>Follow the evidence. Make the next move count.</p></div><button className="primary" onClick={() => setAccountModal('new')}><Plus size={17} /> Add company</button></header>
          <div className="sd-r-ledger-meta"><span><strong>{workspace.accounts.length}</strong> accounts</span><span><strong>{workspace.accounts.reduce((n, a) => n + a.evidence.length, 0)}</strong> evidence records</span><span>Buying intent <strong>Not established</strong></span><Link to="/signaldesk/method">How qualification works <ArrowUpRight size={13} /></Link></div>
          <div className="sd-r-workbench">
            <div className="sd-r-ledger-column"><div className="sd-r-section-label"><span><b>01</b> Company index</span><span>Six questions. Every answer traceable.</span></div>
              <div className="sd-r-toolbar"><label className="sd-r-search"><Search size={16} /><input ref={searchRef} aria-label="Search accounts" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search accounts or evidence" /><kbd>/</kbd></label><label className="sd-r-filter"><ListFilter size={15} /><select aria-label="Filter accounts" value={filter} onChange={e => setFilter(e.target.value)}><option value="all">All accounts</option><option value="attention">Needs attention</option><option value="draft">Draft briefs</option><option value="reviewed">Reviewed briefs</option><option value="user">My accounts</option></select></label><button className="sd-r-sort" aria-label={`Sort by ${sort === 'coverage' ? 'name' : 'coverage'}`} onClick={() => setSort(sort === 'coverage' ? 'name' : 'coverage')}><ArrowDown size={14} />{sort === 'coverage' ? 'Coverage' : 'A–Z'}</button></div>
              <div className="sd-r-table-wrap" role="region" aria-label="Scrollable account evidence matrix" tabIndex={0}><table className="sd-r-account-table"><caption className="sr-only">Account evidence matrix. Select an account or a question to inspect supporting evidence.</caption><thead><tr><th scope="col">Company</th><th scope="col" className="sd-r-matrix-heading">Evidence matrix<div>{CRITERIA.map(c => <abbr key={c.key} title={`${c.label}: ${c.question}`}>{MATRIX_LABELS[c.key]}</abbr>)}</div></th><th scope="col">Supported</th></tr></thead><tbody>
                {filtered.map(a => { const qual = qualify(a); return <tr key={a.id} className={selected?.id === a.id ? 'selected' : ''}>
                  <td><button className="sd-r-account-button" aria-label={`Open ${a.name} research`} aria-pressed={selected?.id === a.id} onClick={() => selectAccount(a.id)} onKeyDown={e => { if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); const i = filtered.findIndex(x => x.id === a.id); const next = filtered[i + (e.key === 'ArrowDown' ? 1 : -1)]; if (next) { selectAccount(next.id); document.querySelector<HTMLButtonElement>(`button[data-account-id="${next.id}"]`)?.focus(); } } }} data-account-id={a.id}><span className={`sd-r-company-initial ${a.name === 'Firecrawl' ? 'clay' : a.name === 'Resend' ? 'ink' : 'sage'}`}>{a.name.slice(0, 1)}</span><span>{a.name}<small>{a.domain}</small></span></button></td>
                  <td><div className="sd-r-matrix">{qual.assessments.map(s => <button key={s.criterion} className={`sd-r-cell ${s.state}`} aria-label={`${a.name}: ${CRITERIA.find(c => c.key === s.criterion)!.label} ${s.state}`} title={s.reason} onClick={() => { selectAccount(a.id); setCriterionFilter(s.criterion); setTab('qualification'); }}>{MARKS[s.state]}</button>)}</div></td>
                  <td><button className="sd-r-coverage" onClick={() => { selectAccount(a.id); setTab('qualification'); }} aria-label={`${a.name}: ${qual.supported} supported, ${qual.unknown} unknown or blocked`}><strong>{qual.supported}<span>/6</span></strong><small>{qual.unknown} unknown{qual.stale ? ' / stale' : qual.conflicts ? ' / conflict' : ''}</small></button></td>
                </tr>; })}
              </tbody></table></div><p className="sd-r-scroll-cue">Scroll to compare all six questions <ArrowRight size={13} /></p>
              {!filtered.length && <div className="sd-r-empty"><Search size={24} strokeWidth={1.3} /><h2>{workspace.accounts.length ? 'No accounts match' : 'Start with a company'}</h2><p>{workspace.accounts.length ? 'Try a company, domain, or phrase from its evidence.' : 'Add a company, capture its public sources, and build a brief you can stand behind.'}</p>{workspace.accounts.length ? <button onClick={() => { setSearch(''); setFilter('all'); }}>Clear search & filters</button> : <button className="primary" onClick={() => setAccountModal('new')}>Add company</button>}</div>}
              <div className="sd-r-matrix-legend"><span><i className="supported">✓</i>Supported</span><span><i>?</i>Unknown</span><span><i className="stale">↻</i>Stale</span><span><i className="conflict">!</i>Conflict</span><span><i className="contrary">−</i>Contrary</span><small>Click a question to inspect.</small></div>
              {selected && q ? <section key={selected.id} className="sd-r-account-detail" aria-labelledby="sd-detail-name">
                <header className="sd-r-detail-head"><div><span className="sd-r-eyebrow"><b className="sd-r-section-number">02</b> {selected.origin === 'independent' ? 'INDEPENDENT PUBLIC RESEARCH' : 'YOUR RESEARCH / UNVERIFIED UNTIL CHECKED'}</span><h2 id="sd-detail-name">{selected.name}</h2><p>{selected.sector} <span>·</span> <time dateTime={selected.updatedAt}>Updated {selected.updatedAt}</time></p></div><div className="sd-r-detail-head-actions"><Link className="sd-r-button" to={`/signaldesk/print/${selected.id}`}>Export brief <ArrowUpRight size={13} /></Link><button aria-label="Edit selected account" className="sd-r-icon" onClick={() => setAccountModal('edit')}><Settings2 size={17} /></button></div></header>
                <div className="sd-r-tabs sd-r-detail-tabs" data-active={tab} aria-label="Account detail sections"><span className="sd-r-tab-marker" aria-hidden="true" />{(['evidence', 'qualification', 'brief'] as const).map(t => <button key={t} aria-pressed={tab === t} onClick={() => { setTab(t); if (t !== 'qualification') setCriterionFilter('all'); }}>{t === 'evidence' ? `Evidence (${selected.evidence.length})` : t === 'qualification' ? 'Qualification' : 'Analyst brief'}</button>)}</div>
                {tab === 'evidence' && <>
                  <div className="sd-r-evidence-toolbar"><label className="sd-r-search"><Search size={15} /><input aria-label="Search evidence" value={evidenceSearch} onChange={e => setEvidenceSearch(e.target.value)} placeholder="Find a claim or source" /></label><select aria-label="Filter evidence" value={evidenceFilter} onChange={e => setEvidenceFilter(e.target.value)}><option value="all">All evidence</option><option value="fact">Fact claims</option><option value="inference">Inferences</option><option value="unknown">Unknowns</option><option value="unchecked">Unverified</option><option value="stale">Stale sources</option><option value="disputed">Disputed</option></select><button disabled={selected.evidence.length >= MAX_EVIDENCE} title={selected.evidence.length >= MAX_EVIDENCE ? '200-record limit reached. Back up and remove old evidence before adding more.' : 'Add evidence'} onClick={() => setEditEvidence(blankEvidence())}><Plus size={14} /> Add</button></div>
                  {selected.evidence.length >= MAX_EVIDENCE && <p className="sd-r-warning">This account has reached its 200-record evidence limit. Back up and remove old evidence before adding more.</p>}
                  {visibleEvidence.map((e, i) => { const age = evidenceAge(e); return <article className="sd-r-evidence-record" key={e.id}>
                    <div className="sd-r-evidence-gutter">{String(i + 1).padStart(2, '0')}</div><div className="sd-r-evidence-body"><div className="sd-r-record-tags"><span className={`sd-r-tag ${e.kind}`}>{e.kind === 'fact' ? 'FACT CLAIM' : e.kind === 'inference' ? 'HYPOTHESIS' : 'UNKNOWN'}</span><span className={`sd-r-tag ${e.verification}`}>{e.verification === 'verified' ? 'SOURCE CHECKED' : e.verification.toUpperCase()}</span>{age.stale && <span className="sd-r-tag stale">STALE</span>}<span className="sd-r-record-question">{CRITERIA.find(c => c.key === e.criterion)!.label} / {e.stance}</span></div><h3>{e.claim}</h3><blockquote>{e.excerpt ? <>“{e.excerpt}”</> : 'No excerpt captured. Open the source and add relevant text.'}</blockquote><div className="sd-r-source-meta"><SourceLink e={e} /><span>Published {e.publicationDate ?? 'unknown'} · Retrieved {e.retrievalDate ?? 'unknown'}</span></div>{age.stale && <p className="sd-r-stale-note">{age.reason}</p>}{e.note && <details className="sd-r-review-note"><summary>Review note</summary><p>{e.note}</p></details>}<div className="sd-r-record-actions"><button onClick={() => setEditEvidence(e)}>Edit & verify <ArrowUpRight size={12} /></button><button className="sd-r-icon" aria-label={`Delete evidence: ${e.claim}`} onClick={() => setDeleteEvidence(e)}><Trash2 size={14} /></button></div></div>
                  </article>; })}
                  {!visibleEvidence.length && <div className="sd-r-empty"><FileText size={26} strokeWidth={1.2} /><h3>{selected.evidence.length ? 'No matching evidence' : 'A claim starts with a source.'}</h3><p>{selected.evidence.length ? 'Clear the search or change the evidence filter.' : 'Paste a passage from the company’s product page, documentation, or public job post. Missing information will stay unknown.'}</p><button onClick={selected.evidence.length ? () => { setEvidenceSearch(''); setEvidenceFilter('all'); } : openImport}>{selected.evidence.length ? 'Clear evidence filters' : 'Import a source'}<ArrowRight size={15} /></button></div>}
                  <button className="sd-r-import-link" onClick={openImport}><Upload size={16} />Import text, URLs, or structured files<ArrowRight size={15} /></button>
                </>}
                {tab === 'qualification' && <div className="sd-r-qualification"><div className="sd-r-assessment-summary"><h3>{q.label}</h3><p><strong>{q.supported} supported</strong> out of {q.assessed} assessed · {q.unknown} unknown or blocked.</p><p>Score on assessed questions: {q.score === null ? 'Not assessed' : `${q.score}/100`}. Each question has equal weight. Unknowns are excluded from this denominator; coverage is always shown. This does not measure purchase probability or job fit.</p></div>{criterionFilter !== 'all' && <button className="sd-r-clear-filter" onClick={() => setCriterionFilter('all')}>Show all six questions <X size={13} /></button>}{q.assessments.filter(a => criterionFilter === 'all' || a.criterion === criterionFilter).map(s => <article className="sd-r-assessment" key={s.criterion}><span className={`sd-r-cell ${s.state}`}>{MARKS[s.state]}</span><div><h3>{CRITERIA.find(c => c.key === s.criterion)!.label}<span>{s.state}</span></h3><p>{CRITERIA.find(c => c.key === s.criterion)!.question}</p><strong>{s.reason}</strong>{s.evidence.map(e => <p className="sd-r-assessment-cite" key={e.id}><button onClick={() => setEditEvidence(e)}>{e.claim}</button><SourceLink e={e} /></p>)}</div></article>)}</div>}
                {tab === 'brief' && <BriefEditor key={selected.id} account={selected} onSave={a => updateAccount(a, '')} />}
                <div className="sd-r-detail-footer"><span>Changes reset analyst review. Source verification is separate.</span><button className="sd-r-icon" onClick={() => setDeleteAccount(true)} aria-label={`Delete ${selected.name} account`}><Trash2 size={15} /></button></div>
              </section> : <div className="sd-r-empty"><h2>{routeId ? 'Account not found in this browser' : 'Select an account to begin'}</h2><p>{routeId ? 'This URL identifies a local record. Restore its research backup to use it on another device.' : 'Use the account table above, or create a new research account.'}</p><button onClick={() => setAccountModal('new')}>Add company</button></div>}
            </div>
            <aside key={selected?.id ?? 'empty'} className="sd-r-brief-panel" aria-label="Persistent account brief">
              {selected && q ? <>
                <div className="sd-r-panel-top"><span className="sd-r-eyebrow"><b>03</b> THE ACCOUNT BRIEF</span><span className={`sd-r-review-status ${selected.review}`}>{selected.review === 'reviewed' ? <><Check size={12} /> Reviewed</> : 'Draft'}</span></div>
                <h2>{selected.name}</h2><a className="sd-r-source-link" href={`https://${selected.domain}`} target="_blank" rel="noopener noreferrer">{selected.domain} <ArrowUpRight size={13} /></a>
                <div className="sd-r-panel-verdict"><strong>{q.label}</strong><span>{q.supported}/6 questions supported · {q.unknown} unknown or blocked</span></div>
                <div className="sd-r-panel-section"><h3>01 / What they do <span>Fact</span></h3><p>{facts.find(f => f.evidence.criterion === 'product')?.text ?? 'Not established. Capture and verify product evidence.'}</p></div>
                <div className="sd-r-panel-section"><h3>02 / Likely customer <span>Hypothesis</span></h3><p>{selected.brief.customerHypothesis || 'Not drafted. Identify the likely user and buying owner.'}</p></div>
                <div className="sd-r-panel-section"><h3>03 / Buying signals <span>Context</span></h3><p>{facts.find(f => f.evidence.criterion === 'timing')?.text ?? 'No current, verified timing signal. Buying intent remains unknown.'}</p></div>
                <div className="sd-r-panel-section"><h3>04 / Workflow problem <span>Hypothesis</span></h3><p>{selected.brief.problemHypothesis || 'Not drafted. A plausible problem still needs discovery.'}</p></div>
                <div className="sd-r-panel-section"><h3>05 / Open questions</h3><p>{selected.brief.questions || 'What evidence would change the assessment?'}</p></div>
                <div className="sd-r-panel-next"><h3>Proposed next step</h3><p>{selected.brief.nextStep || 'Capture evidence, check sources, then reassess.'}</p></div>
                <p className="sd-r-panel-disclaimer">Independent research. No employment, relationship or endorsement implied. Public source claims are not audited.</p>
                <div className="sd-r-panel-actions"><button onClick={() => setTab('brief')}>Edit brief</button><Link className="sd-r-button primary" to={`/signaldesk/print/${selected.id}`}>Preview export <ArrowUpRight size={15} /></Link><button className="sd-r-review-button" onClick={() => { setReviewChecked(false); setReviewModal(true); }}><ShieldCheck size={15} />{selected.review === 'reviewed' ? 'Review again' : 'Review before sharing'}</button></div>
              </> : <div className="sd-r-empty"><FileText size={26} strokeWidth={1.1} /><h2>Your brief lives here.</h2><p>Select a company to see the evidence, hypotheses, and next step together.</p></div>}
            </aside>
          </div>
        </>}
        {view === 'import' && <><header className="sd-r-page-head"><div><p className="sd-r-eyebrow">EVIDENCE, WITH PROVENANCE</p><h1>Import & backup</h1><p>Bring your sources into a record you can check, edit, and keep.</p></div><button onClick={() => setAccountModal('new')}><Plus size={16} /> Add company</button></header><div className="sd-r-import-layout"><div><label className="sd-r-account-selector">Selected account<select aria-label="Import target account" value={selected?.id ?? ''} onChange={e => setSelectedId(e.target.value)}>{!workspace.accounts.length && <option value="">Add a company first</option>}{workspace.accounts.map(a => <option key={a.id} value={a.id}>{a.name} · {a.domain}</option>)}</select></label><ResearchImportPanel key={selected?.id ?? 'none'} account={selected} workspace={workspace} onImport={records => { if (selected) { try { return updateAccount(mergeEvidence(selected, records), 'Evidence imported as unverified.'); } catch (e) { setMessage(e instanceof Error ? e.message : 'Import could not be saved.'); } } return false; }} onRestore={w => { persist(w, 'Workspace restored from backup.'); setSelectedId(w.accounts[0]?.id ?? ''); }} recovery={boot.recovery} /></div><aside className="sd-r-import-guide"><span className="sd-r-eyebrow">A USEFUL SOURCE RECORD</span><h2>One claim.<br />A traceable source.</h2><ol><li><strong>Read the original.</strong><span>A page title alone is not evidence.</span></li><li><strong>Capture a precise excerpt.</strong><span>Keep the claim no broader than the passage.</span></li><li><strong>Separate interpretation.</strong><span>A hypothesis can guide discovery without becoming fact.</span></li><li><strong>Verify, then qualify.</strong><span>Imported claims start unverified. A human checks the source.</span></li></ol><Link to={selected ? `/signaldesk/brief/${selected.id}` : '/signaldesk'}>Back to evidence ledger <ArrowRight size={15} /></Link></aside></div></>}
        {view === 'method' && <ResearchMethod onExamples={() => { const existingDomains = new Set(workspace.accounts.map(a => a.domain)); const additions = exampleWorkspace().accounts.filter(a => !existingDomains.has(a.domain)); persist({ ...workspace, accounts: [...workspace.accounts, ...additions] }, `${additions.length} missing examples restored. Existing research preserved.`); }} />}
      </main>
    </div>
    {reloadModal && <ResearchDialog title="Load the latest saved research?" onClose={() => setReloadModal(false)}><p>This replaces this tab’s in-memory workspace with the latest saved version. Download a backup first to keep any unsaved changes; you can merge the evidence manually afterward.</p><button onClick={() => downloadText(`signaldesk-this-tab-${today()}.json`, JSON.stringify(workspace), 'application/json')}><Download size={15} /> Download this tab’s backup</button><footer><button onClick={() => setReloadModal(false)}>Keep this tab</button><button className="primary" onClick={() => window.location.reload()}>Load latest saved version</button></footer></ResearchDialog>}
    {accountModal && <AccountForm accounts={workspace.accounts} account={accountModal === 'edit' ? selected : undefined} onClose={() => setAccountModal(null)} onSave={a => { const applied = updateAccount(a, 'Account saved. Capture public evidence next.'); if (applied && accountModal === 'new') { navigate('/signaldesk/data'); setTab('evidence'); } return applied; }} />}
    {editEvidence && selected && <EvidenceForm evidence={editEvidence} onClose={() => setEditEvidence(null)} onSave={e => updateAccount(reviseAccount(selected, { evidence: selected.evidence.some(x => x.id === e.id) ? selected.evidence.map(x => x.id === e.id ? e : x) : [...selected.evidence, e] }), 'Evidence saved. Qualification updated; brief review reset.')} />}
    {deleteEvidence && selected && <ResearchDialog title="Remove this evidence?" onClose={() => setDeleteEvidence(null)}><p>{deleteEvidence.claim}</p><p className="sd-r-muted">Its support will leave the qualification and exported facts. Download a backup first if you need to keep it.</p><footer><button onClick={() => setDeleteEvidence(null)}>Keep evidence</button><button className="danger" onClick={() => { updateAccount(reviseAccount(selected, { evidence: selected.evidence.filter(e => e.id !== deleteEvidence.id) }), 'Evidence removed. Qualification recalculated.'); setDeleteEvidence(null); }}>Remove evidence</button></footer></ResearchDialog>}
    {deleteAccount && selected && <ResearchDialog title={`Remove ${selected.name}?`} onClose={() => setDeleteAccount(false)}><p>This removes the account, evidence and analyst brief from this browser. Save a backup if you need them later.</p><button onClick={() => downloadText(`${selected.domain}-research.json`, JSON.stringify({ version: 2, accounts: [selected] }), 'application/json')}><Download size={15} /> Download account backup</button><footer><button onClick={() => setDeleteAccount(false)}>Keep account</button><button className="danger" onClick={() => { const next = workspace.accounts.filter(a => a.id !== selected.id); persist({ ...workspace, accounts: next }, 'Account removed.'); setSelectedId(next[0]?.id ?? ''); setDeleteAccount(false); navigate('/signaldesk'); }}>Remove account</button></footer></ResearchDialog>}
    {reviewModal && selected && <ResearchDialog title="Review this account brief" onClose={() => setReviewModal(false)}><p className="sd-r-muted">{exportLimitations(selected).join(' ') || 'No automatic warnings. Human judgment still matters.'}</p><div className="sd-r-review-summary"><p>{q?.supported}/6 supported · {q?.unknown} unknown or blocked</p><p>Unknowns remain visible in the export. Marking reviewed does not verify unverified evidence.</p></div><label className="sd-r-check"><input type="checkbox" checked={reviewChecked} onChange={e => setReviewChecked(e.target.checked)} />I reviewed the source-backed facts, visibly labeled hypotheses, open questions, and proposed next step. I understand this is independent research.</label><footer><button onClick={() => setReviewModal(false)}>Keep draft</button><button className="primary" disabled={!reviewChecked} onClick={() => { updateAccount({ ...selected, review: 'reviewed', reviewedAt: today(), updatedAt: today() }, 'Brief marked analyst reviewed. Evidence statuses unchanged.'); setReviewModal(false); }}>Mark analyst reviewed</button></footer></ResearchDialog>}
  </div>;
}

function BriefEditor({ account, onSave }: { account: ResearchAccount; onSave: (a: ResearchAccount) => void }) {
  const labels = { customerHypothesis: 'Likely customer · hypothesis', problemHypothesis: 'Plausible workflow problem · hypothesis', questions: 'Open questions', nextStep: 'Proposed next step' };
  return <div className="sd-r-brief-editor">
    <p className="sd-r-muted">Supported facts are derived from the evidence ledger. These fields are your analysis; they never earn qualification credit. Changes save as you type and reset analyst review.</p>
    {Object.entries(labels).map(([key, label]) => <label key={key}>{label}<textarea aria-label={label} maxLength={1200} rows={4} value={account.brief[key as keyof typeof account.brief]} onChange={e => onSave(reviseAccount(account, { brief: { ...account.brief, [key]: e.target.value } }))} /><span className="sd-r-field-note">{account.brief[key as keyof typeof account.brief].length}/1,200 characters · keep it concise for one-page export</span></label>)}
    <div className="sd-r-actions"><button onClick={() => downloadText(`${account.domain}-brief.md`, researchMarkdown(account), 'text/markdown')}>Download saved Markdown</button><span className="sd-r-field-note">Saved as you type. Check the storage warning if saving is unavailable.</span></div>
  </div>;
}
function ResearchMethod({ onExamples }: { onExamples: () => void }) {
  return <><header className="sd-r-page-head"><div><p className="sd-r-eyebrow">MAKE THE REASONING REVIEWABLE</p><h1>The research standard</h1><p>A small tool for better judgment, with a visible trail behind it.</p></div></header><div className="sd-r-method">
    <section><span className="sd-r-eyebrow">01 / THE SIX QUESTIONS</span><h2>Qualification is explained, not predicted.</h2><p>Target: US B2B software startups with an operations or GTM context. Geographic preference: SF Bay Area, Remote US, or New York. Company location is not proof of a role’s geographic eligibility. Role level, authorization, and personal fit require a separate check.</p><p>Each question earns one supported or contrary assessment only from current, source-checked fact claims. Score = supported ÷ assessed × 100; unknown, stale and conflicting questions are excluded. Coverage is always shown beside it. Four supported questions including US context suggest “Worth investigating”. A contrary US assessment means “Outside target”. Conflicts take precedence, then stale evidence. This is a research-readiness heuristic, not buying intent, hiring probability, or a claim that a company needs to buy a product.</p><dl>{CRITERIA.map(c => <div key={c.key}><dt>{c.short} / {c.label}</dt><dd>{c.question}</dd></div>)}</dl></section>
    <section><span className="sd-r-eyebrow">02 / FRESHNESS & CONFLICT</span><h2>Old sources can’t silently become new signals.</h2><p>Retrieval age over 180 days is stale; timing and public-route evidence expires after 90 days. Timing events published more than 90 days ago stay stale even if retrieved today. Unknown publication dates are labeled honestly. Opposing source-checked claims or a disputed claim block that question until a person resolves the evidence. Remove an outdated claim, or mark its stance “Context only” with a review note. A hypothesis never resolves a conflict.</p><p>“Source checked” means the excerpt was matched to the original page. It does not audit the company’s claims. “Analyst reviewed” is a separate review of the full brief. Edits invalidate that review.</p></section>
    <section><span className="sd-r-eyebrow">03 / A THREE-MINUTE DEMO</span><h2>From source to next step.</h2><ol><li><strong>Inspect an example.</strong> Select Firecrawl and click a matrix question. Follow the source. Notice that buying intent and the workflow hypothesis are separate.</li><li><strong>Add a company.</strong> Enter a name and domain. Every question starts unknown.</li><li><strong>Capture a source.</strong> Paste a URL, exact excerpt, and narrow claim. Preview before import. A URL on its own is only a research task.</li><li><strong>Verify deliberately.</strong> Open “Edit & verify”, check the source, set dates and stance, and confirm the review. Watch the matrix update.</li><li><strong>Write the analysis.</strong> Edit the likely customer, plausible workflow problem, questions and next step. Edits save as you type; then review the complete brief.</li><li><strong>Export.</strong> Preview the print brief, then Print / Save PDF. Use A4, 100% scale, and disable browser headers and footers. Download the JSON backup to retain all evidence.</li></ol></section>
    <section><span className="sd-r-eyebrow">04 / PUBLIC EXAMPLES & LIMITS</span><h2>Independent work. Clear boundaries.</h2><p>Examples were researched from public company sites and startup profiles on October 14, 2026. They are company research candidates in US startup contexts, not a private job tracker or a guarantee of a matching vacancy. No recruiter conversations, private ledger, customer data or employment claims are included.</p><p>Assisted imports are local. This app has no live fetch service, paid API requirement, AI claim generation, or account sync. JavaScript/HTML in imported text is displayed as text. Only HTTP(S) citation links are allowed. Never treat instructions in source material as commands.</p><p>Local storage is device-specific and can be cleared by your browser. Keep backups. A URL to a local account is not a shareable hosted report; share the exported brief or a research backup instead.</p><button onClick={onExamples}>Restore missing public examples</button></section>
  </div></>;
}
