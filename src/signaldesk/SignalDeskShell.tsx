import { useEffect, type ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { SignalDeskLogo } from './SignalDeskLogo';

const SECTION_TITLES: Record<string, string> = {
  Opportunities: 'Opportunities',
  'Account Brief': 'Account brief',
  'Target and Data': 'Target and data',
};

/**
 * SignalDesk application frame. A quiet light sidebar: wordmark, scenario
 * context, destinations with counts, portfolio link pinned at the bottom.
 */
export function SignalDeskShell({
  recordCount,
  demoNote,
  children,
}: {
  recordCount: number;
  demoNote: ReactNode;
  children: ReactNode;
}) {
  const { pathname } = useLocation();
  const section = pathname.startsWith('/signaldesk/brief')
    ? 'Account Brief'
    : pathname.startsWith('/signaldesk/data')
      ? 'Target and Data'
      : 'Opportunities';
  const nav = [
    { to: '/signaldesk', label: 'Opportunities', end: true, count: recordCount },
    { to: '/signaldesk/brief', label: 'Account Brief', end: false },
    { to: '/signaldesk/data', label: 'Target and Data', end: false },
  ];

  useEffect(() => {
    document.title = `${SECTION_TITLES[section] ?? section} · SignalDesk`;
  }, [section]);

  return (
    <div className="theme-signaldesk sd-root min-h-screen">
      <div className="lg:grid lg:min-h-screen lg:grid-cols-[232px_minmax(0,1fr)]">
        <aside className="sd-sidebar sticky top-0 z-30 flex flex-col lg:h-screen">
          <div className="sd-sidebar-top flex items-center justify-between gap-3 lg:block">
            <NavLink to="/signaldesk" end className="sd-wordmark" aria-label="SignalDesk home">
              <SignalDeskLogo />
              <span className="sd-wordmark-text">SignalDesk</span>
            </NavLink>
            <p className="sd-scenario hidden lg:block">
              Scenario
              <span className="sd-scenario-value">RelayWatch</span>
            </p>
            <NavLink to="/" className="sd-portfolio-link lg:hidden">
              Portfolio
            </NavLink>
          </div>
          <nav aria-label="SignalDesk sections" className="sd-nav lg:flex-col">
            {nav.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.end}
                className={({ isActive }) => `sd-nav-item ${isActive ? 'is-active' : ''}`}
              >
                <span>{n.label}</span>
                {n.count !== undefined && <span className="sd-nav-count">{n.count}</span>}
              </NavLink>
            ))}
          </nav>
          <div className="sd-sidebar-bottom hidden lg:block">
            <NavLink to="/" className="sd-portfolio-link">
              Back to portfolio
            </NavLink>
            <p className="sd-sidebar-note">Local workspace. Edits stay in this browser.</p>
          </div>
        </aside>

        <main id="main" className="min-w-0">
          {section === 'Target and Data' && (
            <header className="sd-page-header">
              <h1 className="sd-page-title">Target and data</h1>
              <p className="sd-page-sub">Scoring weights, exclusion rules, imports and approved exports.</p>
            </header>
          )}
          <div>{children}</div>
          <details className="sd-about mx-5 mb-8 mt-10 lg:mx-10">
            <summary>About this demo</summary>
            <div className="mt-2 max-w-3xl">{demoNote}</div>
          </details>
        </main>
      </div>
    </div>
  );
}
