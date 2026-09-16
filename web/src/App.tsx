// Экран целиком. Плоская архитектура: по компоненту на экран, состояние здесь.
//
// Какой экран показывать и куда ведут действия, решает `lib/view`; здесь только
// состояние и краска. Снимок, рамка и разбор — это ДАННЫЕ (`picked`, `aimed`,
// `data`), а не выбор экрана: экран выбирает вид-модель, и она же держит ворота
// по ключу (решение 147).
//
// Камера, кадр и разбор перерисовываются этапами 5-6; пока на их местах прежние
// компоненты, уже переведённые на токены.

import { useEffect, useState } from "react";
import { Calendar } from "./lib/calendar";
import { cameraSupported } from "./lib/camera";
import { parseNaive } from "./lib/civil";
import { OFFLINE_NOTE } from "./lib/offline";
import { analyze as readHere, answer } from "./lib/pipeline";
import { browserStore, canAnswerHere, forget, load, missing, save,
         type Settings } from "./lib/settings";
import { go, start, type Action, type View } from "./lib/view";
import FirstLaunch from "./components/FirstLaunch";
import Home from "./components/Home";
import SettingsScreen from "./components/SettingsScreen";
import KeyHelp from "./components/KeyHelp";
import { GENERAL_RULES } from "./lib/rules.data";
import type { Analysis, GeneralRule } from "./types";
import SignPicker from "./components/SignPicker";
import CameraCapture from "./components/CameraCapture";
import type { Box } from "./lib/crop";
import Reading from "./components/Reading";

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
  // Рамка, наведённая в видоискателе: экран кадрирования начинает с неё.
  const [aimed, setAimed] = useState<Box | undefined>(undefined);
  // Общие правила едут вместе со страницей (шаг 6d): раньше они приходили
  // с сервера, и без него блок исчезал МОЛЧА — ни строки о том, что он был.
  const rules: GeneralRule[] = GENERAL_RULES;
  // Ключ и провайдер. Вспоминается то, что человек разрешил вспомнить.
  const [settings, setSettings] = useState<Settings>(() => load(browserStore()));
  // Какой экран открыт. Начальный выбирается по настройкам: без ключа человеку
  // показывать нечего, кроме приглашения его завести.
  const [view, setView] = useState<View>(() => ({ screen: start(settings) }));
  const [online, setOnline] = useState(
    typeof navigator === "undefined" || navigator.onLine);

  const move = (action: Action) => setView((v) => go(v, action, settings));

  // Съёмку предлагаем, только если браузер её отдаст: `getUserMedia` живёт лишь
  // в защищённом контексте, и по адресу вида `http://192.168.x.x` его нет вовсе.
  const canShoot = cameraSupported(
    typeof navigator === "undefined" ? undefined : navigator.mediaDevices,
    typeof window !== "undefined" && window.isSecureContext,
  );

  // Превью живёт в браузере как blob и снимается при замене: снимок никуда
  // не сохраняется — ни на диск, ни в память страницы дольше нужного.
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

  function changeSettings(next: Settings) {
    setSettings(next);
    save(browserStore(), next);
  }

  /** Снимок выбран в галерее: ничего не отправляется, идём кадрировать. */
  function onPickFile(file: File) {
    setError(null);
    setData(null);
    setAimed(undefined);
    setPicked(file);
    move("pick");
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
        const cal = new Calendar();
        const at = parseNaive(moment || nowLocal());
        const analysis = await readHere(
          { name: cropped.name, data: cropped },
          { ...settings.provider, apiKey: settings.apiKey },
          at, cal);
        setData(answer(analysis, at, cal) as unknown as Analysis);
        setPicked(null);
        move("sent");
      } else {
        // Сюда попасть нельзя: без ключа ни камеры, ни галереи не предлагают.
        // Но если попали — сказать теми же словами, что и настройки.
        throw new Error(`To read a sign the app needs ${missing(settings).join(", ")}.`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  /** Уйти с пути и не оставить за собой ничего. */
  function reset() {
    setPicked(null);
    setAimed(undefined);
    setError(null);
    setData(null);
    setPreview((old) => { if (old) URL.revokeObjectURL(old); return null; });
  }

  const screen = view.screen;

  return (
    <div className="min-h-screen bg-ground-2 py-6">
      <main className="mx-auto flex max-w-2xl flex-col gap-4 px-4">
        {screen === "settings" ? (
          <SettingsScreen
            settings={settings}
            onChange={changeSettings}
            onForget={() => setSettings(forget(browserStore()))}
            onBack={() => move("back")}
            onHelp={() => move("open-help")}
          />
        ) : screen === "help" ? (
          <KeyHelp onBack={() => move("back")} />
        ) : screen === "first-launch" ? (
          <FirstLaunch
            onAddKey={() => move("open-settings")}
            onSettings={() => move("open-settings")}
          />
        ) : screen === "camera" ? (
          <CameraCapture
            onCaptured={(file, box) => {
              setError(null);
              setData(null);
              setAimed(box);
              setPicked(file);
              move("captured");
            }}
            onCancel={() => { reset(); move("back"); }}
            onPick={onPickFile}
          />
        ) : screen === "frame" && picked ? (
          <SignPicker
            file={picked}
            initialBox={aimed}
            busy={busy}
            onSend={onSend}
            onReplace={(file) => { setPicked(file); setAimed(undefined); }}
            onRetake={() => move("replace")}
            onCancel={() => { reset(); move("back"); }}
          />
        ) : screen === "reading" && data ? (
          <Reading
            data={data}
            preview={preview}
            rules={rules}
            onAnother={() => { reset(); move("read-another"); }}
          />
        ) : (
          <Home
            moment={moment}
            onMoment={setMoment}
            cameraAvailable={canShoot}
            offline={!online}
            offlineNote={OFFLINE_NOTE}
            onScan={() => { setError(null); setData(null); move("scan"); }}
            onPick={onPickFile}
            onSettings={() => move("open-settings")}
          />
        )}

        {busy && <p className="text-label text-ink-2">Reading the sign…</p>}

        {error && (
          <p className="rounded-card-sm bg-danger-bg p-4 text-label text-deny">{error}</p>
        )}
      </main>
    </div>
  );
}
