// The whole screen. A flat architecture: one component per screen, and the state
// here.
//
// Which screen to show, and where the actions lead, is decided by `lib/view`; here
// there is only state and paint. The photograph, the frame and the reading are DATA
// (`picked`, `aimed`, `data`) rather than a choice of screen: the screen is chosen by
// the view-model, and the same model keeps the gate on the key (decision 147).

import { useEffect, useRef, useState } from "react";
import { Calendar } from "./lib/calendar";
import { cameraSupported } from "./lib/camera";
import { parseNaive } from "./lib/civil";
import { OFFLINE_NOTE } from "./lib/offline";
import { analyze as readHere, answer, type Progress } from "./lib/pipeline";
import { explain, progressLine, type Trouble } from "./lib/trouble";
import { VisionCallFailed } from "./lib/vision";
import { browserStore, canAnswerHere, forget, load, missing, save,
         type Settings } from "./lib/settings";
import { go, start, type Action, type View } from "./lib/view";
import FirstLaunch from "./components/FirstLaunch";
import Home from "./components/Home";
import SettingsScreen from "./components/SettingsScreen";
import KeyHelp from "./components/KeyHelp";
import About from "./components/About";
import { GENERAL_RULES } from "./lib/rules.data";
import type { Analysis, GeneralRule } from "./types";
import SignPicker from "./components/SignPicker";
import CameraCapture from "./components/CameraCapture";
import type { Box } from "./lib/crop";
import Reading from "./components/Reading";
import { localMinute } from "./lib/home";

/** Now by the device's clock, in the same shape the moment field gives. */
const nowLocal = (): string => localMinute(new Date());


export default function App() {
  const [busy, setBusy] = useState(false);
  // A failed reading, in words (step 16). It is shown on the framing screen beside
  // the button, not below the screen: there it was missed.
  const [trouble, setTrouble] = useState<Trouble | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  // The way to stop a reading under way: the Cancel link, and leaving the screen.
  const stopper = useRef<AbortController | null>(null);
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
    setTrouble(null);
    setData(null);
    setAimed(undefined);
    setPicked(file);
    move("pick");
  }

  // Only what was cropped goes outward, and the reading shows that same thing —
  // otherwise a person would be checking the answer against a picture the model never
  // saw.
  async function onSend(cropped: File) {
    stopper.current?.abort();
    const stop = new AbortController();
    stopper.current = stop;
    setBusy(true);
    setProgress(null);
    setTrouble(null);
    setData(null);
    setPreview((old) => { if (old) URL.revokeObjectURL(old); return URL.createObjectURL(cropped); });
    try {
      if (canAnswerHere(settings)) {
        const cal = new Calendar();
        const at = parseNaive(moment || nowLocal());
        const analysis = await readHere(
          { name: cropped.name, data: cropped },
          { ...settings.provider, apiKey: settings.apiKey },
          at, cal, { signal: stop.signal, onProgress: setProgress });
        // Left behind while its last step was being counted: it opens nothing.
        if (stopper.current !== stop) return;
        setData(answer(analysis, at, cal) as unknown as Analysis);
        setPicked(null);
        move("sent");
      } else {
        // There is no getting here: with no key neither camera nor gallery is
        // offered. But if we did get here — say it in the same words as the settings.
        throw new VisionCallFailed(
          `To read a sign the app needs ${missing(settings).join(", ")}.`, "settings");
      }
    } catch (e) {
      // A reading the person already walked away from says nothing.
      if (stopper.current === stop) setTrouble(explain(e));
    } finally {
      if (stopper.current === stop) {
        stopper.current = null;
        setBusy(false);
        setProgress(null);
      }
    }
  }

  /** Leave the path, and leave nothing behind - a reading under way included: left
   *  running, it would open its answer on whatever screen the person had moved to. */
  function reset() {
    stopper.current?.abort();
    stopper.current = null;
    setBusy(false);
    setProgress(null);
    setPicked(null);
    setAimed(undefined);
    setTrouble(null);
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
            onAbout={() => move("open-about")}
          />
        ) : screen === "help" ? (
          <KeyHelp onBack={() => move("back")} />
        ) : screen === "about" ? (
          <About onBack={() => move("back")} />
        ) : screen === "first-launch" ? (
          <FirstLaunch
            onAddKey={() => move("open-settings")}
            onSettings={() => move("open-settings")}
          />
        ) : screen === "camera" ? (
          <CameraCapture
            onCaptured={(file, box) => {
              setTrouble(null);
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
            progress={progress && progressLine(progress, settings.provider.baseUrl)}
            trouble={trouble}
            onSend={onSend}
            onStop={() => stopper.current?.abort()}
            onDismiss={() => setTrouble(null)}
            onSettings={() => move("open-settings")}
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
            onScan={() => { setTrouble(null); setData(null); move("scan"); }}
            onPick={onPickFile}
            onSettings={() => move("open-settings")}
          />
        )}

      </main>
    </div>
  );
}
