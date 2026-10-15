// Node 24 reads this dependency-free TypeScript module via built-in type stripping.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { renderPortfolioHead } from '../src/seo/portfolio.ts';

const root = resolve(import.meta.dirname, '..');
const template = readFileSync(resolve(root, 'dist/index.html'), 'utf8');
const marker = /<!-- portfolio-head:start -->[\s\S]*?<!-- portfolio-head:end -->/;
if (!marker.test(template)) throw new Error('Portfolio head markers missing: refusing to publish generic metadata.');
for (const [route, file] of [['/', 'index.html'], ['/signaldesk', 'signaldesk.html'], ['/frictionlab', 'frictionlab.html'], ['/not-indexable', 'app.html']]) {
  const html = template.replace(marker, `<!-- portfolio-head:start -->\n${renderPortfolioHead(route)}\n<!-- portfolio-head:end -->`);
  writeFileSync(resolve(root, `dist/${file}`), html);
}
console.log('Built portfolio metadata for Home, SignalDesk and FrictionLab; neutral shell for workspace routes.');
