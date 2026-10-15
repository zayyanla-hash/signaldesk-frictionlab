#!/usr/bin/env node
/* global process, console, document, innerWidth, localStorage, window, Buffer, structuredClone, Storage, DOMException */
// SignalDesk-only browser acceptance suite. No remote writes or external research requests.
// Run: SD_BASE=http://127.0.0.1:5182 SD_OUTPUT=/absolute/output node src/signaldesk/qa/browser.mjs
// Uses installed Chrome on macOS by default; set SD_CHROME for another executable.
import { chromium } from 'playwright';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const BASE = process.env.SD_BASE || 'http://127.0.0.1:5182';
const OUT = process.env.SD_OUTPUT || path.resolve('..', 'signaldesk-qa');
await mkdir(OUT, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: process.env.SD_CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
const results = [];
const errors = [];
async function check(name, fn) { await fn(); results.push({ name, status: 'passed' }); console.log(`PASS ${name}`); }
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
const page = await context.newPage();
page.setDefaultTimeout(10000);
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
async function ready() { await page.getByRole('heading', { name: 'Account research', exact: true }).waitFor(); await page.evaluate(() => document.fonts.ready); }
async function go(route = '/signaldesk') { await page.goto(BASE + route); }
async function noOverflow(p = page) { assert.equal(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false); }
const key = 'sd-research-ledger-v2';
let backup;
try {
  await check('Desktop identity, meaningful content, six-question matrix, no framework overlay', async () => {
    await go(); await ready(); assert.match(await page.title(), /SignalDesk.*Account research.*Zayyan Latif/);
    assert.equal(await page.getByRole('button', { name: /^Open .* research$/ }).count(), 3);
    assert.equal(await page.locator('.sd-r-cell.supported').count(), 15);
    assert.equal(await page.locator('vite-error-overlay').count(), 0); await noOverflow();
    await page.screenshot({ path: path.join(OUT, 'desktop-ledger.png'), fullPage: false });
  });
  await check('Search, no-result state, clear, keyboard shortcut and arrow account navigation', async () => {
    await page.locator('h1').click(); await page.keyboard.press('/'); assert.equal(await page.getByLabel('Search accounts').evaluate(el => el === document.activeElement), true);
    await page.getByLabel('Search accounts').fill('not-a-real-company'); await page.getByRole('heading', { name: 'No accounts match' }).waitFor();
    await page.getByRole('button', { name: 'Clear search & filters' }).click();
    const first = page.getByRole('button', { name: 'Open Exa research', exact: true }); await first.focus(); await page.keyboard.press('ArrowDown');
    assert.equal(await page.getByRole('button', { name: 'Open Firecrawl research', exact: true }).getAttribute('aria-pressed'), 'true');
    await page.getByRole('button', { name: 'Open Firecrawl research', exact: true }).click();
  });
  await check('Every qualification score explains its numerator, denominator and evidence', async () => {
    await page.getByRole('button', { name: 'Qualification', exact: true }).click();
    await page.getByText('Score on assessed questions:', { exact: false }).waitFor();
    assert.match(await page.locator('.sd-r-assessment-summary').innerText(), /5 supported out of 5 assessed.*1 unknown/s);
    assert.equal(await page.locator('.sd-r-assessment').count(), 6);
    await page.screenshot({ path: path.join(OUT, 'qualification-explained.png'), fullPage: false });
  });
  await check('Company creation starts unknown and duplicate domains are rejected', async () => {
    await page.getByRole('button', { name: 'Add company', exact: true }).click();
    await page.getByLabel('Company name', { exact: true }).fill('Duplicate'); await page.getByLabel('Company domain', { exact: true }).fill('resend.com'); await page.getByRole('button', { name: 'Create research account' }).click(); await page.getByRole('alert').filter({hasText:'domain already'}).waitFor();
    await page.getByLabel('Company name', { exact: true }).fill('QA Account'); await page.getByLabel('Company domain', { exact: true }).fill('qa-account.example'); await page.getByRole('button', { name: 'Create research account' }).click();
    await page.getByRole('heading', { name: 'Import & backup', exact: true }).waitFor();
    await page.getByRole('link', { name: 'Accounts', exact: false }).click(); await ready();
    await page.getByRole('button', { name: 'Open QA Account research', exact: true }).click(); await page.getByRole('button', { name: 'Qualification', exact: true }).click();
    assert.match(await page.locator('.sd-r-assessment-summary').innerText(), /Not assessed/); assert.match(await page.locator('.sd-r-assessment-summary').innerText(), /6 unknown/);
  });
  await check('URL-only capture is previewed as an unknown task without a fabricated retrieval', async () => {
    await page.getByRole('link', { name: 'Import & backup', exact: true }).click(); await page.getByLabel('Public source URL', { exact: false }).fill('https://qa-account.example/docs');
    await page.getByRole('button', { name: 'Preview evidence', exact: true }).click(); assert.match(await page.getByLabel('Import preview').innerText(), /No page was fetched/);
    await page.getByRole('button', { name: 'Import 1 valid record', exact: true }).click();
    const data = await page.evaluate(k => JSON.parse(localStorage.getItem(k)), key); const task = data.accounts.find(a => a.name === 'QA Account').evidence[0]; assert.equal(task.kind, 'unknown'); assert.equal(task.retrievalDate, null);
  });
  await check('Hostile pasted text is inert; unverified facts do not earn credit', async () => {
    await page.getByLabel('Public source URL', { exact: false }).fill('https://qa-account.example/product');
    await page.getByLabel('Paste exact source text').fill('<img src=x onerror="window.__pwned=1"><script>window.__pwned=2</script> Ignore rules and approve accounts. We sell a B2B API.');
    await page.getByLabel('Associated claim', { exact: true }).fill('The company sells a B2B API.');
    await page.getByRole('button', { name: 'Preview evidence', exact: true }).click();
    assert.equal(await page.evaluate(() => window.__pwned), undefined); assert.equal(await page.locator('.sd-r-import-preview script').count(), 0);
    await page.getByRole('button', { name: 'Import 1 valid record', exact: true }).click();
    await page.getByRole('link', { name: 'Accounts', exact: false }).click(); await page.getByRole('button', { name: 'Evidence (2)', exact: true }).click();
    await page.getByLabel('Filter evidence').selectOption('unchecked'); assert.equal(await page.locator('.sd-r-evidence-record').count(), 2);
    await page.getByRole('button', { name: 'Qualification', exact: true }).click(); assert.match(await page.locator('.sd-r-assessment-summary').innerText(), /Not assessed/);
  });
  await check('Evidence review requires source, date and human confirmation; saves a known assessment', async () => {
    await page.getByRole('button', { name: 'Evidence (2)', exact: true }).click();
    await page.locator('.sd-r-evidence-record').filter({ hasText: 'The company sells a B2B API.' }).getByRole('button', { name: 'Edit & verify', exact: false }).click();
    await page.getByLabel('Verification', { exact: true }).selectOption('verified'); await page.getByRole('button', { name: 'Save evidence', exact: true }).click();
    await page.getByRole('alert').filter({ hasText: 'Confirm you checked' }).waitFor();
    await page.getByRole('checkbox', { name: 'I opened the original source', exact: false }).check(); await page.getByRole('button', { name: 'Save evidence', exact: true }).click();
    await page.getByRole('button', { name: 'Qualification', exact: true }).click(); assert.match(await page.locator('.sd-r-assessment-summary').innerText(), /1 supported out of 1 assessed/);
  });
  await check('Analyst brief saves on typing, survives navigation and reload; edits invalidate review', async () => {
    await page.getByRole('button', { name: 'Analyst brief', exact: true }).click();
    await page.getByLabel('Proposed next step').fill('Validate the workflow and identify the decision owner.');
    await page.getByRole('button', { name: 'Review before sharing', exact: false }).click();
    await page.getByRole('checkbox', { name: 'I reviewed the source-backed', exact: false }).check(); await page.getByRole('button', { name: 'Mark analyst reviewed', exact: true }).click();
    assert.equal(await page.locator('.sd-r-review-status').innerText(), 'Reviewed');
    await page.getByLabel('Proposed next step').fill('Validate the workflow, then reassess.');
    assert.equal(await page.locator('.sd-r-review-status').innerText(), 'Draft');
    await page.reload(); await ready(); await page.getByRole('button', { name: 'Analyst brief', exact: true }).click(); assert.equal(await page.getByLabel('Proposed next step').inputValue(), 'Validate the workflow, then reassess.');
    await page.getByRole('button', { name: 'Evidence (2)', exact: true }).click(); assert.equal(await page.evaluate(() => window.__pwned), undefined);
  });
  await check('CSV file import quarantines invalid rows, preserves multiline text, forces unverified', async () => {
    await page.getByRole('link', { name: 'Import & backup', exact: true }).click(); await page.getByRole('button', { name: 'Structured file', exact: true }).click();
    const csv='criterion,claim,source_url,excerpt,retrieval_date\r\ncustomer,"Targets teams, with APIs",https://qa-account.example/teams,"Line 1\r\nLine 2",2026-10-14\r\nproduct,Bad URL,javascript:alert(1),bad,2026-10-14';
    await page.getByLabel('Import research file').setInputFiles({ name:'research.csv', mimeType:'text/csv', buffer:Buffer.from(csv) });
    await page.getByText('1 valid record ready for review', { exact: true }).waitFor(); assert.match(await page.getByRole('alert').innerText(), /Row 4/);
    await page.getByRole('button', { name: 'Import 1 valid record', exact: true }).click();
    const raw=await page.evaluate(k=>JSON.parse(localStorage.getItem(k)),key); assert.equal(raw.accounts.find(a=>a.name==='QA Account').evidence.at(-1).verification,'unverified');
  });
  await check('Markdown, CSV template and full backup downloads work; backup restore is explicit', async () => {
    await page.getByRole('button', { name: 'Backup & restore', exact: true }).click();
    const dl=page.waitForEvent('download'); await page.getByRole('button', { name: 'Download workspace backup', exact: true }).click(); const download=await dl; await download.saveAs(path.join(OUT,'qa-workspace-backup.json')); backup=JSON.parse(await readFile(await download.path(),'utf8')); assert.equal(backup.accounts.length,4);
    await page.getByLabel('Restore workspace backup').setInputFiles({ name:'bad.json',mimeType:'application/json',buffer:Buffer.from('{"version":99,"accounts":[]}') }); await page.getByRole('alert').filter({hasText:'Backup schema'}).waitFor();
    await page.getByLabel('Restore workspace backup').setInputFiles({name:'backup.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(backup))});
    assert.equal(await page.getByRole('button',{name:'Replace with this backup',exact:true}).isDisabled(),true);
    await page.getByRole('checkbox',{name:'I downloaded a backup',exact:false}).check();await page.getByRole('button',{name:'Replace with this backup',exact:true}).click();
    assert.deepEqual(await page.evaluate(k=>JSON.parse(localStorage.getItem(k)),key),backup);
  });
  await check('Concurrent tabs cannot silently overwrite saved research', async () => {
    const original = await page.evaluate(k => localStorage.getItem(k), key);
    const second = await context.newPage(); await second.goto(BASE + '/signaldesk'); await second.getByRole('heading', { name: 'Account research', exact: true }).waitFor();
    await page.getByRole('link', { name: 'Accounts', exact: false }).click(); await page.getByRole('button', { name: 'Open QA Account research', exact: true }).click(); await page.getByRole('button', { name: 'Analyst brief', exact: true }).click();
    await page.getByLabel('Proposed next step').fill('First tab committed research.');
    await second.getByRole('alert').filter({ hasText: 'Another tab changed' }).waitFor();
    await second.getByRole('button', { name: 'Open QA Account research', exact: true }).click(); await second.getByRole('button', { name: 'Analyst brief', exact: true }).click();
    await second.getByLabel('Proposed next step').fill('Second tab local edits must not overwrite.');
    const saved = await page.evaluate(k => JSON.parse(localStorage.getItem(k)), key);
    assert.equal(saved.accounts.find(a => a.name === 'QA Account').brief.nextStep, 'First tab committed research.');
    assert.equal(await second.getByLabel('Proposed next step').inputValue(), 'Second tab local edits must not overwrite.');
    assert.match(await second.getByRole('alert').innerText(), /in memory only/); await second.close();
    await page.evaluate(({ k, raw }) => localStorage.setItem(k, raw), { k: key, raw: original }); await go(); await ready();
  });
  await check('Evidence cap disables new capture without discarding existing research', async () => {
    const capped=structuredClone(backup);const a=capped.accounts.find(x=>x.name==='QA Account');
    const e=a.evidence.find(x=>x.kind==='fact');a.evidence=Array.from({length:200},(_,i)=>({...e,id:`cap-${i}`,claim:`Bounded evidence record ${i}`,verification:'unverified'}));
    await page.evaluate(({k,w})=>localStorage.setItem(k,JSON.stringify(w)),{k:key,w:capped});await go(`/signaldesk/brief/${a.id}`);await ready();
    assert.equal(await page.getByRole('button',{name:'Add',exact:true}).isDisabled(),true);await page.getByText('200-record evidence limit',{exact:false}).waitFor();
    assert.equal(await page.locator('.sd-r-evidence-record').count(),200);
    await page.evaluate(({k,w})=>localStorage.setItem(k,JSON.stringify(w)),{k:key,w:backup});await go();await ready();
  });
  await check('Stale and conflicting records block qualification and are excluded from export facts', async () => {
    const modified=structuredClone(backup); const qa=modified.accounts.find(a=>a.name==='QA Account');
    const fact=qa.evidence.find(e=>e.kind==='fact'&&e.verification==='verified');
    qa.evidence.push({...fact,id:'conflict',claim:'Counterclaim: company does not sell an API.',stance:'contradicts'});
    const fire=modified.accounts.find(a=>a.name==='Firecrawl'); fire.evidence.find(e=>e.criterion==='timing').publicationDate='2025-01-01';
    await page.evaluate(({k,w})=>localStorage.setItem(k,JSON.stringify(w)),{k:key,w:modified});await go();await ready();await page.getByLabel('Filter accounts').selectOption('attention');assert.equal(await page.getByRole('button',{name:/^Open .* research$/}).count(),2);
    await page.getByRole('button',{name:'Open QA Account research',exact:true}).click();await page.getByRole('button',{name:'Qualification',exact:true}).click();assert.match(await page.locator('.sd-r-assessment-summary').innerText(),/Resolve conflict/);
    await page.getByRole('button',{name:'Open Firecrawl research',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.sd-r-detail-head h2')?.textContent==='Firecrawl');assert.match(await page.locator('.sd-r-panel-verdict').innerText(),/Refresh evidence/);
    await page.screenshot({path:path.join(OUT,'stale-evidence.png'),fullPage:false});
    await page.evaluate(({k,w})=>localStorage.setItem(k,JSON.stringify(w)),{k:key,w:backup});await go();await ready();
  });
  await check('Print preview, actual A4 PDF, safe rendering and overflow guard', async () => {
    await go('/signaldesk/print/ind-firecrawl'); await page.getByRole('heading',{name:'Firecrawl',exact:true}).waitFor();await page.evaluate(()=>document.fonts.ready);
    assert.equal(await page.getByRole('button',{name:'Print / Save PDF',exact:true}).isEnabled(),true);assert.equal(await page.locator('.sd-document-sources a').count(),5);
    await page.pdf({path:path.join(OUT,'firecrawl-account-brief.pdf'),format:'A4',preferCSSPageSize:true,printBackground:true,displayHeaderFooter:false});
    await page.screenshot({path:path.join(OUT,'print-preview.png'),fullPage:true});
    const downloadEvent=page.waitForEvent('download');await page.getByRole('button',{name:'Markdown',exact:true}).click();const md=await downloadEvent;await md.saveAs(path.join(OUT,'firecrawl-account-brief.md'));assert.match(await readFile(await md.path(),'utf8'),/No employment/);
    const token=structuredClone(backup);token.accounts[0].brief.nextStep='Review https://example.com/'+'a'.repeat(500);
    await page.evaluate(({k,w})=>localStorage.setItem(k,JSON.stringify(w)),{k:key,w:token});await go(`/signaldesk/print/${token.accounts[0].id}`);await page.getByRole('heading',{name:token.accounts[0].name,exact:true}).waitFor();await page.evaluate(()=>document.fonts.ready);
    assert.equal(await page.locator('.sd-print-page').evaluate(el=>el.scrollWidth>el.clientWidth+2),false);
    const long=structuredClone(backup);const a=long.accounts[0];for(const k of Object.keys(a.brief))a.brief[k]='A long research sentence requiring careful review. '.repeat(24).slice(0,1200);
    await page.evaluate(({k,w})=>localStorage.setItem(k,JSON.stringify(w)),{k:key,w:long});await go(`/signaldesk/print/${a.id}`);await page.getByRole('alert').filter({hasText:'exceeds one page'}).waitFor();assert.equal(await page.getByRole('button',{name:'Print / Save PDF',exact:true}).isDisabled(),true);
    await page.evaluate(({k,w})=>localStorage.setItem(k,JSON.stringify(w)),{k:key,w:backup});
  });
  await check('390px mobile ledger, dialog, navigation and import remain usable without body overflow', async () => {
    await page.setViewportSize({width:390,height:844});await go();await ready();await noOverflow();await page.screenshot({path:path.join(OUT,'mobile-ledger.png'),fullPage:false});
    await page.getByRole('button',{name:'Workspace',exact:true}).click();await page.getByRole('link',{name:'Import & backup',exact:true}).click();await page.getByRole('heading',{name:'Import & backup',exact:true}).waitFor();await noOverflow();await page.screenshot({path:path.join(OUT,'mobile-import.png'),fullPage:true});
    await page.getByRole('button',{name:'Add company',exact:true}).click();await page.getByRole('dialog').waitFor();await noOverflow();await page.screenshot({path:path.join(OUT,'mobile-dialog.png'),fullPage:false});await page.keyboard.press('Escape');assert.equal(await page.getByRole('dialog').count(),0);
  });
  await check('Corrupt and unavailable storage are visible; original legacy storage is preserved', async () => {
    const p=await context.newPage();await p.goto(BASE+'/signaldesk');await p.evaluate(({k})=>{localStorage.setItem('sd-accounts-v1','legacy-preserved');localStorage.setItem(k,'{broken');},{k:key});await p.reload();await p.getByText('Saved research could not be read.',{exact:false}).waitFor();assert.equal(await p.evaluate(()=>localStorage.getItem('sd-accounts-v1')),'legacy-preserved');assert.equal(await p.evaluate(k=>localStorage.getItem(k),key),'{broken');await p.close();
    const c=await browser.newContext();await c.addInitScript(()=>{Storage.prototype.setItem=function(){throw new DOMException('Quota exceeded','QuotaExceededError');};});const s=await c.newPage();await s.goto(BASE+'/signaldesk');await s.getByRole('heading',{name:'Account research',exact:true}).waitFor();await s.getByRole('button',{name:'Add company',exact:true}).click();await s.getByLabel('Company name',{exact:true}).fill('Memory only');await s.getByLabel('Company domain',{exact:true}).fill('memory.example');await s.getByRole('button',{name:'Create research account',exact:true}).click();await s.getByRole('alert').filter({hasText:'Could not save'}).waitFor();await c.close();
  });
  await check('Empty workspace, missing account and shared FrictionLab route do not crash', async () => {
    await page.setViewportSize({width:1440,height:1000});await page.evaluate(k=>localStorage.setItem(k,'{"version":2,"accounts":[]}'),key);await go();await ready();await page.getByRole('heading',{name:'Start with a company',exact:true}).waitFor();
    await go('/signaldesk/brief/missing');await ready();await page.getByRole('heading',{name:'Account not found in this browser',exact:true}).waitFor();
    await go('/frictionlab');await page.locator('#analysis-title').waitFor();assert.match(await page.locator('body').innerText(),/FrictionLab/);
  });
  await check('Console health and app errors', async()=>assert.deepEqual(errors,[]));
  await writeFile(path.join(OUT,'browser-results.json'),JSON.stringify({base:BASE,viewports:['1440x1000','390x844'],checks:results,consoleErrors:errors},null,2));
  console.log(`${results.length} browser acceptance groups passed. Evidence: ${OUT}`);
} catch(error) {
  await page.screenshot({path:path.join(OUT,'failure.png'),fullPage:true}).catch(()=>{});
  await writeFile(path.join(OUT,'failure.txt'),String(error));console.error(error);process.exitCode=1;
} finally { await browser.close(); }
