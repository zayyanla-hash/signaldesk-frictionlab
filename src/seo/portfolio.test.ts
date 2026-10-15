import { describe, expect, it } from 'vitest';
import { PORTFOLIO_ORIGIN, PORTFOLIO_ROUTES, getPortfolioMetadata, renderPortfolioHead, serializeJsonLd } from './portfolio';

describe('truthful portfolio structured data', () => {
  it.each(PORTFOLIO_ROUTES)('%s identifies its creator and resolves all internal graph references', route => {
    const metadata = getPortfolioMetadata(route)!;
    const graph = metadata.graph['@graph'];
    const ids = graph.map(node => node['@id']);
    expect(new Set(ids).size).toBe(ids.length);
    expect(metadata.canonical).toBe(`${PORTFOLIO_ORIGIN}${route}`);
    expect(graph.find(node => node['@type'] === 'Person')).toMatchObject({ name: 'Zayyan Latif', url: 'https://zayyanlatif.com/' });
    const refs = JSON.stringify(graph).matchAll(/"@id":"([^"]+)"/g);
    for (const match of refs) expect(ids).toContain(match[1]);
    for (const app of graph.filter(node => node['@type'] === 'WebApplication')) {
      expect(app.creator).toEqual({ '@id': 'https://zayyanlatif.com/#person' });
      expect(app.creditText).toContain('AI coding assistance');
      expect(app.description).toMatch(/portfolio project by Zayyan Latif/i);
    }
  });
  it('Home lists the two real projects; app pages describe only the current app', () => {
    const home = getPortfolioMetadata('/')!.graph['@graph'];
    expect(home.find(node => node['@type'] === 'CollectionPage')).toBeDefined();
    expect(home.find(node => node['@type'] === 'ItemList')).toMatchObject({ numberOfItems: 2 });
    expect(home.filter(node => node['@type'] === 'WebApplication').map(node => node.name)).toEqual(['SignalDesk', 'FrictionLab']);
    expect(getPortfolioMetadata('/signaldesk')!.graph['@graph'].filter(node => node['@type'] === 'WebApplication').map(node => node.name)).toEqual(['SignalDesk']);
    expect(getPortfolioMetadata('/frictionlab')!.graph['@graph'].filter(node => node['@type'] === 'WebApplication').map(node => node.name)).toEqual(['FrictionLab']);
  });
  it('never generates ratings, offers, reviews, traction, unverified dates or employer relationships', () => {
    const forbidden = /"(?:aggregateRating|review|ratingValue|ratingCount|reviewCount|offers|interactionStatistic|award|founder|employee|worksFor|datePublished|dateCreated|dateModified)"/;
    for (const route of PORTFOLIO_ROUTES) expect(JSON.stringify(getPortfolioMetadata(route)!.graph)).not.toMatch(forbidden);
    expect(getPortfolioMetadata('/frictionlab')!.description).toMatch(/synthetic/);
  });
  it('normalizes root trailing slash/query/hash without accepting workspace or unknown routes', () => {
    expect(getPortfolioMetadata('/frictionlab/?example=synthetic#main')!.canonical).toBe(`${PORTFOLIO_ORIGIN}/frictionlab`);
    for (const path of ['/signaldesk/print/private-id', '/signaldesk/brief/ind-firecrawl', '/frictionlab/foo', '/not-found']) {
      expect(getPortfolioMetadata(path)).toBeNull();
      expect(renderPortfolioHead(path)).toContain('noindex,follow');
      expect(renderPortfolioHead(path)).not.toContain('application/ld+json');
      expect(renderPortfolioHead(path)).not.toContain('canonical');
    }
  });
  it('keeps closing scripts and special characters inert while retaining exact JSON values', () => {
    const hostile = { name: '</script><script>alert("x")</script>\u2028\u2029' };
    const serialized = serializeJsonLd(hostile);
    expect(serialized).not.toContain('<');
    expect(JSON.parse(serialized)).toEqual(hostile);
  });
  it.each(PORTFOLIO_ROUTES)('renders exactly one parsable JSON-LD graph and canonical in initial %s head', route => {
    const head = renderPortfolioHead(route);
    const scripts = [...head.matchAll(/<script[^>]+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)];
    expect(scripts).toHaveLength(1);
    expect(JSON.parse(scripts[0][1])).toEqual(getPortfolioMetadata(route)!.graph);
    expect(head.match(/rel="canonical"/g)).toHaveLength(1);
  });
});
