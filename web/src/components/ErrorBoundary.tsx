// Пустой экран — худший из возможных ответов: человек не знает ни что случилось,
// ни что делать дальше. Без этой границы любая ошибка отрисовки гасила страницу
// целиком и молча (найдено на обкатке: старый процесс бэкенда отдавал ответ без
// новых полей, и интерфейс просто исчез).

import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = { children: ReactNode };
type State = { error: Error | null };

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("ParkRead: ошибка отрисовки", error, info);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">
        <p className="font-medium">The page could not display this answer.</p>
        <p className="mt-1">
          A reload is usually enough: the page may have been opened from a copy
          saved before the last update.
        </p>
        <pre className="mt-2 overflow-x-auto rounded bg-rose-100 p-2 text-xs">
          {error.message}
        </pre>
        <button
          type="button"
          onClick={() => this.setState({ error: null })}
          className="mt-2 rounded-md bg-rose-800 px-3 py-1 text-xs text-white hover:bg-rose-700"
        >
          try again
        </button>
      </div>
    );
  }
}
