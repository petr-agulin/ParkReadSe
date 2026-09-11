// Экран целиком. Плоская архитектура: по компоненту на блок, состояние здесь.

import { useEffect, useState } from "react";
import { analyze } from "./api";
import { Calendar } from "./lib/calendar";
import { parseNaive } from "./lib/civil";
import { analyze as readHere, answer } from "./lib/pipeline";
import { browserStore, canAnswerHere, forget, load, save,
         type Settings } from "./lib/settings";
import KeyPanel from "./components/KeyPanel";
import { GENERAL_RULES } from "./lib/rules.data";
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
const EXPECTED_CONTRACT = 7;

/** Сейчас по часам устройства, в том же виде, что даёт поле выбора момента. */
function nowLocal(): string {
  const t = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`
       + `T${pad(t.getHours())}:${pad(t.getMinutes())}`;
}


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
  // Общие правила едут вместе со страницей (шаг 6d): раньше они приходили
  // с сервера, и без него блок исчезал МОЛЧА — ни строки о том, что он был.
  const rules: GeneralRule[] = GENERAL_RULES;
  // Ключ и провайдер. Вспоминается то, что человек разрешил вспомнить.
  const [settings, setSettings] = useState<Settings>(() => load(browserStore()));
  // Кто отвечает. Браузер — когда есть чем; питон остаётся доступен, пока
  // не переехал замер (шаг 7), и на нём же работает демо-режим без ключа.
  const [here, setHere] = useState(true);

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

  function changeSettings(next: Settings) {
    setSettings(next);
    save(browserStore(), next);
  }

  // Наружу уходит только вырезанное, и в разборе показывается оно же — иначе
  // человек сверял бы ответ с картинкой, которой модель не видела.
  async function onSend(cropped: File) {
    setBusy(true);
    setError(null);
    setData(null);
    setPreview((old) => { if (old) URL.revokeObjectURL(old); return URL.createObjectURL(cropped); });
    try {
      const browser = here && canAnswerHere(settings);
      if (browser) {
        // Снимок не покидает устройство иначе как к провайдеру: своего сервера
        // у приложения нет, и разбор считается здесь же.
        const cal = new Calendar();
        const at = parseNaive(moment || nowLocal());
        const analysis = await readHere(
          { name: cropped.name, data: cropped },
          { ...settings.provider, apiKey: settings.apiKey },
          at, cal);
        setData(answer(analysis, at, cal) as unknown as Analysis);
      } else {
        setData(await analyze(cropped, moment || undefined));
      }
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

        {/* Ключ показывается на начальном экране, а не поверх разбора: он нужен
            до отправки, а после ответа только мешал бы читать. */}
        {!camera && !picked && !data && (
          <KeyPanel
            settings={settings}
            onChange={changeSettings}
            onForget={() => setSettings(forget(browserStore()))}
          />
        )}

        {/* Переключатель — для проверки, а не для человека у знака: питон остаётся
            доступен, пока не переехал замер (шаг 7), и на нём работает демо-режим
            без ключа. Показывается только там, где выбор вообще есть. */}
        {!camera && !picked && !data && canAnswerHere(settings) && (
          <label className="flex items-center gap-2 text-[12px] text-ink-3">
            <input type="checkbox" checked={here} onChange={(e) => setHere(e.target.checked)} />
            Read on this device (uncheck to use the local server instead)
          </label>
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

            {/* Участок подписывается там, где он различает: окон на знаке несколько
                И участки у них разные, или стрелка увела стоянку от самого знака.
                Раньше здесь стояло «окон больше одного», и знак, поделённый
                не стрелкой, а адресатом, получал два одинаковых «Here at the sign». */}
            {data.regimes.map((r, i) => (
              <PeriodTimeline
                key={i}
                regime={r}
                showExtent={new Set(data.regimes.map((x) => x.extent)).size > 1
                            || r.extent !== "here"}
              />
            ))}
          </ErrorBoundary>
        )}
      </main>
    </div>
  );
}
