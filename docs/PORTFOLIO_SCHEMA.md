# Portfolio structured data

The public identity is **Zayyan Latif’s independent portfolio projects**, built with AI coding assistance. The JSON-LD describes the tools, never a visitor’s imported data, research accounts, saved draft or experiment results.

## Page contract

| Public route | Main page type | Main entity |
| --- | --- | --- |
| `/` | `CollectionPage` | `ItemList` containing SignalDesk and FrictionLab |
| `/signaldesk` | `WebPage` | SignalDesk `WebApplication` |
| `/frictionlab` | `WebPage` | FrictionLab `WebApplication` |

Each graph includes one `Person` named Zayyan Latif and one `WebSite`. Applications link to the person through `creator`; the pages use `author`, and the site uses `publisher`. `creditText` preserves the visible AI coding assistance credit. App descriptions explicitly identify independent portfolio projects and their example-data limits. Feature lists describe implemented functions. `isAccessibleForFree` refers to access to the current browser tools; it does not describe a commercial offer.

No ratings, reviews, user/download counts, customers, revenue, awards, employer/client relationships, publication dates, offer prices or unsupported credentials are generated. Synthetic funnel counts are not app usage statistics. The public research examples are not clients or endorsements.

## Rendering and routing

`src/seo/portfolio.ts` is the single source of facts, stable IDs and canonical URLs. Canonicals use the existing primary portfolio deployment rather than whichever preview/local host is viewing a page. Update `PORTFOLIO_ORIGIN` deliberately if the canonical deployment changes.

The production build emits metadata in the initial HTML: `index.html`, `signaldesk.html`, and `frictionlab.html`. The Vercel root rewrites and Netlify redirects select the right document. `app.html` is a neutral shell with no JSON-LD or canonical and `noindex,follow` for workspace, print and unknown routes. This is an indexing instruction, not an access-control mechanism.

`RouteMetadata` replaces owned tags on client navigation, leaving exactly one graph and canonical on a public root and removing them on deeper routes. It does not access browser storage. The serializer escapes closing script text. No executable inline JavaScript or weaker CSP is required.

The local production fixture mirrors these routes. Development inserts metadata through the same route component; the initial static HTML is a production-build feature.

## Reproduce validation

1. Run `npm test`, `npm run lint`, and `npm run build`.
2. Run `node scripts/serve-dist.mjs --port 4393 --serve-only` and the combined browser suite. Its schema checks cover initial HTML, browser graph lifecycle, canonical consistency, neutral deeper routes and CSP health.
3. Submit each built root HTML file through **Code snippet** at [Schema.org Validator](https://validator.schema.org/). Use actual built HTML so the initial document is tested. The three graphs were accepted with zero errors and zero warnings during implementation; final release evidence records the exact built files tested.
4. After deployment, fetch all three public URLs and compare their schema to the verified build. Check `/signaldesk/data`, `/signaldesk/print/ind-firecrawl`, and an unknown route for neutral initial metadata. Navigate Home → each app → Home and confirm one current graph with no stale page entity.

Schema.org validity is different from Google rich-result eligibility. Google’s software app rich results require an offer price and a rating or review. These work samples have no eligible rating/review evidence; do not invent it to remove a Rich Results Test eligibility message. This implementation makes no rich-result, indexing or ranking promise.

Primary references: [Schema.org WebApplication](https://schema.org/WebApplication), [CollectionPage](https://schema.org/CollectionPage), [creator](https://schema.org/creator), [Google structured-data policies](https://developers.google.com/search/docs/appearance/structured-data/sd-policies), [Google software app eligibility](https://developers.google.com/search/docs/appearance/structured-data/software-app).
