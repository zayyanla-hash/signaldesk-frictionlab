import type React from 'react';
import { Suspense, lazy, useEffect } from 'react';
import { Link, NavLink, Route, Routes } from 'react-router-dom';
import { ArrowRight, Compass } from 'lucide-react';
import ErrorBoundary from './components/ErrorBoundary';
import { SignalDeskLogo } from './signaldesk/SignalDeskLogo';
import { FrictionLabLogo } from './frictionlab/FrictionLabLogo';

// Code-split: each product app (and its own dependency tree) only loads when
// a visitor actually navigates there, so the Home/404 bundle stays small.
const SignalDeskApp = lazy(() => import('./signaldesk/SignalDeskApp'));
const FrictionLabApp = lazy(() => import('./frictionlab/FrictionLabApp'));

const navClass = ({ isActive }: { isActive: boolean }) => (isActive ? 'active' : '');

function RouteFallback() {
  return (
    <div role="status" aria-live="polite" style={{ padding: 32, color: 'var(--muted)', fontSize: 14 }}>
      Loading…
    </div>
  );
}

export default function App() {
  return (
    <>
      <a className="skip-link" href="#main">Skip to main content</a>
      <ErrorBoundary>
        <Suspense fallback={<RouteFallback />}>
          <Routes>
            <Route path="/" element={<PortfolioLayout><Home /></PortfolioLayout>} />
            <Route path="/signaldesk/*" element={<SignalDeskApp />} />
            <Route path="/frictionlab/*" element={<FrictionLabApp />} />
            <Route path="*" element={<PortfolioLayout><NotFound /></PortfolioLayout>} />
          </Routes>
        </Suspense>
      </ErrorBoundary>
    </>
  );
}

function PortfolioLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="portfolio">
      <header className="portfolio-bar">
        <Link to="/" className="portfolio-name">Zayyan Latif</Link>
        <nav aria-label="Portfolio">
          <NavLink to="/" end className={navClass}>Home</NavLink>
          <NavLink to="/signaldesk" className={navClass}>SignalDesk</NavLink>
          <NavLink to="/frictionlab" className={navClass}>FrictionLab</NavLink>
        </nav>
      </header>
      {children}
      <footer className="foot">SignalDesk contains independent public-source research examples; FrictionLab examples are synthetic. Imports stay in this browser. No customer, employment or commercial results are claimed. Built by Zayyan Latif with AI coding assistance.</footer>
    </div>
  );
}

const TARGET_ROLES = ['Startup operations', "Founder's Office", 'Product operations', 'Technical generalist'];

function Home() {
  useEffect(() => {
    document.title = 'Zayyan Latif — SignalDesk and FrictionLab';
  }, []);

  return (
    <main className="page home" id="main" tabIndex={-1}>
      <header className="home-head">
        <p className="home-kicker">Zayyan Latif, operations and product generalist</p>
        <p className="home-roles">
          {TARGET_ROLES.map((role) => (
            <span className="chip" key={role}>{role}</span>
          ))}
        </p>
        <p style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <a className="btn small" href="https://www.linkedin.com/in/zayyanmlatif/" target="_blank" rel="noopener noreferrer">LinkedIn</a>
          <a className="btn small" href="https://github.com/zayyanla-hash" target="_blank" rel="noopener noreferrer">GitHub</a>
        </p>
        <h1>SignalDesk and FrictionLab</h1>
        <p>
          Two working tools for making a decision traceable: research an account from cited evidence, or inspect a funnel and design a measurable experiment. Both open on labeled examples, with no sign-in or paid API needed. I defined the product framing, evidence standards and review workflows, and built them with AI coding assistance.
        </p>
      </header>

      <section className="project" aria-labelledby="home-sd">
        <div className="project-text">
          <h2 id="home-sd"><Link to="/signaldesk">SignalDesk</Link></h2>
          <p>A research ledger that turns public evidence into explained account qualification and a cited analyst brief.</p>
          <dl className="facts">
            <dt>Data</dt>
            <dd>Three independent public-source examples: Firecrawl, Resend and Exa. Each claim records its source, excerpt, dates and review status. <span className="badge blue">Researched examples</span></dd>
            <dt>Worth trying</dt>
            <dd>Inspect the six-question qualification and its unknowns, add a source through assisted import, then review and export a cited brief.</dd>
            <dt>Honest limits</dt>
            <dd>Qualification is a research-readiness heuristic, not buying intent or job-fit probability. Source checking is manual; a URL alone does not fetch a page.</dd>
          </dl>
          <Link className="btn primary" to="/signaldesk">Open SignalDesk<ArrowRight className="icon sm" aria-hidden="true" /></Link>
        </div>
        <div className="project-shot" aria-hidden="true">
          <div className="shot-brand">
            <SignalDeskLogo />
            <span>SignalDesk</span>
          </div>
          <div className="shot-stats">
            <span className="chip">3 independent research examples</span>
            <span className="chip">Cited evidence records</span>
            <span className="chip">6-question qualification</span>
          </div>
        </div>
      </section>

      <section className="project" aria-labelledby="home-fl">
        <div className="project-text">
          <h2 id="home-fl"><Link to="/frictionlab">FrictionLab</Link></h2>
          <p>Funnel analysis and experiment design, from a declared data grain and window to an exportable decision brief.</p>
          <dl className="facts">
            <dt>Data</dt>
            <dd>Clearly labeled synthetic aggregate and user-event fixtures. Validated CSV imports replace the example and declare their own grain, cohort and observation window. <span className="badge blue">Synthetic sample</span></dd>
            <dt>Worth trying</dt>
            <dd>Import the eight-user fixture, inspect its mature-cohort exclusions and stage denominators, then draft a test and export a one-page brief.</dd>
            <dt>Honest limits</dt>
            <dd>Independent event or user counts do not establish cohort conversion. An observed drop does not explain why it happened; proposed upside is hypothetical.</dd>
          </dl>
          <Link className="btn primary" to="/frictionlab">Open FrictionLab<ArrowRight className="icon sm" aria-hidden="true" /></Link>
        </div>
        <div className="project-shot" aria-hidden="true">
          <div className="shot-brand">
            <FrictionLabLogo />
            <span>FrictionLab</span>
          </div>
          <div className="shot-stats">
            <span className="chip">Explicit data grain</span>
            <span className="chip">Inspectable denominators</span>
            <span className="chip">Measurable experiment brief</span>
          </div>
        </div>
      </section>

      <p className="home-note">
        Both tools run locally in the browser. No backend, live research fetch, paid API or model-generated metrics are required. Imported data and drafts stay on this device; use synthetic or de-identified data for this work sample.
      </p>
    </main>
  );
}

function NotFound() {
  return (
    <main className="page" id="main">
      <div className="card" role="alert">
        <Compass className="icon" aria-hidden="true" />
        <h1>Page not found</h1>
        <p className="muted">That address does not exist in this portfolio.</p>
        <p><Link className="btn small primary" to="/">Back to home</Link></p>
      </div>
    </main>
  );
}
