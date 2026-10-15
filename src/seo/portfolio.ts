// Public portfolio facts only. Never derive structured data from local workspaces.
export const PORTFOLIO_ORIGIN = 'https://zayyan-portfolio-labs-ascend4.vercel.app';
export const PORTFOLIO_ROUTES = ['/', '/signaldesk', '/frictionlab'] as const;
export type PortfolioRoute = typeof PORTFOLIO_ROUTES[number];
export type SchemaNode = Record<string, unknown>;
export type PortfolioMetadata = { title: string; description: string; canonical: string; graph: { '@context': string; '@graph': SchemaNode[] } };

const personId = 'https://zayyanlatif.com/#person';
const websiteId = `${PORTFOLIO_ORIGIN}/#website`;
const ref = (id: string) => ({ '@id': id });
const url = (path: string) => `${PORTFOLIO_ORIGIN}${path}`;
const credit = 'Built by Zayyan Latif with AI coding assistance.';
const projects = [
  {
    path: '/signaldesk', name: 'SignalDesk',
    title: 'SignalDesk — Account research work sample by Zayyan Latif',
    description: 'An independent portfolio project by Zayyan Latif: a browser-based account research ledger with cited evidence, explained qualification and exportable analyst briefs. Independent public-source examples; no customer relationship or buying intent is implied.',
    applicationCategory: 'BusinessApplication',
    featureList: ['Cited evidence records', 'Explained account qualification', 'Local research import and backup', 'Exportable analyst briefs'],
  },
  {
    path: '/frictionlab', name: 'FrictionLab',
    title: 'FrictionLab — Funnel analysis work sample by Zayyan Latif',
    description: 'An independent portfolio project by Zayyan Latif: validated CSV funnel analysis, inspectable denominators and measurable experiment design with an exportable decision brief. Examples are synthetic; observed drop-offs do not establish causes.',
    applicationCategory: 'BusinessApplication',
    featureList: ['Declared data grain and conversion window', 'Validated CSV imports', 'Deterministic funnel calculations', 'Stage evidence inspection', 'Experiment design and decision brief export'],
  },
] as const;

export function getPortfolioMetadata(pathname: string): PortfolioMetadata | null {
  const path = pathname.split(/[?#]/)[0].replace(/\/$/, '') || '/';
  if (!(PORTFOLIO_ROUTES as readonly string[]).includes(path)) return null;
  const person: SchemaNode = {
    '@type': 'Person', '@id': personId, name: 'Zayyan Latif', url: 'https://zayyanlatif.com/',
    sameAs: ['https://github.com/zayyanla-hash', 'https://www.linkedin.com/in/zayyanmlatif/'],
  };
  const website: SchemaNode = {
    '@type': 'WebSite', '@id': websiteId, url: url('/'),
    name: 'Zayyan Latif — SignalDesk and FrictionLab portfolio projects', publisher: ref(personId), inLanguage: 'en',
  };
  const selected = path === '/' ? projects : projects.filter(project => project.path === path);
  const apps: SchemaNode[] = selected.map(project => ({
    '@type': 'WebApplication', '@id': `${url(project.path)}#application`,
    name: project.name, url: url(project.path), description: project.description,
    creator: ref(personId), creditText: credit,
    applicationCategory: project.applicationCategory,
    browserRequirements: 'A modern web browser with JavaScript enabled. Local persistence requires browser storage.',
    isAccessibleForFree: true, inLanguage: 'en', featureList: [...project.featureList],
    mainEntityOfPage: ref(`${url(project.path)}#webpage`),
  }));
  const title = path === '/' ? 'Zayyan Latif — SignalDesk and FrictionLab portfolio projects' : selected[0].title;
  const description = path === '/'
    ? 'Two portfolio projects by Zayyan Latif, built with AI coding assistance: SignalDesk for cited account research and FrictionLab for funnel analysis and experiment design. Labeled examples, local browser storage and no claimed commercial results.'
    : selected[0].description;
  const page: SchemaNode = {
    '@type': path === '/' ? 'CollectionPage' : 'WebPage', '@id': `${url(path)}#webpage`,
    url: url(path), name: title, description, isPartOf: ref(websiteId), author: ref(personId), inLanguage: 'en',
    mainEntity: path === '/' ? ref(`${url('/')}#projects`) : ref(`${url(path)}#application`),
  };
  const graph = [person, website, page, ...apps];
  if (path === '/') {
    graph.push({
      '@type': 'ItemList', '@id': `${url('/')}#projects`, name: 'Portfolio projects', numberOfItems: 2,
      itemListElement: projects.map((project, index) => ({ '@type': 'ListItem', position: index + 1, item: ref(`${url(project.path)}#application`) })),
    });
    // Complete entity links on Home without pretending the app pages are rendered here.
    apps.forEach(app => { delete app.mainEntityOfPage; });
  }
  return { title, description, canonical: url(path), graph: { '@context': 'https://schema.org', '@graph': graph } };
}

export function serializeJsonLd(value: unknown): string {
  // Keep text inert inside an HTML script element, including closing script tags.
  return JSON.stringify(value).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
}

const escapeAttribute = (value: string) => value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
export function renderPortfolioHead(pathname: string): string {
  const metadata = getPortfolioMetadata(pathname);
  if (!metadata) return '<title>Zayyan Latif — Portfolio projects</title>\n<meta name="robots" content="noindex,follow" data-portfolio-head />';
  return `<title>${escapeAttribute(metadata.title)}</title>\n<meta name="description" content="${escapeAttribute(metadata.description)}" data-portfolio-head />\n<link rel="canonical" href="${metadata.canonical}" data-portfolio-head />\n<script type="application/ld+json" id="portfolio-schema" data-portfolio-head>${serializeJsonLd(metadata.graph)}</script>`;
}
