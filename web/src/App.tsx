// Экран целиком. Плоская архитектура: по компоненту на блок, состояние здесь.

import { useEffect, useState } from "react";
import { analyze, generalRules } from "./api";
import type { Analysis, GeneralRule } from "./types";
import PhotoInput from "./components/PhotoInput";
import SignPicker from "./components/SignPicker";
import CameraCapture from "./components/CameraCapture";
import type { Box } from "./lib/crop";
import WhatWeSaw from "./components/WhatWeSaw";
import WhoCanPark from "./components/WhoCanPark";
import PeriodTimeline from "./components/PeriodTimeline";
import ErrorBoundary from "./components/ErrorBoundary";

// Растёт вместе с CONTRACT в parkread/present.py. Сборка и сервер расходятся легко:
// страница обновляется из dist сразу, а процесс server.py живёт с прежним кодом,
// пока его не перезапустят. Молчать об этом нельзя — блоки просто окажутся пустыми.
const EXPECTED_CONTRACT = 6;

export default function App() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<Analysis | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [moment, setMoment] = useState("");
  const [picked, setPicked] = useState<File | null>(null);
  // Рамка, наведённая в видоискателе: экран выбора начинает с неё, а не с центра.
  const [aimed, setAimed] = useState<Box | undefined>(undefined);
  const [camera, setCamera] = useState(false);
  const [source, setSource] = useState<"camera" | "file">("file");
  const [rules, setRules] = useState<GeneralRule[]>([]);

  useEffect(() => {
    generalRules().then(setRules).catch(() => setRules([]));
  }, []);

  // Превью живёт в браузере как blob и снимается при замене: снимок никуда
  // не сохраняется — ни на диск сервера, ни в память страницы дольше нужного.
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  // Выбор файла ничего не отправляет: снимок идёт на экран выбора знака.
  function onPick(file: File) {
    setError(null);
    setData(null);
    setAimed(undefined);
    setSource("file");
    setPicked(file);
  }

  // Наружу уходит только вырезанное, и в разборе показывается оно же — иначе
  // человек сверял бы ответ с картинкой, которой модель не видела.
  async function onSend(cropped: File) {
    setBusy(true);
    setError(null);
    setData(null);
    setPreview((old) => { if (old) URL.revokeObjectURL(old); return URL.createObjectURL(cropped); });
    try {
      setData(await analyze(cropped, moment || undefined));
      setPicked(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  // Отмена возвращает на начало и не оставляет за собой ничего.
  function reset() {
    setPicked(null);
    setAimed(undefined);
    setCamera(false);
    setError(null);
    setData(null);
    setPreview((old) => { if (old) URL.revokeObjectURL(old); return null; });
  }

  return (
    <div className="min-h-screen bg-slate-100 py-6">
      <main className="mx-auto flex max-w-2xl flex-col gap-4 px-4">
        {/* Подпись под названием уходит, пока открыт снимок или камера: эти
            строки стоят высоты, а высота — ширины снимка. На начальном экране
            она возвращается. */}
        <header>
          <h1 className="text-xl font-semibold text-slate-900">ParkRead</h1>
          {!picked && !camera && (
            <p className="text-sm text-slate-600">
              What a Swedish parking sign states — read plate by plate.
            </p>
          )}
        </header>

        {picked ? (
          <SignPicker
            file={picked}
            initialBox={aimed}
            source={source}
            busy={busy}
            onSend={onSend}
            onReplace={onPick}
            onRetake={() => { setPicked(null); setAimed(undefined); setCamera(true); }}
            onCancel={reset}
          />
        ) : camera ? (
          <CameraCapture
            onCaptured={(file, box) => {
              setError(null);
              setData(null);
              setAimed(box);
              setSource("camera");
              setPicked(file);
              setCamera(false);
            }}
            onCancel={() => setCamera(false)}
          />
        ) : (
          <PhotoInput
            busy={busy}
            onPick={onPick}
            onCamera={() => { setError(null); setData(null); setCamera(true); }}
            moment={moment}
            onMoment={setMoment}
          />
        )}

        {busy && <p className="text-[13px] text-ink-2">Reading the sign…</p>}

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
