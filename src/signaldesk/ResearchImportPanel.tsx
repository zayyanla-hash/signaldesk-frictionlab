import { useState, type ChangeEvent } from 'react';
import { Download, ExternalLink, FileUp, ClipboardPaste } from 'lucide-react';
import { captureSource, IMPORT_COLUMNS, parseEvidenceImport, templateCSV, type ImportPreview } from './researchImport';
import { CRITERIA, isWorkspace, MAX_IMPORT_BYTES, MAX_WORKSPACE_BYTES, today, validSourceUrl, type Criterion, type EvidenceRecord, type ResearchAccount, type ResearchWorkspace } from './researchModel';
import { downloadText } from '../lib/utils';

export function ResearchImportPanel({ account, workspace, onImport, onRestore, recovery }: { account?: ResearchAccount; workspace: ResearchWorkspace; onImport: (records: EvidenceRecord[]) => boolean; onRestore: (w: ResearchWorkspace) => void; recovery: string | null }) {
  const [mode, setMode] = useState<'capture' | 'file' | 'backup'>('capture');
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [excerpt, setExcerpt] = useState('');
  const [claim, setClaim] = useState('');
  const [criterion, setCriterion] = useState<Criterion>('product');
  const [publicationDate, setPublicationDate] = useState('');
  const [retrievalDate, setRetrievalDate] = useState(today());
  const [structured, setStructured] = useState('');
  const [format, setFormat] = useState<'json' | 'csv'>('json');
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [restore, setRestore] = useState<ResearchWorkspace | null>(null);
  const [restoreConfirmed, setRestoreConfirmed] = useState(false);
  function clearPreview() { setPreview(null); setNotice(''); }
  async function readFile(e: ChangeEvent<HTMLInputElement>, restoreMode = false) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true); clearPreview(); setRestore(null); setRestoreConfirmed(false);
    try {
      if (file.size > (restoreMode ? MAX_WORKSPACE_BYTES : MAX_IMPORT_BYTES)) throw new Error(restoreMode ? 'Backup exceeds the 8 MB workspace limit.' : 'File exceeds 1 MB. Split it before importing.');
      const content = await file.text();
      if (restoreMode) {
        const parsed: unknown = JSON.parse(content);
        if (!isWorkspace(parsed)) throw new Error('Backup schema, version, dates, or account IDs are invalid. Current research is unchanged.');
        setRestore(parsed);
      } else if (/\.(txt|md)$/i.test(file.name)) {
        setExcerpt(content); setMode('capture'); setNotice('Text loaded into the capture form. Add the URL and associated claim, then preview. Nothing has been saved.');
      } else if (/\.(json|csv)$/i.test(file.name)) {
        const nextFormat = /\.csv$/i.test(file.name) ? 'csv' : 'json';
        setFormat(nextFormat); setStructured(content); setPreview(parseEvidenceImport(content, nextFormat, account?.evidence));
      } else throw new Error('Use .json, .csv, .txt, or .md. HTML files are not rendered or executed.');
    } catch (error) { setPreview({ records: [], errors: [error instanceof Error ? error.message : 'File could not be read.'], warnings: [] }); }
    finally { setBusy(false); e.target.value = ''; }
  }
  return <section className="sd-r-import" aria-labelledby="sd-import-title">
    <div className="sd-r-section-head"><div><p className="sd-r-eyebrow">CAPTURE → CHECK → USE</p><h2 id="sd-import-title">Bring the source with you.</h2></div><ClipboardPaste size={22} strokeWidth={1.3} /></div>
    <p className="sd-r-muted">Assisted import. Open a public source, paste an exact excerpt, and write the claim it supports. SignalDesk does not fetch websites or generate research.</p>
    <div className="sd-r-tabs" aria-label="Import method">{(['capture', 'file', 'backup'] as const).map(m => <button key={m} type="button" aria-pressed={mode === m} onClick={() => { setMode(m); clearPreview(); setRestore(null); }}>{m === 'capture' ? 'Paste text or URL' : m === 'file' ? 'Structured file' : 'Backup & restore'}</button>)}</div>
    {mode !== 'backup' && <p className="sd-r-import-target">Importing to <strong>{account?.name ?? 'No account selected'}</strong>{!account && ' · add a company first'}</p>}
    {mode === 'capture' && <form onSubmit={e => { e.preventDefault(); setNotice(''); setPreview(captureSource({ url, title, excerpt, claim, criterion, publicationDate, retrievalDate }, account?.evidence)); }} onChange={clearPreview}>
      <label>Public source URL<div className="sd-r-input-action"><input type="url" maxLength={2000} value={url} onChange={e => setUrl(e.target.value)} placeholder="https://company.com/product" />{validSourceUrl(url) && <a href={url} target="_blank" rel="noopener noreferrer" aria-label="Open source to read"><ExternalLink size={17} /></a>}</div></label>
      <p className="sd-r-field-note">A URL alone becomes an unknown research task. No content is fetched.</p>
      <div className="sd-r-form-grid"><label>Source title<input maxLength={200} value={title} onChange={e => setTitle(e.target.value)} placeholder="Product documentation" /></label><label>Question this informs<select aria-label="Question this informs" value={criterion} onChange={e => setCriterion(e.target.value as Criterion)}>{CRITERIA.map(c => <option value={c.key} key={c.key}>{c.label}</option>)}</select></label></div>
      <label>Paste exact source text<textarea rows={6} maxLength={4000} value={excerpt} onChange={e => setExcerpt(e.target.value)} placeholder="Select a short, relevant passage from the source. Text stays data, even if it contains code or instructions." /></label>
      <label>Associated claim<textarea rows={2} maxLength={800} value={claim} onChange={e => setClaim(e.target.value)} placeholder="What specific statement does this excerpt support?" /></label>
      <div className="sd-r-form-grid"><label>Publication date · optional<input type="date" value={publicationDate} onChange={e => setPublicationDate(e.target.value)} /></label><label>Retrieved on · when you read it<input type="date" value={retrievalDate} onChange={e => setRetrievalDate(e.target.value)} /></label></div>
      <button className="primary" type="submit" disabled={!account || busy}>Preview evidence</button>
    </form>}
    {mode === 'file' && <div>
      <p className="sd-r-muted">JSON arrays and CSV evidence records, up to 1 MB and 200 records per account. Text and Markdown files open in the capture form. Imported verification assertions are ignored.</p>
      <div className="sd-r-actions"><label className="sd-r-file-button"><FileUp size={16} /> Choose file<input aria-label="Import research file" type="file" accept=".json,.csv,.txt,.md" disabled={!account || busy} onChange={e => { void readFile(e); }} /></label><button onClick={() => downloadText('signaldesk-evidence-template.csv', templateCSV(), 'text/csv')}><Download size={16} /> CSV template</button></div>
      <details><summary>File schema & example</summary><p className="sd-r-field-note">CSV headers (claim and criterion are required):</p><code>{IMPORT_COLUMNS}</code><p className="sd-r-field-note">Criteria: {CRITERIA.map(c => c.key).join(', ')}. Dates use YYYY-MM-DD or blank/null. Source matching is a separate human review.</p><pre>{JSON.stringify([{ criterion: 'product', claim: 'The company sells a B2B API.', sourceUrl: 'https://company.example/product', sourceTitle: 'Product', excerpt: 'An API for business teams.', publicationDate: null, retrievalDate: today(), kind: 'fact', stance: 'supports' }], null, 2)}</pre></details>
      <label>Format<select aria-label="Format" value={format} onChange={e => { setFormat(e.target.value as 'json' | 'csv'); clearPreview(); }}><option value="json">JSON</option><option value="csv">CSV</option></select></label>
      <label>Or paste structured records<textarea rows={8} maxLength={MAX_IMPORT_BYTES} value={structured} onChange={e => { setStructured(e.target.value); clearPreview(); }} spellCheck={false} /></label>
      <button className="primary" disabled={!account || busy} onClick={() => setPreview(parseEvidenceImport(structured, format, account?.evidence))}>Validate & preview</button>
    </div>}
    {mode === 'backup' && <div>
      <h3>Your research, portable.</h3><p className="sd-r-muted">Download every account, evidence record, date and analyst note. Workspace backups support up to 8 MB. A backup preserves reviewed statuses; ordinary evidence imports always start unverified. Keep private research out of public work samples.</p>
      <button onClick={() => downloadText(`signaldesk-research-${today()}.json`, JSON.stringify(workspace), 'application/json')}><Download size={16} /> Download workspace backup</button>
      {recovery && <p><button onClick={() => downloadText('signaldesk-saved-recovery.txt', recovery, 'text/plain')}>Download original saved recovery copy</button></p>}
      <hr /><label className="sd-r-file-button"><FileUp size={16} /> Select backup to restore<input type="file" aria-label="Restore workspace backup" accept=".json" disabled={busy} onChange={e => { void readFile(e, true); }} /></label>
      {restore && <div className="sd-r-import-preview"><h3>Restore preview</h3><p>{restore.accounts.length} accounts · {restore.accounts.reduce((n, a) => n + a.evidence.length, 0)} evidence records. This replaces the current workspace.</p><label className="sd-r-check"><input type="checkbox" checked={restoreConfirmed} onChange={e => setRestoreConfirmed(e.target.checked)} />I downloaded a backup of the current workspace and want to replace it.</label><button className="primary" disabled={!restoreConfirmed} onClick={() => { onRestore(restore); setRestore(null); setNotice('Workspace restored. Preserved source statuses are declarations from the backup; review before sharing.'); }}>Replace with this backup</button></div>}
    </div>}
    <div aria-live="polite">{busy && <p>Reading file and validating records…</p>}{notice && <p className="sd-r-success" role="status">{notice}</p>}</div>
    {preview && <div className="sd-r-import-preview" aria-label="Import preview">
      <h3>{preview.records.length} valid record{preview.records.length === 1 ? '' : 's'} ready for review</h3>
      {preview.warnings.map(w => <p className="sd-r-field-note" key={w}>{w}</p>)}
      {preview.errors.length > 0 && <div className="sd-r-error" role="alert"><strong>{preview.errors.length} issue{preview.errors.length === 1 ? '' : 's'} · invalid records excluded</strong><ul>{preview.errors.map((s, i) => <li key={i}>{s}</li>)}</ul></div>}
      {preview.records.map((r, i) => <div className="sd-r-preview-record" key={r.id}><span className="sd-r-eyebrow">{i + 1} / {r.kind} · unverified</span><p>{r.claim}</p><blockquote>{r.excerpt || 'No excerpt. Research task only.'}</blockquote><small>{r.sourceUrl || 'No source URL'} · retrieved {r.retrievalDate ?? 'unknown'}</small></div>)}
      {preview.records.length > 0 && <button className="primary" disabled={!account} onClick={() => { if (!onImport(preview.records)) { setNotice('Could not add these records. The preview is preserved; check the workspace limit or warning above.'); return; } setNotice(`${preview.records.length} record(s) imported as unverified. Review each source in Evidence.`); setPreview(null); setStructured(''); setExcerpt(''); setClaim(''); setUrl(''); setTitle(''); }}>Import {preview.records.length} valid record{preview.records.length === 1 ? '' : 's'}</button>}
    </div>}
  </section>;
}
