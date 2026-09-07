// Экран целиком. Плоская архитектура: по компоненту на блок, состояние здесь.

import { useEffect, useState } from "react";
import { analyze, generalRules } from "./api";
import type { Analysis, GeneralRule } from "./types";
import PhotoInput from "./components/PhotoInput";
import WhatWeSaw from "./components/WhatWeSaw";
import WhoCanPark from "./components/WhoCanPark";
import PeriodTimeline from "./components/PeriodTimeline";
import ErrorBoundary from "./components/ErrorBoundary";

// Растёт вместе с CONTRACT в parkread/present.py. Сборка и сервер расходятся легко:
// страница обновляется из dist сразу, а процесс server.py живёт с прежним кодом,
// пока его не перезапустят. Молчать об этом нельзя — блоки просто окажутся пустыми.
const EXPECTED_CONTRACT = 2;

export default function App() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<Analysis | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [moment, setMoment] = useState("");
  const [rules, setRules] = useState<GeneralRule[]>([]);

  useEffect(() => {
    generalRules().then(setRules).catch(() => setRules([]));
  }, []);

  // Превью живёт в браузере как blob и снимается при замене: снимок никуда
  // не сохраняется — ни на диск сервера, ни в память страницы дольше нужного.
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  async function onPick(file: File) {
    setBusy(true);
    setError(null);
    setData(null);
    setPreview((old) => { if (old) URL.revokeObjectURL(old); return URL.createObjectURL(file); });
    try {
      setData(await analyze(file, moment || undefined));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-100 py-6">
      <main className="mx-auto flex max-w-2xl flex-col gap-4 px-4">
        <header>
          <h1 className="text-xl font-semibold text-slate-900">ParkRead</h1>
          <p className="text-sm text-slate-600">
            What a Swedish parking sign states — read plate by plate.
          </p>
        </header>

        <PhotoInput busy={busy} onPick={onPick} moment={moment} onMoment={setMoment} />

        {error && (
          <p className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">
            {error}
          </p>
        )}

        {data && data.contract !== EXPECTED_CONTRACT && (
          <p className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
            The server is running older code than this page
            (contract {String(data.contract ?? "unknown")}, expected {EXPECTED_CONTRACT}).
            Restart <code className="rounded bg-amber-100 px-1">server.py</code> — parts of
            the answer below will be missing until you do.
          </p>
        )}

        {data && (
          <ErrorBoundary>
            <WhatWeSaw data={data} preview={preview} rules={rules} />

            {/* Формулировка приходит из ответа, а не живёт в вёрстке: место
                для слов о знаке — рядом с остальными, в `present.py`. Здесь
                же она однажды разошлась бы со справочником и никто бы
                не заметил. */}
            {data.has_answer && data.note && (
              <p className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-700">
                {data.note.text}
              </p>
            )}

            <WhoCanPark regimes={data.regimes} />

            {data.regimes.map((r, i) => (
              <PeriodTimeline key={i} regime={r} showExtent={data.regimes.length > 1 || r.extent !== "here"} />
            ))}
          </ErrorBoundary>
        )}
      </main>
    </div>
  );
}
