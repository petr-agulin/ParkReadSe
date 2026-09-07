// Экран выбора знака: снимок, рамка, и ясная развилка — отправить, взять другой
// снимок или уйти.
//
// Наружу отсюда уходит только вырезанное. Всё остальное остаётся в браузере.

import { useEffect, useMemo, useRef, useState } from "react";
import type { Box, Point, Size } from "../lib/crop";
import { boxAt, defaultBox, moveBy, resizeCorner, shareOfFrame } from "../lib/crop";
import { cut, load, release, type Loaded } from "../lib/image";

type Props = {
  file: File;
  busy: boolean;
  onSend: (cropped: File) => void;
  /** Другой снимок вместо этого — остаёмся здесь же, с новой картинкой. */
  onReplace: (file: File) => void;
  /** Отмена — уйти на начало и ничего за собой не оставить. */
  onCancel: () => void;
};

type Drag =
  | { kind: "move"; from: Point; box: Box }
  | { kind: "corner"; corner: "nw" | "ne" | "sw" | "se" };

const CORNERS = ["nw", "ne", "sw", "se"] as const;

export default function SignPicker({ file, busy, onSend, onReplace, onCancel }: Props) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [box, setBox] = useState<Box | null>(null);
  const [touched, setTouched] = useState(false);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [sending, setSending] = useState(false);
  const stage = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const another = useRef<HTMLInputElement>(null);
  // Куда именно легла картинка внутри отведённого места. Высота сцены ограничена
  // экраном, поэтому вписанный снимок почти никогда не совпадает с ней по форме,
  // и рамку надо считать по картинке, а не по контейнеру — иначе она уедет.
  const [view, setView] = useState<{ x: number; y: number; w: number; h: number } | null>(null);

  useEffect(() => {
    let dead = false;
    let mine: Loaded | null = null;
    load(file)
      .then((l) => {
        if (dead) { release(l); return; }
        mine = l;
        setLoaded(l);
        setBox(defaultBox(l.size));   // рамка есть всегда: отправить можно и без касания
      })
      .catch((e) => !dead && setFailed(e.message));
    return () => { dead = true; release(mine); };
  }, [file]);

  // Снимок вписывается в сцену целиком (object-contain), и вокруг остаются поля.
  // Считаем, где он оказался: от этого зависит и рамка, и перевод касаний.
  useEffect(() => {
    if (!loaded || !stage.current) return;
    const el = stage.current;
    const measure = () => {
      const r = el.getBoundingClientRect();
      const scale = Math.min(r.width / loaded.size.w, r.height / loaded.size.h);
      const w = loaded.size.w * scale;
      const h = loaded.size.h * scale;
      setView({ x: (r.width - w) / 2, y: (r.height - h) / 2, w, h });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [loaded]);

  // Экранные координаты события → пиксели исходного снимка.
  function toImage(e: { clientX: number; clientY: number }, size: Size): Point {
    const r = frame.current!.getBoundingClientRect();
    return {
      x: ((e.clientX - r.left) / r.width) * size.w,
      y: ((e.clientY - r.top) / r.height) * size.h,
    };
  }

  function onPointerDown(e: React.PointerEvent) {
    if (!loaded || !box || busy) return;
    const el = e.target as HTMLElement;
    el.setPointerCapture?.(e.pointerId);
    const corner = CORNERS.find((c) => c === el.dataset.corner);
    if (corner) {
      setDrag({ kind: "corner", corner });
      return;
    }
    const p = toImage(e, loaded.size);
    const insideBox =
      p.x >= box.x && p.x <= box.x + box.w && p.y >= box.y && p.y <= box.y + box.h;
    if (insideBox) setDrag({ kind: "move", from: p, box });
    else {
      // Касание мимо рамки — это указание на знак, а не начало перетаскивания.
      setBox(boxAt(p, loaded.size, { w: box.w, h: box.h }));
      setTouched(true);
    }
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!drag || !loaded || !box) return;
    e.preventDefault();
    const p = toImage(e, loaded.size);
    if (drag.kind === "move") {
      setBox(moveBy(drag.box, p.x - drag.from.x, p.y - drag.from.y, loaded.size));
    } else {
      setBox(resizeCorner(box, drag.corner, p, loaded.size));
    }
    setTouched(true);
  }

  const stopDrag = () => setDrag(null);

  async function send() {
    if (!loaded || !box) return;
    setSending(true);
    try {
      const { file: cropped } = await cut(loaded, box);
      onSend(cropped);
    } catch (e) {
      setFailed(e instanceof Error ? e.message : String(e));
    } finally {
      setSending(false);
    }
  }

  const share = useMemo(
    () => (loaded && box ? shareOfFrame(box, loaded.size) : 0),
    [loaded, box],
  );

  if (failed) {
    return (
      <section className="rounded-xl border border-line bg-white p-4">
        <p className="text-[15px] text-ink">{failed}</p>
        <div className="mt-4 flex gap-2">
          <button type="button" onClick={() => another.current?.click()} className={PRIMARY}>
            Choose another photo
          </button>
          <input
            ref={another}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const next = e.target.files?.[0];
              e.target.value = "";
              if (next) onReplace(next);
            }}
          />
          <button type="button" onClick={onCancel} className={QUIET}>Cancel</button>
        </div>
      </section>
    );
  }

  const pct = (n: number) => `${n * 100}%`;

  return (
    <section className="flex flex-col gap-3">
      <p className="text-[13px] text-ink-2">
        {touched
          ? "Drag the frame or its corners. Only what is inside will be sent."
          : "Tap the sign. Only what is inside the frame will be sent."}
      </p>

      {/* Сцена ограничена высотой экрана: снимок с телефона вытянут вверх, и без
          предела он на ноутбуке уезжает за край, заставляя листать. */}
      <div
        ref={stage}
        className="relative h-[62vh] max-h-[720px] min-h-[280px] w-full select-none
                   overflow-hidden rounded-xl border border-line bg-black"
      >
        {loaded && (
          <img
            src={loaded.url}
            alt="The photo you chose"
            draggable={false}
            className="pointer-events-none absolute inset-0 h-full w-full object-contain"
          />
        )}

        {loaded && box && view && (
          <div
            ref={frame}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={stopDrag}
            onPointerCancel={stopDrag}
            className="absolute touch-none"
            style={{ left: view.x, top: view.y, width: view.w, height: view.h }}
          >
            {/* Затемнение снаружи рамки: видно, что уйдёт, а что нет. */}
            <div className="pointer-events-none absolute inset-0 bg-black/50"
                 style={{
                   clipPath: `polygon(0 0, 100% 0, 100% 100%, 0 100%, 0 0,
                     ${pct(box.x / loaded.size.w)} ${pct(box.y / loaded.size.h)},
                     ${pct(box.x / loaded.size.w)} ${pct((box.y + box.h) / loaded.size.h)},
                     ${pct((box.x + box.w) / loaded.size.w)} ${pct((box.y + box.h) / loaded.size.h)},
                     ${pct((box.x + box.w) / loaded.size.w)} ${pct(box.y / loaded.size.h)},
                     ${pct(box.x / loaded.size.w)} ${pct(box.y / loaded.size.h)})`,
                 }} />
            <div
              className="absolute border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,.35)]"
              style={{
                left: pct(box.x / loaded.size.w),
                top: pct(box.y / loaded.size.h),
                width: pct(box.w / loaded.size.w),
                height: pct(box.h / loaded.size.h),
              }}
            >
              {CORNERS.map((c) => (
                <span
                  key={c}
                  data-corner={c}
                  aria-label={`Resize ${c}`}
                  className={`absolute h-11 w-11 ${cornerClass(c)}`}
                >
                  {/* Точка не ловит касание сама: иначе нажатие приходит на неё,
                      `data-corner` не находится, и тяга за угол превращается
                      в перестановку рамки. */}
                  <span
                    className={`pointer-events-none absolute h-4 w-4 rounded-[3px] bg-white
                                shadow-[0_0_0_1px_rgba(0,0,0,.35)] ${dotClass(c)}`}
                  />
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      <p className="text-[12px] text-ink-3">
        {loaded
          ? `Sending about ${Math.round(share * 100)}% of the photo · ${loaded.size.w}×${loaded.size.h} original`
          : "Opening the photo…"}
      </p>

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={send} disabled={!loaded || busy || sending} className={PRIMARY}>
          {busy || sending ? "Sending…" : "Send this to be read"}
        </button>

        {/* «Другой снимок» открывает выбор файла сразу и оставляет на этом же
            экране: иначе он неотличим от отмены. */}
        <button
          type="button"
          onClick={() => another.current?.click()}
          disabled={busy || sending}
          className={QUIET}
        >
          Another photo
        </button>
        <input
          ref={another}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            const next = e.target.files?.[0];
            e.target.value = "";
            if (next) onReplace(next);
          }}
        />

        <button type="button" onClick={onCancel} disabled={busy || sending} className={PLAIN}>
          Cancel
        </button>
      </div>
    </section>
  );
}

const PRIMARY =
  "h-12 flex-1 rounded-lg bg-accent px-5 text-[15px] font-semibold text-white " +
  "disabled:opacity-50";
const QUIET =
  "h-12 rounded-lg border border-line bg-white px-4 text-[15px] font-semibold text-ink " +
  "disabled:opacity-50";
const PLAIN = "h-12 rounded-lg px-3 text-[15px] font-medium text-ink-2 disabled:opacity-50";

const cornerClass = (c: string) =>
  ({
    nw: "-left-5 -top-5", ne: "-right-5 -top-5",
    sw: "-bottom-5 -left-5", se: "-bottom-5 -right-5",
  })[c] ?? "";

const dotClass = (c: string) =>
  ({
    nw: "left-4 top-4", ne: "right-4 top-4",
    sw: "bottom-4 left-4", se: "bottom-4 right-4",
  })[c] ?? "";
