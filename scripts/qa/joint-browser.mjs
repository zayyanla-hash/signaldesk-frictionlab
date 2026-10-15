/* global taskSpace, document, window */
import console from 'node:console';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
const config = globalThis.JOINT_QA_CONFIG;
if (!config) throw new Error('Use node scripts/qa/run-joint-browser.mjs');
const { base, out } = config;
await mkdir(out, { recursive: true });
const task = await taskSpace(config.space || 'Joint portfolio acceptance');
const page = task.page('p1');
// Capture can be disabled when the browser capture service is unavailable.
// This never skips behavioral assertions; use independent visual evidence.
const capture = async (options) => {
  if (config.screenshots !== false) await page.screenshot(options);
};
const checks = [];
function check(name, pass, detail) { checks.push({ name, pass: !!pass, detail }); console.log(`${pass ? 'PASS' : 'FAIL'} ${name}`); }
const content = () => page.evaluate(() => document.body.innerText);
const noOverflow = () => page.evaluate(() => ({ width: window.innerWidth, scroll: document.documentElement.scrollWidth }));
const storage = () => page.evaluate(() => ({ sd: localStorage.getItem('sd-research-ledger-v2'), fl: localStorage.getItem('frictionlab-workbench-v2') }));
await page.cdp('Page.addScriptToEvaluateOnNewDocument', { source: `window.__jointErrors=[];window.addEventListener('error',e=>window.__jointErrors.push(e.message));window.addEventListener('unhandledrejection',e=>window.__jointErrors.push(String(e.reason)));` });
await page.cdp('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
await page.goto(`${base}/`);
await page.waitForSelector('.home', { state: 'visible' });
let body = await content();
check('Home accurately describes current apps and provenance', ['Three independent', 'Firecrawl', 'Resend', 'Exa', 'Synthetic', 'AI coding assistance'].every(s => body.includes(s)) && !/RelayWatch|12 researched|quarantin|mock adapter/.test(body));
await page.focus('.skip-link'); await page.keyboard.press('Enter');
check('Home skip link focuses main', await page.evaluate(() => document.activeElement?.id === 'main'));
await capture({ path: path.join(out, 'home-desktop.png') });
await page.click('text="Open SignalDesk"');
await page.waitForSelector('.sd-research', { state: 'visible' });
check('Home opens current SignalDesk', (await content()).includes('Account research') && await page.evaluate(() => document.querySelectorAll('.sd-r-account-table tbody tr').length === 3));
await page.click('button[aria-label="Open Firecrawl research"]');
await page.click('text="Analyst brief"');
const originalNext = await page.evaluate(() => document.querySelector('textarea[aria-label="Proposed next step"]').value);
const marker = 'Joint verification: validate the source-backed worksheet in discovery before proposing an intervention.';
await page.fill('textarea[aria-label="Proposed next step"]', marker);
await page.waitForFunction(s => localStorage.getItem('sd-research-ledger-v2')?.includes(s), marker);
let saved = await storage();
check('SignalDesk edit persists without changing FrictionLab', saved.sd?.includes(marker));
const downloadPromise = page.waitForEvent('download'); await page.click('text="Download saved Markdown"');
const download = await downloadPromise; const mdFile = path.join(out, 'signaldesk-joint-brief.md'); await download.saveAs(mdFile);
const md = await readFile(mdFile, 'utf8');
check('SignalDesk actual Markdown carries analysis and provenance', md.includes(marker) && md.includes('https://') && /hypothes/i.test(md) && /unknown/i.test(md));
await capture({ path: path.join(out, 'signaldesk-desktop.png') });
await page.click('.sd-r-sidebar a[href="/"]'); await page.waitForSelector('.home', { state: 'visible' });
await page.click('text="Open FrictionLab"'); await page.waitForSelector('#analysis-title', { state: 'visible' });
check('SPA navigation loads current FrictionLab with both stylesheets loaded', (await content()).includes('Conversion overview') && (await content()).includes('Stage details') && (await noOverflow()).scroll <= 1440);
await page.click('text=Draft a test for this stage');
await page.fill('#hypothesis', 'Joint verification hypothesis: a clearer first action may improve this transition. This remains untested.');
await page.waitForFunction(() => localStorage.getItem('frictionlab-workbench-v2')?.includes('Joint verification hypothesis'));
const both = await storage();
check('FrictionLab writes preserve SignalDesk bytes', both.sd === saved.sd && both.fl?.includes('Joint verification hypothesis'));
await page.reload(); await page.waitForSelector('#analysis-title', { state: 'visible' });
check('FrictionLab direct route reload retains draft', await page.evaluate(() => document.querySelector('#hypothesis').value.includes('Joint verification hypothesis')));
await capture({ path: path.join(out, 'frictionlab-desktop.png') });
await page.click('.fi-portfolio'); await page.waitForSelector('.home', { state: 'visible' });
await page.click('text="Open SignalDesk"'); await page.waitForSelector('.sd-research', { state: 'visible' });
await page.click('button[aria-label="Open Firecrawl research"]'); await page.click('text="Analyst brief"');
check('SignalDesk draft survives round trip through FrictionLab', await page.evaluate(s => document.querySelector('textarea[aria-label="Proposed next step"]').value === s, marker));
await page.fill('textarea[aria-label="Proposed next step"]', originalNext);
await page.waitForFunction(s => localStorage.getItem('sd-research-ledger-v2')?.includes(s), originalNext);
check('SignalDesk edit preserves FrictionLab bytes', (await storage()).fl === both.fl);
await page.click('.sd-r-detail-head-actions a'); await page.waitForSelector('.sd-print-page', { state: 'visible' });
check('SignalDesk print route preserves citations and uncertainty', await page.evaluate(() => document.querySelectorAll('.sd-document-sources a').length >= 5) && /unknown|hypothes/i.test(await content()));
await capture({ path: path.join(out, 'signaldesk-print-preview.png') });
for (const [route, selector, name] of [['/', '.home', 'home'], ['/signaldesk', '.sd-research', 'signaldesk'], ['/frictionlab', '#analysis-title', 'frictionlab']]) {
  await page.cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await page.goto(`${base}${route}`); await page.waitForSelector(selector, { state: 'visible' });
  const bounds = await noOverflow(); check(`${name} phone layout fits viewport`, bounds.scroll <= bounds.width, bounds);
  await capture({ path: path.join(out, `${name}-mobile.png`) });
  check(`${name} has no runtime errors`, await page.evaluate(() => !window.__jointErrors?.length && !document.querySelector('vite-error-overlay')));
}
check('Both independent storage namespaces remain intact after mobile deep links', (await storage()).fl === both.fl && !!(await storage()).sd);
await writeFile(path.join(out, 'joint-browser-checks.json'), JSON.stringify({ base, screenshotsCaptured: config.screenshots !== false, checks, passed: checks.filter(c => c.pass).length, total: checks.length }, null, 2));
console.log({ passed: checks.filter(c => c.pass).length, total: checks.length, space: task.spaceId });
if (checks.some(c => !c.pass)) throw new Error('Joint acceptance checks failed; inspect evidence');
if (!config.space) await task.finish({ keep: [] });
