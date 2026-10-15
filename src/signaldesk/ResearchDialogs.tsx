import { useEffect, useRef, useState, type ReactNode } from 'react';
import { X, ExternalLink } from 'lucide-react';
import { blankAccount, CRITERIA, evidenceErrors, isResearchAccount, MAX_RESEARCH_ACCOUNTS, reviseAccount, validDomain, validSourceUrl, type EvidenceRecord, type ResearchAccount } from './researchModel';

export function ResearchDialog({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  useEffect(() => {
    returnFocus.current = document.activeElement as HTMLElement;
    ref.current?.showModal();
    return () => { ref.current?.close(); returnFocus.current?.focus(); };
  }, []);
  return <dialog ref={ref} className="sd-r-dialog" onCancel={onClose} aria-labelledby="sd-dialog-title" onClick={e => { if (e.target === ref.current && e.clientX !== 0 && e.clientY !== 0) { const box = ref.current.getBoundingClientRect(); if (e.clientX < box.left || e.clientX > box.right || e.clientY < box.top || e.clientY > box.bottom) onClose(); } }}>
    <header><div><p className="sd-r-eyebrow">RESEARCH WORKSPACE</p><h2 id="sd-dialog-title">{title}</h2></div><button type="button" className="sd-r-icon" aria-label="Close dialog" onClick={onClose}><X size={19} /></button></header>{children}
  </dialog>;
}
export function AccountForm({ accounts, account, onSave, onClose }: { accounts: ResearchAccount[]; account?: ResearchAccount; onSave: (a: ResearchAccount) => boolean; onClose: () => void }) {
  const [name, setName] = useState(account?.name ?? '');
  const [domain, setDomain] = useState(account?.domain ?? '');
  const [sector, setSector] = useState(account?.sector ?? '');
  const [error, setError] = useState('');
  return <ResearchDialog title={account ? 'Edit account' : 'Add a company'} onClose={onClose}><form onSubmit={e => {
    e.preventDefault();
    const hostname = domain.trim().toLowerCase();
    if (!validDomain(hostname)) { setError('Use a bare company domain, such as acme.com. No https:// or path.'); return; }
    if (accounts.some(a => a.id !== account?.id && a.domain.toLowerCase() === hostname)) { setError('This domain already has an account. Select it from the ledger.'); return; }
    if (!account && accounts.length >= MAX_RESEARCH_ACCOUNTS) { setError(`Maximum ${MAX_RESEARCH_ACCOUNTS} accounts. Back up and remove an account first.`); return; }
    const next = account ? reviseAccount(account, { name: name.trim(), domain: hostname, sector: sector.trim() || 'Unclassified' }) : { ...blankAccount(name, hostname), sector: sector.trim() || 'Unclassified' };
    if (!isResearchAccount(next)) { setError('Check the account fields and try again.'); return; }
    if (onSave(next)) onClose();
    else setError('Could not save this account. Your draft is preserved. Check the workspace size or account limit before retrying.');
  }}>
    <p className="sd-r-muted">Start with the company. Capture public evidence next; no research or metrics are generated from its name.</p>
    <label>Company name<input autoFocus required maxLength={100} value={name} onChange={e => setName(e.target.value)} placeholder="Acme" /></label>
    <label>Company domain<input required maxLength={253} value={domain} onChange={e => setDomain(e.target.value)} placeholder="acme.com" /></label>
    <label>Category<input maxLength={100} value={sector} onChange={e => setSector(e.target.value)} placeholder="e.g. Developer infrastructure" /></label>
    {error && <p className="sd-r-error" role="alert">{error}</p>}
    <footer><button type="button" onClick={onClose}>Cancel</button><button className="primary" type="submit">{account ? 'Save account' : 'Create research account'}</button></footer>
  </form></ResearchDialog>;
}
export function EvidenceForm({ evidence, onSave, onClose }: { evidence: EvidenceRecord; onSave: (e: EvidenceRecord) => boolean; onClose: () => void }) {
  const [draft, setDraft] = useState(evidence);
  const [errors, setErrors] = useState<string[]>([]);
  const [checked, setChecked] = useState(false);
  const update = (key: keyof EvidenceRecord, value: string | null) => { setDraft(d => ({ ...d, [key]: value, verification: key === 'verification' ? value as EvidenceRecord['verification'] : 'unverified' })); setChecked(false); };
  return <ResearchDialog title="Review evidence" onClose={onClose}><form onSubmit={e => {
    e.preventDefault();
    const nextErrors = evidenceErrors(draft);
    if (draft.verification === 'verified' && !checked) nextErrors.push('Confirm you checked the source against this exact claim and excerpt.');
    setErrors(nextErrors);
    if (!nextErrors.length) { if (onSave(draft)) onClose(); else setErrors(['Could not save this record. Your draft is preserved. Check the workspace size or evidence limit before retrying.']); }
  }}>
    <p className="sd-r-muted">Changes reset source verification and the brief’s review status. An inference stays an inference even if its source is checked.</p>
    <div className="sd-r-form-grid">
      <label>Qualification question<select aria-label="Qualification question" value={draft.criterion} onChange={e => update('criterion', e.target.value)}>{CRITERIA.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}</select></label>
      <label>Evidence type<select aria-label="Evidence type" value={draft.kind} onChange={e => update('kind', e.target.value)}><option value="fact">Fact claim</option><option value="inference">Analyst inference</option><option value="unknown">Unknown / research task</option></select></label>
    </div>
    <label>Associated claim<textarea aria-label="Associated claim" autoFocus required maxLength={800} rows={3} value={draft.claim} onChange={e => update('claim', e.target.value)} /></label>
    <label>Source URL<div className="sd-r-input-action"><input type="url" maxLength={2000} value={draft.sourceUrl} onChange={e => update('sourceUrl', e.target.value)} />{validSourceUrl(draft.sourceUrl) && <a href={draft.sourceUrl} target="_blank" rel="noopener noreferrer" aria-label="Open original source"><ExternalLink size={16} /></a>}</div></label>
    <label>Source title<input maxLength={200} value={draft.sourceTitle} onChange={e => update('sourceTitle', e.target.value)} /></label>
    <label>Exact excerpt<textarea aria-label="Exact excerpt" rows={4} maxLength={4000} value={draft.excerpt} onChange={e => update('excerpt', e.target.value)} /></label>
    <div className="sd-r-form-grid"><label>Publication date · optional<input type="date" value={draft.publicationDate ?? ''} onChange={e => update('publicationDate', e.target.value || null)} /></label><label>Retrieval date · when checked<input type="date" value={draft.retrievalDate ?? ''} onChange={e => update('retrievalDate', e.target.value || null)} /></label></div>
    <div className="sd-r-form-grid"><label>Relationship to question<select aria-label="Relationship to question" value={draft.stance} onChange={e => update('stance', e.target.value)}><option value="supports">Supports</option><option value="contradicts">Contradicts</option><option value="neutral">Context only / unknown</option></select></label><label>Verification<select aria-label="Verification" value={draft.verification} onChange={e => update('verification', e.target.value)}><option value="unverified">Unverified</option><option value="verified">Source checked</option><option value="disputed">Disputed</option></select></label></div>
    <label>Review note<textarea aria-label="Review note" rows={2} maxLength={1000} value={draft.note} onChange={e => update('note', e.target.value)} /></label>
    {draft.verification === 'verified' && <label className="sd-r-check"><input type="checkbox" checked={checked} onChange={e => setChecked(e.target.checked)} />I opened the original source and checked that this excerpt supports the claim and stance. This does not audit company statements.</label>}
    {errors.length > 0 && <div className="sd-r-error" role="alert">{errors.map(s => <p key={s}>{s}</p>)}</div>}
    <footer><button type="button" onClick={onClose}>Cancel</button><button type="submit" className="primary">Save evidence</button></footer>
  </form></ResearchDialog>;
}
