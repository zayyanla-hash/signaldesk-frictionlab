#!/usr/bin/env node
// Combined acceptance suite. Uses E2E_BASE when supplied, otherwise owns a Vite
// server on a free loopback port. Browser: E2E_CHROME, macOS Chrome, bundled
// Playwright Chromium. CI installs Chromium; no download is attempted here.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { runFrictionLabChecks } from './e2e-frictionlab.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.resolve(process.env.E2E_OUTPUT || path.join(ROOT, '.e2e-shots'));
const MAC_CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const executablePath = process.env.E2E_CHROME || (existsSync(MAC_CHROME) ? MAC_CHROME : chromium.executablePath());
const checks = [], errors = [];
let server, browser, page;
await mkdir(OUT, { recursive: true });
async function check(name, fn) {
  await fn(); checks.push({ name, status: 'passed' }); console.log(`PASS ${name}`);
}
async function freePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer(); s.on('error', reject);
    s.listen(0, '127.0.0.1', () => { const port = s.address().port; s.close(() => resolve(port)); });
  });
}
async function stop(child) {
  if (!child || child.exitCode !== null) return;
  child.kill('SIGTERM');
  await Promise.race([new Promise(r => child.once('exit', r)), new Promise(r => setTimeout(r, 3000))]);
  if (child.exitCode === null) child.kill('SIGKILL');
}
async function runNode(file, env) {
  const child = spawn(process.execPath, [file], { cwd: ROOT, env: { ...process.env, ...env }, stdio: 'inherit' });
  let timer;
  try {
    await new Promise((resolve, reject) => {
      timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error(`${file} timed out after 180 seconds`)); }, 180000);
      child.once('error', reject);
      child.once('exit', code => code === 0 ? resolve() : reject(new Error(`${file} exited ${code}`)));
    });
  } finally { clearTimeout(timer); }
}
try {
  let base = process.env.E2E_BASE;
  if (!base) {
    const port = await freePort(); base = `http://127.0.0.1:${port}`;
    // Downloaded brief HTML is evidence, not an app edit: exclude this output
    // directory from HMR so generating an export cannot reload another tab.
    const launch = `import { createServer } from 'vite';
      const server = await createServer({ server: { host: '127.0.0.1', port: ${port}, strictPort: true, watch: { ignored: [${JSON.stringify(path.join(OUT, '**'))}] } } });
      await server.listen();`;
    server = spawn(process.execPath, ['--input-type=module', '-e', launch], { cwd: ROOT, stdio: 'inherit' });
    server.on('error', e => errors.push(e.message));
  }
  let ready = false;
  for (let i = 0; i < 60; i++) {
    try { const res = await fetch(base, { signal: AbortSignal.timeout(2000) }); if (res.ok && (await res.text()).includes('id="root"')) { ready = true; break; } } catch { /* startup */ }
    await new Promise(r => setTimeout(r, 500));
  }
  assert.ok(ready, `App not available at ${base}`);
  browser = await chromium.launch({ headless: true, executablePath });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
  page = await context.newPage(); page.setDefaultTimeout(10000);
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  const home = async () => { await page.goto(base); await page.getByRole('heading', { name: 'SignalDesk and FrictionLab', exact: true }).waitFor(); };
  const noOverflow = async () => assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
  await check('Shared Home states current workflows, provenance and honest limits', async () => {
    await home(); assert.match(await page.title(), /Zayyan Latif/);
    const text = await page.locator('main').innerText();
    assert.match(text, /Firecrawl, Resend and Exa/); assert.match(text, /URL alone does not fetch/);
    assert.match(text, /synthetic aggregate and user-event/); assert.match(text, /hypothetical/);
    assert.doesNotMatch(text, /Twelve vendors|Switch to synthetic|produced commercial results/);
    for (const link of await page.locator('a[target="_blank"]').all()) assert.match(await link.getAttribute('rel'), /noopener/);
    await noOverflow(); await page.screenshot({ path: path.join(OUT, 'home-desktop.png'), fullPage: true });
  });
  await check('Keyboard skip link reaches main content', async () => {
    await home(); await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement?.textContent), 'Skip to main content');
    await page.keyboard.press('Enter'); assert.equal(await page.evaluate(() => document.activeElement?.id), 'main');
  });
  await check('Same-page navigation preserves research and isolates app storage', async () => {
    await page.getByRole('link', { name: 'Open SignalDesk', exact: true }).click();
    await page.getByRole('heading', { name: 'Account research', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Open Firecrawl research', exact: true }).click();
    await page.getByRole('button', { name: 'Analyst brief', exact: true }).click();
    await page.getByLabel('Proposed next step').fill('Integration check: validate evidence before action.');
    await page.waitForFunction(() => localStorage.getItem('sd-research-ledger-v2')?.includes('Integration check:'));
    const sd = await page.evaluate(() => localStorage.getItem('sd-research-ledger-v2'));
    await page.locator('a[href="/"]').first().click(); await page.getByRole('link', { name: 'Open FrictionLab', exact: true }).click();
    await page.locator('#analysis-title').waitFor(); assert.equal(await page.locator('.fi-hero').innerText(), '40.0%');
    await page.locator('#hypothesis').fill('Untested: integration draft persists within FrictionLab only.');
    await page.waitForFunction(() => localStorage.getItem('frictionlab-workbench-v2')?.includes('integration draft'));
    await page.getByRole('button', { name: 'Clear this workspace’s local work', exact: true }).click();
    await page.waitForFunction(() => localStorage.getItem('frictionlab-workbench-v2') === null);
    assert.equal(await page.evaluate(() => localStorage.getItem('sd-research-ledger-v2')), sd);
    await page.locator('a[href="/"]').first().click(); await page.getByRole('link', { name: 'Open SignalDesk', exact: true }).click();
    await page.getByRole('heading', { name: 'Account research', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Open Firecrawl research', exact: true }).click();
    await page.getByRole('button', { name: 'Analyst brief', exact: true }).click();
    assert.equal(await page.getByLabel('Proposed next step').inputValue(), 'Integration check: validate evidence before action.');
    await noOverflow();
  });
  await check('Mobile Home routes to both responsive apps without style bleed', async () => {
    await page.setViewportSize({ width: 390, height: 844 }); await home(); await noOverflow();
    await page.screenshot({ path: path.join(OUT, 'home-mobile.png'), fullPage: true });
    await page.getByRole('link', { name: 'Open FrictionLab', exact: true }).click(); await page.locator('#analysis-title').waitFor(); await noOverflow();
    await page.locator('a[href="/"]').first().click(); await page.getByRole('link', { name: 'Open SignalDesk', exact: true }).click();
    await page.getByRole('heading', { name: 'Account research', exact: true }).waitFor(); await noOverflow();
    assert.equal(await page.locator('.fi-root').count(), 0);
  });
  await check('Unknown routes recover through the shared Home', async () => {
    await page.goto(base + '/not-a-real-route'); await page.getByRole('heading', { name: 'Page not found', exact: true }).waitFor();
    await page.getByRole('link', { name: 'Back to home', exact: true }).click(); await page.getByRole('heading', { name: 'SignalDesk and FrictionLab', exact: true }).waitFor();
  });
  await check('Shared routes produce no browser errors', async () => assert.deepEqual(errors, []));
  await context.close();
  await runFrictionLabChecks({ browser, base, root: ROOT, out: path.join(OUT, 'frictionlab'), check });
  await check('Complete SignalDesk evidence, qualification, persistence and export acceptance', async () => {
    await runNode('src/signaldesk/qa/browser.mjs', { SD_BASE: base, SD_OUTPUT: path.join(OUT, 'signaldesk'), SD_CHROME: executablePath });
  });
  const signaldesk = JSON.parse(await readFile(path.join(OUT, 'signaldesk', 'browser-results.json'), 'utf8'));
  await writeFile(path.join(OUT, 'combined-results.json'), JSON.stringify({ base, sharedAndFrictionLab: checks.slice(0, -1), signaldesk: signaldesk.checks, consoleErrors: errors }, null, 2));
  console.log(`E2E-OK (${checks.length - 1} shared/FrictionLab groups + ${signaldesk.checks.length} SignalDesk groups) ${OUT}`);
} catch (error) {
  process.exitCode = 1; console.error('E2E-FAILED', error);
  await page?.screenshot({ path: path.join(OUT, 'failure.png'), fullPage: true }).catch(() => {});
  await writeFile(path.join(OUT, 'failure.txt'), String(error));
} finally { await browser?.close(); await stop(server); }
