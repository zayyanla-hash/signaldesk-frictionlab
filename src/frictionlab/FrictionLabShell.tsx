import { type ReactNode } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { ACTIVATION_WINDOW_DAYS, SNAPSHOT_ISO } from './types';
import { FrictionLabLogo } from './FrictionLabLogo';

interface FrictionLabShellProps {
  /** Count of evidence themes not yet marked reviewed; shown as a small nav badge. */
  needsReviewCount: number;
  children: ReactNode;
}

const NAV_ITEMS: Array<{ to: string; label: string; fullLabel: string; end: boolean }> = [
  { to: '/frictionlab', label: 'Funnel', fullLabel: 'Funnel', end: true },
  { to: '/frictionlab/evidence', label: 'Evidence', fullLabel: 'Evidence', end: false },
  { to: '/frictionlab/decision', label: 'Decision', fullLabel: 'Decision and Handoff', end: false },
];

function NavLinks({ needsReviewCount }: { needsReviewCount: number }) {
  return (
    <>
      {NAV_ITEMS.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          aria-label={item.fullLabel}
          className={({ isActive }) => `fl-nav-link${isActive ? ' fl-nav-link-active' : ''}`}
        >
          <span className="fl-nav-link-label">{item.label}</span>
          {item.label === 'Evidence' && needsReviewCount > 0 && (
            <span className="fl-nav-badge">{needsReviewCount}</span>
          )}
        </NavLink>
      ))}
    </>
  );
}

/**
 * Product shell for FrictionLab: a light Mercury-style sidebar on desktop
 * (product mark, nav pills, Portfolio link pinned at the bottom) collapsing
 * to a top bar with horizontally scrollable nav on narrow screens. Each
 * route supplies its own page content. A quiet "About this demo" disclosure
 * sits beneath the content on every route.
 */
export default function FrictionLabShell({ needsReviewCount, children }: FrictionLabShellProps) {
  return (
    <div className="fl-root theme-frictionlab flex min-h-screen flex-col min-[900px]:flex-row">
      {/* Desktop sidebar */}
      <aside className="fl-sidebar hidden min-[900px]:flex">
        <div className="fl-sidebar-brand">
          <FrictionLabLogo />
          <span className="fl-sidebar-brand-name">FrictionLab</span>
        </div>
        <nav aria-label="FrictionLab sections" className="fl-sidebar-nav">
          <NavLinks needsReviewCount={needsReviewCount} />
        </nav>
        <div className="fl-sidebar-footer">
          <Link to="/" className="fl-sidebar-portfolio-link">
            Portfolio
          </Link>
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="fl-topbar flex h-[52px] shrink-0 items-center gap-3 px-4 min-[900px]:hidden">
        <span className="flex shrink-0 items-center gap-2.5">
          <FrictionLabLogo />
          <span className="fl-topbar-brand-name">FrictionLab</span>
        </span>
        <div className="fl-topbar-nav-scroll">
          <nav aria-label="FrictionLab sections" className="fl-topbar-nav">
            <NavLinks needsReviewCount={needsReviewCount} />
          </nav>
        </div>
      </header>

      <div className="fl-shell-main flex flex-1 flex-col min-w-0">
        {children}
        <footer className="fl-demo-footer px-4 py-3 min-[900px]:px-6">
          <details>
            <summary>About this demo</summary>
            <p className="fl-demo-note-text">
              Deterministic funnel math, quarantined records, editable evidence themes, and reviewed handoff.{' '}
              Seeded generator, fixed snapshot {SNAPSHOT_ISO}, {ACTIVATION_WINDOW_DAYS}-day window. No real users.
              Imported rows are labeled user-provided and unverified.
            </p>
          </details>
        </footer>
      </div>
    </div>
  );
}
