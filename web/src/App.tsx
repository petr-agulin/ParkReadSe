// Экран целиком. Плоская архитектура: по компоненту на блок, состояние здесь.

import { useEffect, useState } from "react";
import { Calendar } from "./lib/calendar";
import { parseNaive } from "./lib/civil";
import { OFFLINE_NOTE } from "./lib/offline";
import { analyze as readHere, answer } from "./lib/pipeline";
import { browserStore, canAnswerHere, forget, load, missing, save,
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
  // Есть ли сеть. Открыть приложение и посмотреть справочник можно без неё,
  // прочитать знак — нет, и сказать об этом надо до отправки, а не после.
  const [online, setOnline] = useState(
    typeof navigator === "undefined" || navigator.onLine);

  // Превью живёт в браузере как blob и снимается при замене: снимок никуда
  // не сохраняется — ни на диск сервера, ни в память страницы дольше нужного.
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  useEffect(() => {
    const change = () => setOnline(navigator.onLine);
    window.addEventListener("online", change);
    window.addEventListener("offline", change);
    return () => {
      window.removeEventListener("online", change);
      window.removeEventListener("offline", change);
    };
  }, []);

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
      if (canAnswerHere(settings)) {
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
        // Сказать, чего не хватает, теми же словами, что и панель ключа: молчаливая
        // неудача здесь однажды уже выглядела как «приложение работает без ключа».
        throw new Error(`To read a sign the app needs ${missing(settings).join(", ")}.`);
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
    <div className="min-h-screen bg-ground-2 py-6">
      <main className="mx-auto flex max-w-2xl flex-col gap-4 px-4">
        {/* Подпись под названием уходит, пока открыт снимок или камера: эти
            строки стоят высоты, а высота — ширины снимка. На начальном экране
            она возвращается. */}
        <header>
          <h1 className="text-xl font-semibold text-ink">ParkRead</h1>
          {!picked && !camera && (
            <p className="text-sm text-ink-2">
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

        {/* Сеть нужна ровно одному действию — чтению знака. Сказано до отправки:
            узнать об этом из ошибки после выбора кадра — значит узнать поздно. */}
        {!online && (
          <p className="rounded-xl border border-line bg-ground p-4 text-sm text-ink-2">
            {OFFLINE_NOTE}
          </p>
        )}

        {busy && <p className="text-[13px] text-ink-2">Reading the sign…</p>}

        {error && (
          <p className="rounded-xl border border-danger-line bg-danger-bg p-4 text-sm text-deny">
            {error}
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
              <p className="rounded-xl border border-line bg-ground p-4 text-sm text-ink-2">
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
