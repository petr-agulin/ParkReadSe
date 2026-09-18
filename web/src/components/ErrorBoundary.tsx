// An empty screen is the worst answer there is: the person knows neither what
// happened nor what to do next. Without this boundary any drawing error put the whole
// page out, and silently (found in trials: an old backend process returned an answer
// without the new fields, and the interface simply vanished).

import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = { children: ReactNode };
type State = { error: Error | null };

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("ParkRead: failed to draw the answer", error, info);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="rounded-xl border border-danger-line bg-danger-bg p-4 text-sm text-deny">
        <p className="font-medium">The page could not display this answer.</p>
        <p className="mt-1">
          A reload is usually enough: the page may have been opened from a copy
          saved before the last update.
        </p>
        <pre className="mt-2 overflow-x-auto rounded bg-danger-bg p-2 text-xs">
          {error.message}
        </pre>
        <button
          type="button"
          onClick={() => this.setState({ error: null })}
          className="mt-2 rounded-md bg-deny px-3 py-1 text-xs text-on-dark hover:bg-deny"
        >
          try again
        </button>
      </div>
    );
  }
}
