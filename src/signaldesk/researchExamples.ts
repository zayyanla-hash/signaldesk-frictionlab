import type { Criterion, EvidenceRecord, ResearchAccount, ResearchWorkspace } from './researchModel';

// Independent public research captured 2026-10-14 (America/Los_Angeles).
// Verification means the excerpt was checked against the linked public page,
// not that the company's marketing claims were independently audited.
const RETRIEVED = '2026-10-14';
function source(id: string, criterion: Criterion, claim: string, excerpt: string, sourceUrl: string, sourceTitle: string, publicationDate: string | null = null): EvidenceRecord {
  return { id, criterion, claim, excerpt, sourceUrl, sourceTitle, publicationDate, retrievalDate: RETRIEVED, kind: 'fact', verification: 'verified', stance: 'supports', note: 'Primary public source checked during independent research. Company statements are attributed, not audited.' };
}
const base = { origin: 'independent' as const, review: 'draft' as const, reviewedAt: null, updatedAt: RETRIEVED };
export const EXAMPLE_ACCOUNTS: ResearchAccount[] = [
  {
    ...base, id: 'ind-firecrawl', name: 'Firecrawl', domain: 'firecrawl.dev', sector: 'Developer infrastructure',
    evidence: [
      source('fc-product', 'product', 'Firecrawl provides APIs that turn web content into data for AI applications.', 'Search and scrape the web', 'https://www.ycombinator.com/companies/firecrawl', 'YC · Firecrawl'),
      source('fc-customer', 'customer', 'The Technical BDR role targets engineers, data scientists, and AI/ML leads with web-data needs.', 'engineers, data scientists, and AI/ML leads', 'https://www.ycombinator.com/companies/firecrawl/jobs/HCAiL8y-technical-bdr', 'Firecrawl · Technical BDR'),
      source('fc-us', 'geography', 'Firecrawl lists San Francisco as its company location. Role and work authorization still need individual review.', 'Location:San Francisco', 'https://www.ycombinator.com/companies/firecrawl', 'YC · Firecrawl'),
      source('fc-timing', 'timing', 'Firecrawl announced Alexandria and a Series B on September 22, 2026. This is expansion context, not evidence of buying intent.', 'Introducing Alexandria and our $75M Series B', 'https://www.firecrawl.dev/blog/introducing-alexandria-series-b', 'Firecrawl · Alexandria launch', '2026-09-22'),
      source('fc-access', 'access', 'A public Technical BDR listing provides a route to investigate the commercial team. No application or contact has been made.', 'Technical BDR', 'https://www.ycombinator.com/companies/firecrawl/jobs/HCAiL8y-technical-bdr', 'Firecrawl · Technical BDR'),
      { ...source('fc-need-hyp', 'workflow', 'Hypothesis: expansion across data sources could make prospect qualification and source-level handoffs more complex.', 'official data providers, custom connectors', 'https://www.firecrawl.dev/blog/introducing-alexandria-series-b', 'Firecrawl · Alexandria launch', '2026-09-22'), kind: 'inference', note: 'Analyst hypothesis from product breadth. No evidence that Firecrawl has this internal problem.' },
    ],
    brief: {
      customerHypothesis: 'Engineering and AI teams that need repeatable access to clean web data. A technical champion may lead evaluation; budget ownership needs discovery.',
      problemHypothesis: 'A broader data-source offering may create uneven qualification: a lead can look promising while its extraction, freshness, or permissions requirements remain unclear. This is a hypothesis about a possible workflow, not an observed company problem.',
      questions: 'Which use cases reach value fastest? Where does a technical lead become a qualified opportunity? Who owns the handoff from first demo to deployment? Is this workflow already solved internally?',
      nextStep: 'Build a public-data qualification worksheet for one AI use case: source type, required freshness, output format, validation check, and handoff owner. Validate the worksheet in discovery before proposing a pilot.',
    },
  },
  {
    ...base, id: 'ind-resend', name: 'Resend', domain: 'resend.com', sector: 'Email infrastructure',
    evidence: [
      source('rs-product', 'product', 'Resend markets a developer email platform for transactional and marketing email.', 'Deliver transactional and marketing emails at scale.', 'https://resend.com', 'Resend · Product'),
      source('rs-customer', 'customer', 'Resend positions its API and SDKs for developers; the buyer role and segment concentration remain unconfirmed.', 'SDKs for your favorite programming languages.', 'https://resend.com', 'Resend · Product'),
      source('rs-us', 'geography', 'Resend publishes a San Francisco business address. This establishes company context, not eligibility for every remote role.', 'San Francisco, CA 94114', 'https://resend.com/careers', 'Resend · Careers'),
      source('rs-timing', 'timing', 'Resend currently lists a Technical Account Executive opening for the Americas. Confirm US eligibility and availability on the role page before acting.', 'Technical Account Executive Americas / Remote / Full-time', 'https://resend.com/careers', 'Resend · Careers'),
      source('rs-access', 'access', 'Resend has a public technical sales role page. No relationship or hiring outcome is implied.', 'Technical Account Executive', 'https://resend.com/careers/50cc0eb8-4a93-455d-bcdb-fe8eb080b55d', 'Resend · Technical Account Executive'),
      { ...source('rs-need-hyp', 'workflow', 'Hypothesis: developer-led adoption could require a clear handoff from API activation to a commercial evaluation.', 'Email for developers', 'https://www.ycombinator.com/companies/resend', 'YC · Resend'), kind: 'inference', note: 'No internal activation or conversion data was observed. Do not present this as a diagnosed problem.' },
    ],
    brief: {
      customerHypothesis: 'Developers and engineering teams adopting email infrastructure, with a commercial owner joining when reliability, scale, or support requirements increase. Buying roles require validation.',
      problemHypothesis: 'API usage may be a weak proxy for commercial readiness. The public sales role says enrichment and segmentation already exist. A possible contribution is making evaluation-to-commercial handoff criteria auditable; the effectiveness of current internal processes is unknown.',
      questions: 'What distinguishes a hobby integration from a team evaluation? Which event triggers a sales-assisted motion? How do developer support and sales share account context? Is a US-based commercial role actually open?',
      nextStep: 'Draft an evaluation handoff using only public product requirements: sending use case, volume band, domain setup, deliverability concern, and decision owner. Check the role geography and validate the problem before outreach.',
    },
  },
  {
    ...base, id: 'ind-exa', name: 'Exa', domain: 'exa.ai', sector: 'Search infrastructure',
    evidence: [
      source('ex-product', 'product', 'Exa provides search and content APIs for AI applications and agents.', 'Web search rebuilt for LLMs', 'https://www.ycombinator.com/companies/exa', 'YC · Exa'),
      source('ex-customer', 'customer', 'Exa describes developers bringing internet knowledge into AI applications as a target user.', "bring the world's knowledge into their AI apps", 'https://www.ycombinator.com/companies/exa', 'YC · Exa'),
      source('ex-us', 'geography', 'Exa advertises its Sales Development Representative role in San Francisco, California, on site. Individual eligibility and role fit still require review.', 'Location\nSan Francisco, California', 'https://jobs.ashbyhq.com/exa/dc8a6537-12b4-40af-b8da-55639a01dca3', 'Exa · Sales Development Representative, SF'),
      source('ex-timing', 'timing', 'Exa has a public San Francisco Sales Development Representative listing. An open listing is hiring context, not proof of buying intent.', 'We are hiring a Sales Development Representative', 'https://jobs.ashbyhq.com/exa/dc8a6537-12b4-40af-b8da-55639a01dca3', 'Exa · Sales Development Representative, SF'),
      source('ex-access', 'access', 'A public company careers page lists GTM and operations categories. No contact, application, or relationship is claimed.', 'GTM 8', 'https://exa.ai/careers', 'Exa · Careers'),
      { ...source('ex-need-hyp', 'workflow', 'Hypothesis: technical search evaluations may benefit from a clear handoff between a prospect use case and a reproducible test.', 'Search API', 'https://exa.ai', 'Exa · Product'), kind: 'inference', note: 'A product capability is not evidence of an internal process gap. Validate the proposed workflow in discovery.' },
    ],
    brief: {
      customerHypothesis: 'Developers and AI teams integrating search into agents or applications. A technical evaluator may own the initial test, while business ownership depends on the use case and deployment scale.',
      problemHypothesis: 'A promising search use case may stall if relevance, freshness, and output requirements are not turned into a repeatable evaluation. This is a hypothesis, not an observed failure in Exa’s sales process.',
      questions: 'Which use cases convert from test to production? What does a successful evaluation need to show? Who agrees on relevance and freshness requirements? How is the technical evaluation handed to the commercial owner?',
      nextStep: 'Build a public-data evaluation brief for one AI research use case: queries, expected sources, freshness needs, failure examples, and acceptance criteria. Validate the evaluation workflow before proposing a pilot.',
    },
  },
];
export function exampleWorkspace(): ResearchWorkspace { return structuredClone({ version: 2, accounts: EXAMPLE_ACCOUNTS }); }
