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
      <footer className="foot">SignalDesk mixes researched documentation examples with a labeled synthetic sample; FrictionLab data is synthetic unless you import your own. No real customers, no live services required. Built by Zayyan Latif.</footer>
    </div>
  );
}

const TARGET_ROLES = ['Startup operations', "Founder's Office", 'Product operations', 'Technical generalist'];

function Home() {
  useEffect(() => {
    document.title = 'Zayyan Latif — SignalDesk and FrictionLab';
  }, []);

  return (
    <main className="page home" id="main">
      <header className="home-head">
        <p className="home-kicker">Zayyan Latif, operations and product generalist</p>
        <p className="home-roles">
          {TARGET_ROLES.map((role) => (
            <span className="chip" key={role}>{role}</span>
          ))}
        </p>
        {/* TODO(owner): add GitHub, LinkedIn, and resume links here once ready. */}
        <h1>SignalDesk and FrictionLab</h1>
        <p>
          Two small working tools I built around problems I keep running into on GTM and product teams: deciding which accounts
          are worth a closer look, and figuring out why new signups stall before they get value. Both open on example data,
          so there is nothing to set up.
        </p>
      </header>

      <section className="project" aria-labelledby="home-sd">
        <div className="project-text">
          <h2 id="home-sd"><Link to="/signaldesk">SignalDesk</Link></h2>
          <p>Evidence-backed GTM account prioritization and finished account briefs for RelayWatch, a fictional integration-monitoring product.</p>
          <dl className="facts">
            <dt>Data</dt>
            <dd>Twelve webhook vendors researched from their public docs, each with the source URL and retrieval date. A synthetic sample sits behind a switch. <span className="badge blue">Researched examples</span></dd>
            <dt>Worth trying</dt>
            <dd>Change the scoring weights in Target and Data and watch the ranking move, then approve a brief and download it.</dd>
            <dt>Honest limits</dt>
            <dd>Sources show what a company has built, not that it wants to buy anything. Scores are heuristics.</dd>
          </dl>
          <Link className="btn primary" to="/signaldesk">Open SignalDesk<ArrowRight className="icon sm" aria-hidden="true" /></Link>
        </div>
        <div className="project-shot" aria-hidden="true">
          <div className="shot-brand">
            <SignalDeskLogo />
            <span>SignalDesk</span>
          </div>
          <div className="shot-stats">
            <span className="chip">12 researched vendors</span>
            <span className="chip">20 synthetic accounts</span>
            <span className="chip">6-capability fit research</span>
          </div>
        </div>
      </section>

      <section className="project" aria-labelledby="home-fl">
        <div className="project-text">
          <h2 id="home-fl"><Link to="/frictionlab">FrictionLab</Link></h2>
          <p>Onboarding-funnel diagnostics, evidence-linked feedback, and reviewed issue handoff.</p>
          <dl className="facts">
            <dt>Data</dt>
            <dd>A seeded generator with a fixed snapshot on 2025-04-15 UTC, so the numbers are the same every time. <span className="badge blue">Synthetic sample</span></dd>
            <dt>Worth trying</dt>
            <dd>Paste a broken events CSV and see which rows get quarantined and why, then edit a feedback theme and notice the approval reset.</dd>
            <dt>Honest limits</dt>
            <dd>A funnel drop next to a few complaints is a lead, not a cause. The GitHub handoff in the public demo is a mock.</dd>
          </dl>
          <Link className="btn primary" to="/frictionlab">Open FrictionLab<ArrowRight className="icon sm" aria-hidden="true" /></Link>
        </div>
        <div className="project-shot" aria-hidden="true">
          <div className="shot-brand">
            <FrictionLabLogo />
            <span>FrictionLab</span>
          </div>
          <div className="shot-stats">
            <span className="chip">Seeded synthetic funnel</span>
            <span className="chip">7-day activation window</span>
            <span className="chip">Evidence-linked feedback</span>
          </div>
        </div>
      </section>

      <p className="home-note">
        Everything runs in the browser. There is no backend or account, and anything you import or edit stays on this device.
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
