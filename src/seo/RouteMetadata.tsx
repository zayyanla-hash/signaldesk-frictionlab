import { useLayoutEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { getPortfolioMetadata, serializeJsonLd } from './portfolio';

export default function RouteMetadata() {
  const { pathname } = useLocation();
  useLayoutEffect(() => {
    document.head.querySelectorAll('[data-portfolio-head]').forEach(node => node.remove());
    const metadata = getPortfolioMetadata(pathname);
    if (!metadata) {
      document.title = 'Zayyan Latif — Portfolio projects';
      const robots = document.createElement('meta');
      robots.name = 'robots'; robots.content = 'noindex,follow'; robots.dataset.portfolioHead = '';
      document.head.append(robots);
      return;
    }
    document.title = metadata.title;
    const description = document.createElement('meta');
    description.name = 'description'; description.content = metadata.description;
    const canonical = document.createElement('link');
    canonical.rel = 'canonical'; canonical.href = metadata.canonical;
    const schema = document.createElement('script');
    schema.id = 'portfolio-schema'; schema.type = 'application/ld+json'; schema.textContent = serializeJsonLd(metadata.graph);
    for (const node of [description, canonical, schema]) { node.dataset.portfolioHead = ''; document.head.append(node); }
  }, [pathname]);
  return null;
}
