// The whole screen. A flat architecture: one component per screen, and the state
// here.
//
// Which screen to show, and where the actions lead, is decided by `lib/view`; here
// there is only state and paint. The photograph, the frame and the reading are DATA
// (`picked`, `aimed`, `data`) rather than a choice of screen: the screen is chosen by
// the view-model, and the same model keeps the gate on the key (decision 147).

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

/** Now by the device's clock, in the same shape the moment field gives. */
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
  // The frame aimed in the viewfinder: the cropping screen starts from it.
  const [aimed, setAimed] = useState<Box | undefined>(undefined);
  // The general rules travel with the page (step 6d): they used to arrive from a
  // server, and without one the block vanished IN SILENCE — not a line to say it had
  // ever been there.
  const rules: GeneralRule[] = GENERAL_RULES;
  // The key and the provider. What the person allowed to be remembered is remembered.
  const [settings, setSettings] = useState<Settings>(() => load(browserStore()));
  // Which screen is open. The first one is chosen by the settings: with no key there
  // is nothing to show a person but the invitation to get one.
  const [view, setView] = useState<View>(() => ({ screen: start(settings) }));
  const [online, setOnline] = useState(
    typeof navigator === "undefined" || navigator.onLine);

  const move = (action: Action) => setView((v) => go(v, action, settings));

  // Shooting is offered only if the browser will give it: `getUserMedia` lives in a
  // secure context alone, and at an address of the form `http://192.168.x.x` it is
  // not there at all.
  const canShoot = cameraSupported(
    typeof navigator === "undefined" ? undefined : navigator.mediaDevices,
    typeof window !== "undefined" && window.isSecureContext,
  );

  // The preview lives in the browser as a blob and is taken down when replaced: the
  // photograph is saved nowhere — neither to disk nor in the page's memory for longer
  // than it is needed.
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

  /** A photograph was chosen in the gallery: nothing is sent, we go and crop it. */
  function onPickFile(file: File) {
    setError(null);
    setData(null);
    setAimed(undefined);
    setPicked(file);
    move("pick");
  }

  // Only what was cropped goes outward, and the reading shows that same thing —
  // otherwise a person would be checking the answer against a picture the model never
  // saw.
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
        // There is no getting here: with no key neither camera nor gallery is
        // offered. But if we did get here — say it in the same words as the settings.
        throw new Error(`To read a sign the app needs ${missing(settings).join(", ")}.`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  /** Leave the path, and leave nothing behind. */
  function reset() {
    setPicked(null);
    setAimed(undefined);
    setError(null);
    setData(null);
    setPreview((old) => { if (old) URL.revokeObjectURL(old); return null; });
  }

  const screen = view.screen;

  return (
    // The window is measured here and only here, in `svh` — the smallest height it
    // has, the one with the address bar shown. `vh` would be counted as though the
    // bar were not there, and the page would come out exactly its height longer than
    // the window: everything fits, and there is a scrollbar all the same. `dvh`
    // changes as you go, and stops fitting the second the bar slides out. Screens do
    // not measure their own height — they take this one.
    <div className="flex min-h-[100svh] flex-col bg-ground-2 py-6">
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 px-4">
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
            onAnother={() => { reset(); move("scan-another"); }}
            onBack={() => { reset(); move("scan-another"); }}
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

        {error && (
          <p className="rounded-card-sm bg-danger-bg p-4 text-label text-deny">{error}</p>
        )}
      </main>
    </div>
  );
}
