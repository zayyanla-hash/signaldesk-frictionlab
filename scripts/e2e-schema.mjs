/* global window, document */
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';

const ORIGIN = 'https://zayyan-portfolio-labs-ascend4.vercel.app';
const ROOTS = ['/', '/signaldesk', '/frictionlab'];
const jsonLdScripts = html => [...html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/g)];

function assertProjectGraph(graph, route) {
  assert.equal(graph['@context'], 'https://schema.org');
  const nodes = graph['@graph'];
  const ids = nodes.map(node => node['@id']);
  assert.equal(new Set(ids).size, ids.length, 'Entity IDs must be unique');
  const person = nodes.find(node => node['@type'] === 'Person');
  assert.equal(person?.name, 'Zayyan Latif');
  assert.equal(person.url, 'https://zayyanlatif.com/');
  const apps = nodes.filter(node => node['@type'] === 'WebApplication');
  assert.deepEqual(apps.map(app => app.name), route === '/' ? ['SignalDesk', 'FrictionLab'] : [route === '/signaldesk' ? 'SignalDesk' : 'FrictionLab']);
  for (const app of apps) {
    assert.equal(app.creator?.['@id'], person['@id']);
    assert.match(app.description, /independent portfolio project by Zayyan Latif/i);
    assert.match(app.creditText, /Zayyan Latif with AI coding assistance/);
    assert.equal(app.isAccessibleForFree, true);
  }
  const serialized = JSON.stringify(graph);
  for (const match of serialized.matchAll(/"@id":"([^"]+)"/g)) assert.ok(ids.includes(match[1]), `Dangling entity reference: ${match[1]}`);
  assert.doesNotMatch(serialized, /"(?:aggregateRating|review|offers|sourceOrganization|worksFor|employee|interactionStatistic|datePublished|dateCreated)"/);
  assert.doesNotMatch(serialized, /\b(?:Firecrawl|Resend|Exa)\b|private-schema-sentinel/);
}

