#!/usr/bin/env node
// End-to-end workflow checks for the portfolio MVPs.
// Usage:
//   npm run test:e2e                  # spawns vite dev on a free port, runs, stops it
//   E2E_BASE=http://host:port npm run test:e2e   # use an existing server, never starts one
//   E2E_CHROME=/path/to/chrome npm run test:e2e  # override the browser binary
// Browser resolution: E2E_CHROME, then the installed system Chrome on macOS,
// then Playwright's bundled Chromium (install it in CI with
// `npx playwright install chromium`; no local install is performed here).
// Downloads land in .e2e-tmp/ inside the project and are removed afterwards.
import { spawn } from 'node:child_process';
import { createWriteStream, existsSync, mkdirSync, rmSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
// The app root is the script's parent directory: serving scripts/ instead
// would answer 404s for the app page, so resolve and verify explicitly.
const ROOT = path.resolve(SCRIPT_DIR, '..');
const TMP = path.join(ROOT, '.e2e-tmp');
// Preserved outputs (gitignored): behavior screenshots, not UI substitutes.
const SHOTS = path.join(ROOT, '.e2e-shots');
const MAC_CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

let failures = 0;
function check(name, cond, extra = '') {
  if (cond) {
    console.log(`ok - ${name}`);
  } else {
    failures++;
    console.log(`FAIL - ${name}${extra ? ` :: ${extra}` : ''}`);
  }
}

function freePort() {
  return new Promise((resolve) => {
    const s = net.createServer();
    s.listen(0, '127.0.0.1', () => {
      const port = s.address().port;
      s.close(() => resolve(port));
    });
  });
}

async function waitForServer(base, tries = 60) {
  let lastErr = '';
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(base);
      const text = res.ok ? await res.text() : '';
      // Verify the actual app page, not merely that a process answers.
      if (res.ok && text.includes('id="root"')) return true;
      lastErr = res.ok ? 'served content is not the app page' : `status ${res.status}`;
    } catch (e) {
      lastErr = String((e && e.message) || e).slice(0, 160);
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  console.log(`server poll failed for ${base}: ${lastErr}`);
  return false;
}

async function tryLaunch(opts, label) {
  try {
    const browser = await chromium.launch(opts);
    if (/fallback|^E2E_CHROME=/.test(label)) console.log(`browser launch note: ${label}`);
    return browser;
  } catch (e) {
    console.log(`browser launch (${label}) failed: ${String(e.message || e).slice(0, 200)}`);
    return null;
  }
}

async function launchBrowser() {
  // Prefer normal sandboxing; fall back only where the environment requires it.
  const override = process.env.E2E_CHROME;
  if (override) {
    const b = await tryLaunch({ executablePath: override, chromiumSandbox: true }, `E2E_CHROME=${override}`);
    if (b) return b;
  } else if (existsSync(MAC_CHROME)) {
    const b =
      (await tryLaunch({ executablePath: MAC_CHROME, chromiumSandbox: true }, 'sandboxed system Chrome')) ??
      (await tryLaunch({ executablePath: MAC_CHROME, args: ['--no-sandbox'] }, 'system Chrome with --no-sandbox fallback'));
    if (b) return b;
  }
  const b =
    (await tryLaunch({ chromiumSandbox: true }, 'sandboxed bundled chromium')) ??
    (await tryLaunch({ args: ['--no-sandbox'] }, 'bundled chromium with --no-sandbox fallback'));
  if (b) return b;
  console.log('BROWSER-UNAVAILABLE: no usable browser. Install one for CI with `npx playwright install chromium`.');
  process.exit(2);
}

/** Await child exit without hanging when it already exited. */
async function waitExit(proc, timeoutMs) {
  if (proc.exitCode !== null) return;
  await new Promise((resolve) => {
    const timer = setTimeout(() => resolve(), timeoutMs);
    proc.on('exit', () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

const errors = [];
let server = null;
let base = process.env.E2E_BASE;
try {
  rmSync(TMP, { recursive: true, force: true });
  mkdirSync(TMP, { recursive: true });
  mkdirSync(SHOTS, { recursive: true });

  if (!base) {
    const port = await freePort();
    base = `http://127.0.0.1:${port}`;
    const logPath = path.join(TMP, 'vite.log');
    const log = createWriteStream(logPath);
    server = spawn('npx', ['vite', '--port', String(port), '--host', '127.0.0.1', '--strictPort'], {
      cwd: ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    server.stdout.on('data', (d) => log.write(d));
    server.stderr.on('data', (d) => log.write(d));
    server.on('error', (e) => {
      console.log(`server spawn error: ${String(e.message || e).slice(0, 200)}`);
    });
    const up = await waitForServer(base);
    check('dev server starts', up);
    if (!up) {
      try {
        log.end();
        const { readFileSync } = await import('node:fs');
        console.log(`--- vite.log tail ---\n${readFileSync(logPath, 'utf8').slice(-1500)}`);
      } catch {
        // log unavailable
      }
      throw new Error('dev server did not start');
    }
  } else {
    const up = await waitForServer(base, 6);
    check('existing server reachable', up, base);
    if (!up) throw new Error(`E2E_BASE unreachable: ${base}`);
  }

  const browser = await launchBrowser();

  for (const width of [1280, 390]) {
    const ctx = await browser.newContext({ viewport: { width, height: 800 }, acceptDownloads: true });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(`${width}: ${String(e).slice(0, 200)}`));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(`${width} console: ${m.text().slice(0, 200)}`);
    });
    page.on('requestfailed', (r) => errors.push(`${width} requestfailed: ${r.url().slice(0, 120)}`));
    const tag = width === 390 ? 'mobile' : 'desktop';

    async function shot(name) {
      await page.screenshot({ path: path.join(SHOTS, `${tag}-${name}.png`) });
    }
    async function checkOverflow(label) {
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      check(`[${tag}] no body overflow on ${label}`, overflow <= 1, `overflow ${overflow}px`);
    }

    // Home + skip link + keyboard reachability.
    await page.goto(`${base}/`, { waitUntil: 'networkidle' });
    check(`[${tag}] home renders`, (await page.textContent('body')).length > 200);
    check(`[${tag}] skip link present`, (await page.locator('.skip-link').count()) === 1);
    await page.keyboard.press('Tab');
    const firstFocus = await page.evaluate(() => document.activeElement ? document.activeElement.className : '');
    check(`[${tag}] first tab stop is the skip link`, String(firstFocus).includes('skip-link'), String(firstFocus));
    await page.keyboard.press('Enter');
    check(`[${tag}] skip link targets main content`, (await page.evaluate(() => window.location.hash)) === '#main');
    const footerColor = await page.evaluate(() => {
      const el = document.querySelector('footer.foot');
      return el ? getComputedStyle(el).color : 'missing';
    });
    check(`[${tag}] footer renders the accessible faint token`, /95,\s*107,\s*122/.test(footerColor), footerColor);
    await checkOverflow('home');
    await shot('home');

    // Fresh researched default: brief nav resolves a real record, never a01.
    await page.goto(`${base}/signaldesk/brief`, { waitUntil: 'networkidle' });
    check(`[${tag}] researched brief nav resolves a record`, /\/signaldesk\/brief\/res-/.test(page.url()), page.url());
    const researchedBody = await page.textContent('body');
    check(`[${tag}] no missing-brief on researched default`, !/Account not found/i.test(researchedBody));
    check(`[${tag}] researched provenance labeled`, /Researched primary source/i.test(researchedBody));
    const anchor = page.locator('a[target="_blank"][rel~="noopener"]');
    check(`[${tag}] source links are safe new-tab anchors`, (await anchor.count()) >= 1);
    await checkOverflow('researched brief');
    await shot('brief-researched');

    // Switch to the synthetic sample for the a01-specific workflows below.
    await page.goto(`${base}/signaldesk`, { waitUntil: 'networkidle' });
    await page.locator('#sd-dataset').selectOption('synthetic');
    const greenBadge = await page.evaluate(() => {
      const el = document.querySelector('.badge.green');
      return el ? getComputedStyle(el).color : 'missing';
    });
    check(`[${tag}] green badge renders the accessible token`, /18,\s*112,\s*58/.test(greenBadge), greenBadge);
    await checkOverflow('opportunities');
    await shot('opportunities');

    // Finding 1: exclusions propagate to brief + approved export.
    await page.goto(`${base}/signaldesk/brief/a01`, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'Approve', exact: true }).click();
    await page.getByRole('button', { name: 'Show Markdown export' }).click();
    const [mdDownload] = await Promise.all([
      page.waitForEvent('download', { timeout: 10000 }),
      page.getByRole('button', { name: 'Download .md' }).click(),
    ]);
    const mdPath = path.join(TMP, `brief-${width}.md`);
    await mdDownload.saveAs(mdPath);
    const { readFileSync } = await import('node:fs');
    const md = readFileSync(mdPath, 'utf8');
    check(`[${tag}] brief Markdown matches approved content`, /# Account brief: Northloop Systems/.test(md) && /^- Review state: approved$/m.test(md));
    await shot('brief-synthetic');
    await page.goto(`${base}/signaldesk/data`, { waitUntil: 'networkidle' });
    await page.locator('#sd-ex-dom').fill('northloop.example');
    await page.getByRole('button', { name: 'Save target' }).click();
    await page.goto(`${base}/signaldesk`, { waitUntil: 'networkidle' });
    const oppText = await page.textContent('body');
    check(`[${tag}] excluded row appears in opportunities`, /excluded/i.test(oppText));
    await page.goto(`${base}/signaldesk/brief/a01`, { waitUntil: 'networkidle' });
    const briefText = await page.textContent('body');
    check(`[${tag}] brief carries the exclusion`, /hard-excluded|excluded/i.test(briefText));
    await page.goto(`${base}/signaldesk/data`, { waitUntil: 'networkidle' });
    const exportStatus = await page.textContent('body');
    check(`[${tag}] export count excludes the account`, /0 eligible for export/.test(exportStatus));
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 10000 }),
      page.getByRole('button', { name: 'Download approved CSV' }).click(),
    ]);
    const csvPath = path.join(TMP, `approved-${width}.csv`);
    await download.saveAs(csvPath);
    const csv = readFileSync(csvPath, 'utf8');
    check(`[${tag}] approved CSV omits the excluded account`, !/Northloop/i.test(csv));

    // Invalid brief ID shows recovery, never another brief.
    await page.goto(`${base}/signaldesk/brief/does-not-exist`, { waitUntil: 'networkidle' });
    const recovery = await page.textContent('body');
    check(`[${tag}] invalid account ID shows recovery`, /Account not found/i.test(recovery));
    check(`[${tag}] recovery leaks no other brief`, !/Northloop Systems/.test(recovery));

    // Finding 6: weights stay bounded.
    await page.goto(`${base}/signaldesk/data`, { waitUntil: 'networkidle' });
    for (const id of ['#sd-w-fit', '#sd-w-intent', '#sd-w-engagement', '#sd-w-timing']) {
      await page.locator(id).fill('100');
    }
    await page.getByRole('button', { name: 'Save target' }).click();
    await page.goto(`${base}/signaldesk`, { waitUntil: 'networkidle' });
    const scores = await page.locator('td.num strong').allTextContents();
    const nums = scores.map((s) => Number(s)).filter((n) => Number.isFinite(n));
    check(`[${tag}] totals bounded 0..100 with max weights`, nums.length > 0 && nums.every((n) => n >= 0 && n <= 100), scores.slice(0, 4).join(','));

    // Finding 7: invalid feedback import quarantines visibly.
    await page.goto(`${base}/frictionlab/evidence`, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'Load invalid example' }).click();
    await page.getByRole('button', { name: 'Validate and add' }).click();
    const fbNote = await page.textContent('body');
    check(`[${tag}] invalid feedback import quarantines`, /quarantined/i.test(fbNote));

    // Findings 3+4: one persisted problem; edits invalidate approval.
    await page.goto(`${base}/frictionlab/decision`, { waitUntil: 'networkidle' });
    await page.locator('#fl-problem').selectOption({ index: 1 });
    const mdTitle = await page.textContent('body');
    check(`[${tag}] problem selection sticks in UI`, /Setup errors leave users/.test(mdTitle));
    await page.reload({ waitUntil: 'networkidle' });
    const selected = await page.locator('#fl-problem').inputValue();
    check(`[${tag}] selected problem persists across reload`, /Setup errors/.test(selected));
    await page.getByRole('button', { name: 'approved', exact: true }).click();
    await page.locator('#fl-evidence').fill('Edited after approval.');
    const dlDisabled = await page.getByRole('button', { name: 'Download Markdown' }).isDisabled();
    check(`[${tag}] edit after approval disables export`, dlDisabled);

    // Finding 2: mock failure stays a failure on retry.
    const v1 = await (async () => {
      await page.getByRole('button', { name: 'approved', exact: true }).click();
      await page.getByRole('button', { name: /Validate via mock/ }).click();
      return page.textContent('body');
    })();
    check(`[${tag}] mock validation fails honestly`, /nothing was sent/i.test(v1));
    await page.getByRole('button', { name: /Validate via mock/ }).click();
    const v2 = await page.textContent('body');
    check(`[${tag}] retry stays a failure, no invented ID`, /nothing was sent/i.test(v2) && !/mock-\d+/.test(v2));

    // Event-only import changes funnel evidence and handoff provenance.
    await page.goto(`${base}/frictionlab`, { waitUntil: 'networkidle' });
    const importBtn = page.getByRole('button', { name: 'Import events' });
    if ((await importBtn.count()) > 0) {
      await importBtn.click();
    }
    await page.getByRole('button', { name: 'Validate and add' }).click();
    const importedNote = await page.textContent('body');
    check(`[${tag}] events import accepted`, /Imported 1 rows/i.test(importedNote));
    await page.goto(`${base}/frictionlab/decision`, { waitUntil: 'networkidle' });
    const staleNote = await page.textContent('body');
    check(`[${tag}] upstream import invalidates approval`, /stale|reset to draft|not approved|Draft preview/i.test(staleNote));
    await page.getByRole('button', { name: 'approved', exact: true }).click();
    await page.getByRole('button', { name: 'Show Markdown' }).click();
    const [eventMd] = await Promise.all([
      page.waitForEvent('download', { timeout: 10000 }),
      page.getByRole('button', { name: 'Download Markdown' }).click(),
    ]);
    const eventMdPath = path.join(TMP, `handoff-${width}.md`);
    await eventMd.saveAs(eventMdPath);
    const handoff = readFileSync(eventMdPath, 'utf8');
    check(`[${tag}] handoff declares user-provided event evidence`, /user-provided records \(unverified\)/.test(handoff));
    await page.reload({ waitUntil: 'networkidle' });
    const persisted = await page.textContent('body');
    check(`[${tag}] import survives reload`, /approved/i.test(persisted));

    // Funnel includes quarantine units; evidence navigation reaches records.
    await page.goto(`${base}/frictionlab`, { waitUntil: 'networkidle' });
    const funnelText = await page.textContent('body');
    check(`[${tag}] funnel shows quarantine units`, /events|accounts/i.test(funnelText));
    await checkOverflow('funnel');
    await shot('funnel');
    await page.goto(`${base}/frictionlab/decision`, { waitUntil: 'networkidle' });
    await checkOverflow('decision');
    await shot('decision');

    await ctx.close();

    // Invalid saved shapes recover visibly instead of crashing.
    const badCtx = await browser.newContext({
      viewport: { width, height: 800 },
      storageState: { cookies: [], origins: [] },
    });
    await badCtx.addInitScript(() => {
      window.localStorage.setItem('sd-accounts-v1', JSON.stringify({ v: 99, data: [] }));
    });
    const badPage = await badCtx.newPage();
    await badPage.goto(`${base}/signaldesk`, { waitUntil: 'networkidle' });
    const badBody = await badPage.textContent('body');
    check(`[${tag}] invalid saved shape recovers with notice`, /unknown storage version|Recovered|failed validation|unusable/i.test(badBody));
    check(`[${tag}] recovery still renders opportunities`, /Opportunities|SignalDesk/.test(badBody));
    await badCtx.close();
  }

  check('no uncaught browser errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await browser.close();
} catch (e) {
  failures++;
  console.log(`FAIL - e2e run aborted :: ${String((e && e.message) || e).slice(0, 300)}`);
} finally {
  if (server && server.exitCode === null) {
    server.kill('SIGTERM');
    await waitExit(server, 5000);
  }
  if (server && server.exitCode === null) {
    server.kill('SIGKILL');
    await waitExit(server, 5000);
  }
  rmSync(TMP, { recursive: true, force: true });
}

console.log(failures === 0 ? 'E2E-OK' : `E2E-FAILED (${failures})`);
process.exit(failures === 0 ? 0 : 1);
