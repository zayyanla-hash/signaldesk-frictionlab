/* global document, innerWidth, window */
// Portable Playwright coverage for the current FrictionLab workflow. The fuller
// Ego browser suite remains available for independent desktop inspection.
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

export async function runFrictionLabChecks({ browser, base, root, out, check }) {
  await mkdir(out, { recursive: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
  const page = await context.newPage(); page.setDefaultTimeout(10000);
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  const button = name => page.getByRole('button', { name, exact: true });
  const hero = async expected => { await page.waitForFunction(value => document.querySelector('.fi-hero')?.textContent === value, expected); };
  const openImport = async () => { if (!await page.locator('#import-panel').count()) await button('Import funnel data').click(); };
  const load = async name => { await openImport(); await button(name).click(); };
  const apply = async () => {
    await button('Validate dataset').click(); await page.locator('.fi-validation').filter({ hasText: 'Validation passed' }).waitFor();
    await button('Replace active dataset').click(); await page.locator('#import-panel').waitFor({ state: 'detached' });
  };
  const fixture = name => path.join(root, 'src/frictionlab/fixtures', name);
  const aggregate = async filename => {
    await load('Load synthetic aggregate');
    await page.locator('input[type="file"]').setInputFiles(fixture(filename));
    const source = await readFile(fixture(filename), 'utf8');
    await page.waitForFunction(text => document.querySelector('.fi-csv')?.value === text, source);
    await page.locator('.fi-confirm input').check(); await apply();
  };
  const noOverflow = async () => assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
  try {
    await check('FrictionLab default synthetic cohort has inspectable counts and denominators', async () => {
      await page.goto(base + '/frictionlab'); await page.locator('#analysis-title').waitFor();
      assert.match(await page.title(), /FrictionLab/); await hero('40.0%');
      assert.match(await page.locator('.fi-primary').innerText(), /1,000/);
      assert.match(await page.locator('body').innerText(), /Synthetic/); await noOverflow();
      await page.screenshot({ path: path.join(out, 'analysis-desktop.png'), fullPage: false });
    });
    await check('FrictionLab keyboard stage inspection changes evidence and draft target', async () => {
      await page.locator('.fi-stage-controls button').first().focus(); await page.keyboard.press('Tab'); await page.keyboard.press('Tab'); await page.keyboard.press('Enter');
      await page.waitForFunction(() => document.querySelector('#evidence-title')?.textContent === 'First useful action');
      assert.equal(await page.locator('.fi-stage-controls button').nth(2).getAttribute('aria-pressed'), 'true');
      await button('Draft a test for this stage').click(); assert.match(await page.locator('#primaryMetric').inputValue(), /first_action.*connected_data/s);
    });
    await check('FrictionLab drafts persist; segment selection resets the population and proposal', async () => {
      await page.locator('#hypothesis').fill('Untested: a clearer first-action prompt may improve completion.'); await page.reload(); await page.locator('#hypothesis').waitFor();
      assert.match(await page.locator('#hypothesis').inputValue(), /clearer first-action/);
      await page.locator('.fi-segment select').selectOption('Mobile'); await hero('25.0%');
      assert.match(await page.locator('#audience').inputValue(), /segment Mobile/);
      assert.doesNotMatch(await page.locator('#hypothesis').inputValue(), /clearer first-action/);
      await page.locator('.fi-segment select').selectOption(''); await hero('40.0%');
    });
    await check('FrictionLab incomplete experiment cannot export', async () => {
      const original = await page.locator('#guardrail').inputValue(); await page.locator('#guardrail').fill('');
      assert.equal(await button('Export decision brief').isDisabled(), true); await page.locator('#guardrail').fill(original);
    });
    await check('FrictionLab invalid import reports errors without changing active analysis', async () => {
      await load('Load invalid fixture'); await button('Validate dataset').click();
      await page.locator('.fi-validation-error').waitFor(); const text = await page.locator('.fi-validation').innerText();
      assert.match(text, /Duplicate event_id/); assert.match(text, /Invalid calendar date/); assert.equal(await button('Replace active dataset').isDisabled(), true); await hero('40.0%');
      await page.screenshot({ path: path.join(out, 'validation-errors.png'), fullPage: false });
    });
    await check('FrictionLab event import orders and deduplicates events, excludes immature signups', async () => {
      await load('Load eight-user event fixture'); await apply(); await hero('42.9%');
      assert.match(await page.locator('.fi-primary').innerText(), /7/);
      await page.locator('.fi-raw summary').click(); assert.match(await page.locator('.fi-raw').innerText(), /immature|full.*window/i);
    });
    await check('FrictionLab changed inputs revoke validated replacement permission', async () => {
      await load('Load eight-user event fixture'); await button('Validate dataset').click(); await page.locator('.fi-validation').filter({ hasText: 'Validation passed' }).waitFor();
      await page.getByLabel('Conversion window · days').fill('3'); assert.equal(await button('Replace active dataset').isDisabled(), true);
      await apply(); await hero('25.0%');
    });
    await check('FrictionLab independent user reach does not claim ordered cohort conversion', async () => {
      await load('Load eight-user event fixture'); await page.getByLabel('Data grain · required').selectOption('unique_users'); await apply(); await hero('37.5%');
      assert.match(await page.locator('.fi-reading').innerText(), /Descriptive reach only/);
    });
    await check('FrictionLab zero denominator is unknown and small cohorts show uncertainty', async () => {
      await aggregate('zero-cohort.csv'); await hero('—'); assert.match(await page.locator('.fi-primary').innerText(), /Not estimable/);
      assert.doesNotMatch(await page.locator('.fi-root').innerText(), /NaN|Infinity/);
      await aggregate('small-cohort.csv'); assert.match(await page.locator('.fi-root').innerText(), /SMALL SAMPLE/);
    });
    await check('FrictionLab oversized local files are rejected without replacing data', async () => {
      await openImport(); await page.locator('input[type="file"]').setInputFiles({ name: 'oversized.csv', mimeType: 'text/csv', buffer: Buffer.alloc(1024 * 1024 + 1, 65) });
      await page.getByRole('alert').filter({ hasText: 'File exceeds 1 MB' }).waitFor(); assert.equal(await button('Replace active dataset').isDisabled(), true);
      await load('Load synthetic aggregate'); await page.locator('.fi-confirm input').check(); await apply(); await hero('40.0%');
    });
    await check('FrictionLab hostile draft is inert and dense text blocks clipped exports', async () => {
      await page.locator('#hypothesis').fill('<img src=x onerror="window.__pwned=1"> Untested: clarify setup.');
      assert.equal(await page.evaluate(() => window.__pwned), undefined);
      await page.locator('#hypothesis').fill('W'.repeat(700)); assert.equal(await button('Export decision brief').isDisabled(), true);
      assert.match(await page.locator('.fi-errors').innerText(), /print budget/);
      await page.locator('.fi-stage-controls button').nth(1).click(); await button('Draft a test for this stage').click();
    });
    await check('FrictionLab actual decision-brief download renders to A4 with honest limits', async () => {
      const downloadEvent = page.waitForEvent('download'); await button('Export decision brief').click(); const download = await downloadEvent;
      const file = path.join(out, 'decision-brief.html'); await download.saveAs(file); const html = await readFile(file, 'utf8');
      assert.match(html, /Synthetic/i); assert.match(html, /not.*launch approval/i); assert.doesNotMatch(html, /onerror=/);
      const print = await context.newPage(); await print.setContent(html); await print.evaluate(() => document.fonts.ready);
      await print.pdf({ path: path.join(out, 'decision-brief.pdf'), format: 'A4', preferCSSPageSize: true, printBackground: true });
      await print.screenshot({ path: path.join(out, 'decision-brief.png'), fullPage: true }); await print.close();
    });
    await check('FrictionLab mobile analysis, import and experiment stay within the viewport', async () => {
      await page.setViewportSize({ width: 390, height: 844 }); await page.goto(base + '/frictionlab'); await page.locator('#analysis-title').waitFor(); await noOverflow();
      await page.screenshot({ path: path.join(out, 'analysis-mobile.png'), fullPage: false });
      await openImport(); await noOverflow(); await page.screenshot({ path: path.join(out, 'import-mobile.png'), fullPage: false });
      await button('Import funnel data').click(); await page.locator('#hypothesis').fill('Untested: mobile controls remain editable.'); await noOverflow();
    });
    await check('FrictionLab browser console remains healthy', async () => assert.deepEqual(errors, []));
    await writeFile(path.join(out, 'browser-errors.json'), JSON.stringify(errors));
  } catch (error) {
    await page.screenshot({ path: path.join(out, 'failure.png'), fullPage: true }).catch(() => {}); throw error;
  } finally { await context.close(); }
}
