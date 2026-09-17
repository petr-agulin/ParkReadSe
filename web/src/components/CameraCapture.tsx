// Живая камера: человек целится, снимок берётся в полном разрешении потока.
//
// Кадр отсюда уходит не наружу, а на экран выбора знака: целиться на ходу неточно,
// и подтверждение остаётся за человеком. Наружу по-прежнему уходит только вырезанное.

import { useEffect, useRef, useState } from "react";
import { cameraFailure, captureConstraints, torchSupported } from "../lib/camera";
import { defaultBox, fit, type Box, type Size } from "../lib/crop";
import { roomBelow } from "../lib/layout";

type Props = {
  onCaptured: (file: File, box: Box) => void;
  onCancel: () => void;
  /** Плитка галереи рядом со спуском: отсюда можно уйти в другую полосу —
   *  к уже снятому кадру, — не возвращаясь на главный экран. */
  onPick: (file: File) => void;
};

export default function CameraCapture({ onCaptured, onCancel, onPick }: Props) {
  const video = useRef<HTMLVideoElement>(null);
  const room = useRef<HTMLDivElement>(null);
  const footer = useRef<HTMLDivElement>(null);
  const gallery = useRef<HTMLInputElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [size, setSize] = useState<Size | null>(null);
  const [view, setView] = useState<Box | null>(null);
  const [torch, setTorch] = useState(false);
  const [hasTorch, setHasTorch] = useState(false);
  const [taking, setTaking] = useState(false);

  useEffect(() => {
    let dead = false;
    navigator.mediaDevices
      .getUserMedia(captureConstraints())
      .then((s) => {
        // Уход с экрана мог случиться, пока спрашивали доступ: поток надо погасить,
        // иначе на телефоне остаётся гореть индикатор камеры.
        if (dead) { s.getTracks().forEach((t) => t.stop()); return; }
        stream.current = s;
        setHasTorch(torchSupported(s.getVideoTracks()[0]));
        if (video.current) {
          video.current.srcObject = s;
          video.current.play().catch(() => undefined);
        }
      })
      .catch((e) => !dead && setFailed(cameraFailure(e)));

    return () => {
      dead = true;
      stream.current?.getTracks().forEach((t) => t.stop());
      stream.current = null;
    };
  }, []);

  // Поток вписан в сцену целиком, вокруг остаются поля — те же вычисления, что
  // на экране выбора, и та же функция. Иначе подсказка показывала бы одно,
  // а рамка на следующем экране вставала бы в другое место.
  useEffect(() => {
    if (!size || !room.current) return;
    const el = room.current;
    const measure = () => {
      const r = el.getBoundingClientRect();
      // Поток берёт всю ширину, высоты — сколько осталось под ним. Считаем
      // от верха СТРАНИЦЫ, а не окна: иначе размер зависел бы от прокрутки
      // в момент замера.
      const pageTop = r.top + window.scrollY;
      const room = {
        w: r.width,
        h: roomBelow(pageTop, footer.current?.getBoundingClientRect().height ?? 0, window.innerHeight),
      };
      setView(fit(size, room));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [size]);

  async function toggleTorch() {
    const track = stream.current?.getVideoTracks()[0];
    if (!track) return;
    const next = !torch;
    try {
      // Фонарик не стандартизован: в типах его нет вовсе, потому и приведение
      // через `unknown`. Браузер, который его не знает, просто откажет — и тогда
      // кнопка исчезает, а не остаётся врать.
      await track.applyConstraints(
        { advanced: [{ torch: next }] } as unknown as MediaTrackConstraints,
      );
      setTorch(next);
    } catch {
      setHasTorch(false);
    }
  }

  function take() {
    const v = video.current;
    if (!v || !v.videoWidth || !size) return;
    setTaking(true);
    // Пиксели берём из потока, а не с экрана: на экране кадр умещён под телефон,
    // а знак через дорогу переживает кадрирование только за счёт настоящих пикселей.
    const canvas = document.createElement("canvas");
    canvas.width = size.w;
    canvas.height = size.h;
    canvas.getContext("2d")?.drawImage(v, 0, 0, size.w, size.h);
    canvas.toBlob(
      (blob) => {
        setTaking(false);
        if (!blob) { setFailed("The frame could not be captured. Try again."); return; }
        // Кадр остаётся в памяти страницы и на диск не пишется. Съёмка из потока
        // не создаёт EXIF вовсе — геометке взяться неоткуда.
        onCaptured(new File([blob], "camera.jpg", { type: "image/jpeg" }), defaultBox(size));
      },
      "image/jpeg",
      0.92,
    );
  }

  /** Вход в галерею. `capture` не ставим: он открыл бы камеру вместо галереи,
   *  и уже снятый кадр стал бы недоступен. */
  const galleryInput = (
    <input
      ref={gallery}
      type="file"
      accept="image/*"
      className="hidden"
      onChange={(e) => {
        const picked = e.target.files?.[0];
        e.target.value = "";          // иначе тот же файл второй раз не даёт события
        if (picked) onPick(picked);
      }}
    />
  );

  const nav = (
    <div className="flex items-center gap-3.5">
      <button type="button" onClick={onCancel} aria-label="Back"
              className="flex h-10 w-10 items-center justify-center rounded-full bg-chip
                         text-lg font-semibold text-ink-2">
        ‹
      </button>
      <span className="flex-1 text-nav font-bold text-ink-strong">Scan a sign</span>
      {/* Вспышка — в шапке, чтобы не лежать на кадре. Её нет вовсе там, где
          камера её не умеет: на iOS Safari фонарика нет, и мёртвой таблетке
          там взяться неоткуда. */}
      {hasTorch && (
        <button type="button" onClick={toggleTorch} aria-pressed={torch}
                className="rounded-full bg-chip px-4 py-2 text-label font-semibold text-ink-2">
          {torch ? "Torch on" : "Torch off"}
        </button>
      )}
    </div>
  );

  // Отказ занимает место видоискателя: шапка остаётся, а выходом служит та же
  // плитка галереи. Причин четыре, и они разные по сути — запретили, нет камеры,
  // занята другим приложением, не завелась.
  if (failed) {
    return (
      <section className="flex flex-col gap-4">
        {nav}
        <div className="rounded-card bg-ground p-6 shadow-card">
          <p className="text-body text-ink">{failed}</p>
          <button
            type="button"
            onClick={() => gallery.current?.click()}
            className="mt-5 w-full rounded-button-sm bg-accent py-4 text-body font-bold
                       text-on-dark"
          >
            Pick a photo instead
          </button>
        </div>
        {galleryInput}
      </section>
    );
  }

  return (
    <section className="flex flex-1 flex-col gap-4">
      {nav}

      {/* Подсказка — над видоискателем, а не на кадре: на кадре она закрывает
          ровно то, во что целятся. И говорит, что делать, а не называет предмет. */}
      <p className="text-center text-label text-ink-2">
        Fit the whole sign in the frame, with every plate under it.
      </p>

      <div ref={room} className="flex w-full flex-1 items-center justify-center">
        {/* Сцена по размеру потока, а не наоборот: иначе по бокам остаются
            тёмные поля, и видоискатель выглядит рамкой в рамке. Полный обрез
            показывал бы не то, что снимается (решение 148). */}
        <div
          className="relative overflow-hidden rounded-card bg-stage"
          style={view ? { width: view.w, height: view.h } : { width: "100%", height: "100%" }}
        >
          <video
            ref={video}
            playsInline
            muted
            onLoadedMetadata={(e) => {
              const v = e.currentTarget;
              if (v.videoWidth) setSize({ w: v.videoWidth, h: v.videoHeight });
            }}
            className="absolute inset-0 h-full w-full object-cover"
          />

          {/* Подсказка — ровно та рамка, что встанет на следующем экране: считается
              той же функцией от размера потока, а не подобранной на глаз долей. */}
          {size && view && (() => {
            const guide = defaultBox(size);
            const k = view.w / size.w;
            return (
              <div
                className="pointer-events-none absolute rounded-sm border-2 border-on-dark
                           shadow-mask"
                style={{
                  left: guide.x * k,
                  top: guide.y * k,
                  width: guide.w * k,
                  height: guide.h * k,
                }}
              />
            );
          })()}

        </div>
      </div>

      {/* Кнопки стоят у нижнего края экрана, а не поверх кадра. `lib/layout`
          прямо говорит, что раскладка «кнопки поверх снимка» проверялась
          на двух телефонах и была отброшена, — на этом экране она задержалась.

          Высоту этого ряда вычитает `roomBelow`. Пока ряд лежал на кадре,
          вычитание было поправкой на то, что места не занимает; теперь оно
          просто правда, и видоискателю достаётся ровно остаток. */}
      <div ref={footer} className="flex items-center justify-between px-2">
        <button
          type="button"
          onClick={() => gallery.current?.click()}
          className="flex h-14 w-20 shrink-0 items-center justify-center rounded-field
                     bg-chip text-caption font-bold text-ink-2"
        >
          Pick photo
        </button>
        <button
          type="button"
          onClick={take}
          disabled={!size || taking}
          aria-label="Take the photo"
          className="flex h-23 w-23 shrink-0 items-center justify-center rounded-full
                     bg-ground shadow-raised disabled:opacity-50"
        >
          <span className="block h-[70px] w-[70px] rounded-full bg-accent" />
        </button>
        {/* Пустое место той же ширины, что и плитка: оно держит спуск посередине. */}
        <span className="h-14 w-20 shrink-0" aria-hidden />
      </div>

      {galleryInput}
    </section>
  );
}
