import { chromium } from 'playwright';

const BASE = process.env.BASE || 'http://localhost:5173';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
const errors = [];
try {
  for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 844 }]) {
    const ctx = await browser.newContext({ viewport });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(`${viewport.width}: ${String(e).slice(0, 200)}`));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(`${viewport.width} console: ${m.text().slice(0, 200)}`);
    });
    for (const route of ['/', '/signaldesk', '/signaldesk/brief/a01', '/signaldesk/data', '/frictionlab', '/frictionlab/evidence', '/frictionlab/decision']) {
      await page.goto(BASE + route, { waitUntil: 'networkidle', timeout: 20000 });
      await page.waitForTimeout(400);
      const body = await page.textContent('body');
      console.log(JSON.stringify({ viewport: viewport.width, route, chars: body?.length ?? 0, hasRoot: (body?.length ?? 0) > 200 }));
      if ((body?.length ?? 0) < 200) errors.push(`${viewport.width} ${route}: thin render`);
    }
    // Interaction smoke: search filter on signaldesk, theme toggle on frictionlab evidence
    await ctx.close();
  }
} finally {
  await browser.close();
}
if (errors.length > 0) {
  console.log('ERRORS:\n' + errors.join('\n'));
  process.exit(1);
}
console.log('BROWSER-SMOKE-OK');
