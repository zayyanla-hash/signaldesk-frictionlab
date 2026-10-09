import { Component, type ReactNode } from 'react';
import { clearAppStorage } from '../lib/storage';

interface Props {
  children: ReactNode;
}

interface State {
  error: string | null;
}

/** Last-resort recovery: a broken render never leaves a blank page. */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(e: unknown): State {
    return { error: e instanceof Error ? e.message : 'Unknown render error.' };
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <main className="page" id="main">
        <div className="card" role="alert">
          <h1>Something went wrong rendering this view</h1>
          <p className="muted">The error was: {this.state.error}</p>
          <p className="muted">Your imported edits are stored only in this browser. Resetting restores the built-in sample data.</p>
          <div className="toolbar">
            <button
              className="btn primary"
              onClick={() => {
                clearAppStorage();
                window.location.assign('/');
              }}
            >
              Reset demo data and go home
            </button>
            <button className="btn" onClick={() => this.setState({ error: null })}>
              Try again without resetting
            </button>
          </div>
        </div>
      </main>
    );
  }
}
