import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Download, Printer } from 'lucide-react';
import { briefFacts, briefUnknowns, exportLimitations, researchMarkdown } from './researchExport';
import { CRITERIA, qualify, today, type ResearchAccount } from './researchModel';
import { downloadText } from '../lib/utils';

export function PrintBrief({ account }: { account: ResearchAccount }) {
  const page = useRef<HTMLElement>(null);
  const [overflow, setOverflow] = useState(false);
  const facts = briefFacts(account);
  const q = qualify(account);
  useEffect(() => {
    document.title = `${account.name} — independent research · SignalDesk`;
    const measure = () => setOverflow(!!page.current && (page.current.scrollHeight > page.current.clientHeight + 2 || page.current.scrollWidth > page.current.clientWidth + 2));
    void document.fonts.ready.then(measure);
    const observer = new ResizeObserver(measure);
    if (page.current) observer.observe(page.current);
    return () => observer.disconnect();
  }, [account]);
  return <div className="sd-print-root">
    <div className="sd-print-toolbar">
      <Link to={`/signaldesk/brief/${account.id}`}><ArrowLeft size={16} /> Back to research</Link>
      <span>Print-ready · A4 · citations included</span>
      <button onClick={() => downloadText(`${account.domain}-brief.md`, researchMarkdown(account), 'text/markdown')}><Download size={16} /> Markdown</button>
      <button className="primary" disabled={overflow} onClick={() => window.print()}><Printer size={16} /> Print / Save PDF</button>
    </div>
    {exportLimitations(account).map(w => <p className="sd-print-warning" key={w}>{w}</p>)}
    {overflow && <p className="sd-print-warning" role="alert">This brief exceeds one page. Shorten the brief text or claims before printing; nothing is silently omitted. Use Markdown for the full text.</p>}
    <article id="main" className={`sd-print-page ${overflow ? 'sd-print-overflow' : ''}`} ref={page} aria-label="Printable account brief">
      <header className="sd-document-head"><span>SIGNALDESK / ACCOUNT RESEARCH</span><span>{today()}</span></header>
      <h1>{account.name}</h1>
      <p className="sd-document-deck">{account.domain} <span> / </span> {account.sector}</p>
      <p className="sd-document-byline">Independent research by Zayyan Latif. Public sources only. No employment, client relationship or endorsement is claimed.</p>
      <div className="sd-document-verdict"><strong>{q.label}</strong><span>{q.supported} supported · {q.assessed}/6 assessed · {q.unknown} unknown or blocked</span></div>
      <section><h2>01 / What the evidence supports</h2>
        {facts.length ? facts.map(f => <p className="sd-document-fact" key={f.evidence.id}><strong>{CRITERIA.find(c => c.key === f.evidence.criterion)!.label}.</strong> {f.text} <a href={`#cite-${f.citation}`}>[{f.citation}]</a></p>) : <p>No verified, current supporting facts. Capture evidence before prioritizing this account.</p>}
      </section>
      <div className="sd-document-columns">
        <section><h2>02 / Likely customer <em>Hypothesis</em></h2><p>{account.brief.customerHypothesis || 'Not yet established. Identify a customer segment and decision owner.'}</p></section>
        <section><h2>03 / Workflow problem <em>Hypothesis</em></h2><p>{account.brief.problemHypothesis || 'No problem established. Validate the workflow before proposing a solution.'}</p></section>
      </div>
      <section><h2>04 / Open questions</h2><p>{account.brief.questions || 'What evidence would change this assessment?'}</p>
        {briefUnknowns(account).length > 0 && <p className="sd-document-gap"><strong>Research gaps:</strong> {q.assessments.filter(a => a.state !== 'supported').map(a => `${CRITERIA.find(c => c.key === a.criterion)!.label} (${a.state})`).join('; ')}. No purchasing intent or budget has been established.</p>}
      </section>
      <section className="sd-document-next"><h2>05 / Proposed next step</h2><p>{account.brief.nextStep || 'Capture and verify the missing evidence, then reassess.'}</p></section>
      <section className="sd-document-sources"><h2>Source notes</h2>{facts.map(f => <p key={f.citation} id={`cite-${f.citation}`}><strong>[{f.citation}] {f.evidence.sourceTitle || 'Source'}.</strong> <a href={f.evidence.sourceUrl}>{f.evidence.sourceUrl}</a><br /><span>Published {f.evidence.publicationDate ?? 'unknown'} · retrieved {f.evidence.retrievalDate}. Verified means source-matched.</span></p>)}</section>
      <footer className="sd-document-footer"><span>{account.review === 'reviewed' ? `Analyst reviewed ${account.reviewedAt}` : 'DRAFT / analyst review pending'} · Qualification is a research heuristic, not purchase probability.</span><span>01</span></footer>
    </article>
    <p className="sd-print-instructions">Choose “Save as PDF”, paper A4, scale 100%, and turn off browser headers and footers. The preview warns if your content exceeds one page.</p>
  </div>;
}