// Uses the combined suite's browser resolver, isolated contexts and serving mode.
// Production builds must expose schema before JavaScript; Vite's development
// template deliberately supplies only the neutral shell and uses RouteMetadata.
export async function runSchemaChecks({ browser, base, out, check }) {
  const rawGraphs = new Map();
  const request = route => fetch(base + route, { signal: AbortSignal.timeout(15000) });
  const homeHtml = await (await request('')).text();
  const development = homeHtml.includes('/@vite/client');
  await check(development ? 'Vite uses a neutral shell; crawler metadata is checked in the production suite' : 'Public schema is available to crawlers; workspace URLs stay neutral', async () => {
    if (development) {
      assert.match(homeHtml, /portfolio-head:start/);
      assert.equal(jsonLdScripts(homeHtml).length, 0);
      return;
    }
    for (const route of [...ROOTS, '/signaldesk/', '/frictionlab/']) {
      const response = await request(route);
      assert.equal(response.status, 200, route);
      const html = await response.text();
      const normalized = route.replace(/\/$/, '') || '/';
      const scripts = jsonLdScripts(html);
      assert.equal(scripts.length, 1, route);
      const graph = JSON.parse(scripts[0][1]);
      assertProjectGraph(graph, normalized);
      assert.equal([...html.matchAll(/rel="canonical"/g)].length, 1);
      assert.ok(html.includes(`href="${ORIGIN}${normalized}"`));
      assert.doesNotMatch(html, /name="robots"[^>]*noindex/);
      rawGraphs.set(normalized, graph);
    }
    for (const route of ['/signaldesk/brief/ind-firecrawl', '/signaldesk/print/ind-firecrawl', '/signaldesk/data', '/not-a-real-route']) {
      const response = await request(route);
      assert.equal(response.status, 200, route);
      const html = await response.text();
      assert.equal(jsonLdScripts(html).length, 0, route);
      assert.doesNotMatch(html, /rel="canonical"/);
      assert.match(html, /name="robots"[^>]*noindex,follow/);
    }
    const context = await browser.newContext({ javaScriptEnabled: false });
    try {
      const page = await context.newPage();
      for (const route of ROOTS) {
        await page.goto(base + route);
        assert.equal(await page.locator('script[type="application/ld+json"]').count(), 1);
        assert.deepEqual(JSON.parse(await page.locator('#portfolio-schema').textContent()), rawGraphs.get(route));
      }
    } finally { await context.close(); }
  });

  await check('SPA navigation replaces schema without duplicates or saved research data', async () => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const errors = [];
    try {
      const page = await context.newPage();
      page.setDefaultTimeout(10000);
      page.on('pageerror', error => errors.push(error.message));
      await page.addInitScript(() => {
        window.schemaCspViolations = [];
        document.addEventListener('securitypolicyviolation', event => window.schemaCspViolations.push(event.violatedDirective));
      });
      const runtimeGraph = async route => {
        await page.waitForFunction(id => {
          const schema = document.querySelector('#portfolio-schema');
          return schema && JSON.parse(schema.textContent)['@graph'].some(node => node['@id'] === id);
        }, `${ORIGIN}${route}#webpage`);
        assert.equal(await page.locator('script[type="application/ld+json"]').count(), 1);
        assert.equal(await page.locator('link[rel="canonical"]').count(), 1);
        assert.equal(await page.locator('link[rel="canonical"]').getAttribute('href'), `${ORIGIN}${route}`);
        assert.equal(await page.locator('meta[name="description"]').count(), 1);
        assert.equal(await page.locator('meta[name="robots"]').count(), 0);
        const graph = JSON.parse(await page.locator('#portfolio-schema').textContent());
        assertProjectGraph(graph, route);
        if (rawGraphs.has(route)) assert.deepEqual(graph, rawGraphs.get(route));
        return graph;
      };
      await page.goto(base);
      await runtimeGraph('/');
      await page.getByRole('link', { name: 'Open SignalDesk', exact: true }).click();
      await page.getByRole('heading', { name: 'Account research', exact: true }).waitFor();
      const originalGraph = await runtimeGraph('/signaldesk');
      await page.getByRole('button', { name: 'Analyst brief', exact: true }).click();
      await page.getByLabel('Proposed next step').fill('private-schema-sentinel: a browser-local draft must never become public metadata.');
      await page.waitForFunction(() => localStorage.getItem('sd-research-ledger-v2')?.includes('private-schema-sentinel'));
      assert.deepEqual(await runtimeGraph('/signaldesk'), originalGraph);
      await page.getByRole('link', { name: 'Import & backup', exact: true }).click();
      await page.getByRole('heading', { name: 'Import & backup', exact: true }).waitFor();
      assert.equal(await page.locator('#portfolio-schema').count(), 0);
      assert.equal(await page.locator('link[rel="canonical"]').count(), 0);
      assert.equal(await page.locator('meta[name="description"]').count(), 0);
      assert.equal(await page.locator('meta[name="robots"]').getAttribute('content'), 'noindex,follow');
      await page.locator('a[href="/"]').first().click();
      await runtimeGraph('/');
      await page.getByRole('link', { name: 'Open FrictionLab', exact: true }).click();
      await runtimeGraph('/frictionlab');
      await page.locator('a[href="/"]').first().click();
      await runtimeGraph('/');
      await page.getByRole('link', { name: 'Open SignalDesk', exact: true }).click();
      await page.getByRole('heading', { name: 'Account research', exact: true }).waitFor();
      await runtimeGraph('/signaldesk');
      assert.deepEqual(await page.evaluate(() => window.schemaCspViolations), []);
      assert.deepEqual(errors, []);
      await writeFile(path.join(out, 'schema-lifecycle.json'), JSON.stringify({ base, initialHtmlVerified: rawGraphs.size === 3, creator: 'Zayyan Latif', privateDraftExcluded: true, singleGraphPerPage: true, cspViolations: [], runtimeErrors: [] }, null, 2));
    } finally { await context.close(); }
  });
}
