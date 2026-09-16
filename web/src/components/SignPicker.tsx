// Экран выбора знака: снимок, рамка, и ясная развилка — отправить, снять ещё раз
// или уйти.
//
// Наружу отсюда уходит только вырезанное. Приближение — про то, чем целятся:
// рамка живёт в пикселях исходника и от увеличения не зависит вовсе.

import { useEffect, useMemo, useRef, useState } from "react";
import type { Box, Point, Size } from "../lib/crop";
import {
  BOX_ASPECT, DEFAULT_HEIGHT, clampPan, defaultBox, fit, fractionIn, frameForView,
  moveBy, resizeCorner, shareOfFrame, toImagePoint, visibleRect, zoomAt, zoomLevel,
} from "../lib/crop";
import { cut, load, release, type Loaded } from "../lib/image";
import { suggestFrame } from "../lib/anchor";
import { roomBelow } from "../lib/layout";

type Props = {
  file: File;
  /** Рамка, уже наведённая человеком в видоискателе. Пусто — ставим по центру. */
  initialBox?: Box;
  busy: boolean;
  onSend: (cropped: File) => void;
  /** Другой снимок из галереи — остаёмся здесь же, с новой картинкой. */
  onReplace: (file: File) => void;
  /** Снять заново — возврат в наш видоискатель, а не в системную камеру. */
  onRetake: () => void;
  /** Отмена — уйти на начало и ничего за собой не оставить. */
  onCancel: () => void;
};

type Drag =
  | { kind: "move"; from: Point; box: Box }
  | { kind: "corner"; corner: "nw" | "ne" | "sw" | "se" }
  | { kind: "pan"; from: Point; placed: Box };

type Pinch = { dist: number; mid: Point; placed: Box };

const CORNERS = ["nw", "ne", "sw", "se"] as const;

export default function SignPicker({
  file, initialBox, busy, onSend, onReplace, onRetake, onCancel,
}: Props) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [box, setBox] = useState<Box | null>(null);
  // Доля экрана, которую занимает рамка. Человек меняет её углами, приближение —
  // никогда: в этом и смысл, рамка всегда выглядит одинаково и вся на виду.
  const frac = useRef<Size>({ w: DEFAULT_HEIGHT * BOX_ASPECT, h: DEFAULT_HEIGHT });
  const [sending, setSending] = useState(false);
  const room = useRef<HTMLDivElement>(null);
  const footer = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const another = useRef<HTMLInputElement>(null);

  // `base` — снимок целиком на экране, `placed` — где он лежит сейчас, уже
  // с приближением. Обе величины в пикселях сцены.
  const [base, setBase] = useState<Box | null>(null);
  const [placed, setPlaced] = useState<Box | null>(null);
  const [stageDims, setStageDims] = useState<Size | null>(null);

  // Жесты держим в ref, а не в состоянии: они меняются на каждое движение пальца,
  // и перерисовка на каждый шаг ни к чему.
  const drag = useRef<Drag | null>(null);
  const pinch = useRef<Pinch | null>(null);
  const pointers = useRef(new Map<number, Point>());

  useEffect(() => {
    let dead = false;
    let mine: Loaded | null = null;
    load(file)
      .then((l) => {
        if (dead) { release(l); return; }
        mine = l;
        setLoaded(l);
        // Рамка есть всегда: отправить можно и без касания. Из видоискателя
        // приходит уже наведённая; для снимка из галереи её предлагает поиск
        // основного знака на устройстве, а не нашёл — встаёт по центру, как раньше.
        const start = initialBox ?? suggestFrame(l.image, l.size) ?? defaultBox(l.size);
        setBox(start);
        frac.current = fractionIn(start, { x: 0, y: 0, ...l.size });
      })
      .catch((e) => !dead && setFailed(e.message));
    return () => { dead = true; release(mine); };
  }, [file, initialBox]);

  // Снимок вписывается в сцену целиком, вокруг остаются поля. При смене размера
  // окна или повороте телефона приближение сбрасывается: пересчитывать сдвиг
  // под новую сцену — больше путаницы, чем пользы.
  useEffect(() => {
    if (!loaded || !room.current) return;
    const el = room.current;
    const measure = () => {
      const r = el.getBoundingClientRect();
      // Ширину снимок берёт всю, высоты — сколько осталось под ним, чтобы кнопки
      // не ушли за край. Считаем от верха СТРАНИЦЫ, а не окна: иначе размер
      // зависел бы от того, куда прокручено в момент замера, и один и тот же
      // экран мерился бы по-разному (на проверке: 103 против 159).
      const pageTop = r.top + window.scrollY;
      const room = {
        w: r.width,
        h: roomBelow(pageTop, footer.current?.getBoundingClientRect().height ?? 0, window.innerHeight),
      };
      const fitted = fit(loaded.size, room);
      const next = { x: 0, y: 0, w: fitted.w, h: fitted.h };
      setStageDims({ w: fitted.w, h: fitted.h });
      setBase(next);
      setPlaced(next);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [loaded]);

  const stageSize = (): Size => {
    const r = stage.current!.getBoundingClientRect();
    return { w: r.width, h: r.height };
  };

  const toStage = (e: { clientX: number; clientY: number }): Point => {
    const r = stage.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const toImage = (e: { clientX: number; clientY: number }, size: Size): Point =>
    toImagePoint(toStage(e), placed!, size);

  // Замысел человека и показанная рамка — разные вещи. Показанная всегда вписана
  // в то, что сейчас на экране: приближаешься — ужимается и остаётся на виду,
  // отдаляешься — возвращается к заданному.
  const visible = useMemo(
    () => (loaded && placed && stageDims ? visibleRect(placed, loaded.size, stageDims) : null),
    [loaded, placed, stageDims],
  );
  /** Приближение изменилось — рамка снова по середине и той же доли экрана. */
  function reframe(next: Box) {
    if (!loaded || !stageDims) return;
    setBox(frameForView(frac.current, visibleRect(next, loaded.size, stageDims), loaded.size));
  }

  function onPointerDown(e: React.PointerEvent) {
    if (!loaded || !box || !placed || busy) return;
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, toStage(e));

    // Два пальца — это про картинку, а не про рамку: щипок начинается,
    // а начатое одним пальцем перетаскивание отменяется.
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      drag.current = null;
      pinch.current = {
        dist: Math.hypot(a.x - b.x, a.y - b.y),
        mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
        placed,
      };
      return;
    }
    if (pointers.current.size > 2) return;

    const el = e.target as HTMLElement;
    const corner = CORNERS.find((c) => c === el.dataset.corner);
    if (corner) { drag.current = { kind: "corner", corner }; return; }

    const p = toImage(e, loaded.size);
    const insideBox =
      p.x >= box.x && p.x <= box.x + box.w && p.y >= box.y && p.y <= box.y + box.h;
    // Внутри рамки палец её двигает, снаружи — двигает СНИМОК. Раньше касание
    // снаружи мгновенно переставляло рамку, и первый палец щипка утаскивал её
    // на каждом шаге приближения. Ставит рамку теперь только явная кнопка.
    if (insideBox) drag.current = { kind: "move", from: p, box };
    else drag.current = { kind: "pan", from: toStage(e), placed };
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!loaded || !placed) return;
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, toStage(e));

    if (pinch.current && pointers.current.size >= 2 && base) {
      const [a, b] = [...pointers.current.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const start = pinch.current;
      const zoomed = zoomAt(start.placed, dist / start.dist, start.mid, base);
      // Щипок и приближает, и тащит: середина между пальцами ведёт картинку.
      const moved = {
        ...zoomed,
        x: zoomed.x + (mid.x - start.mid.x),
        y: zoomed.y + (mid.y - start.mid.y),
      };
      const settled = clampPan(moved, stageSize());
      setPlaced(settled);
      reframe(settled);
      return;
    }

    if (!drag.current || !box) return;
    e.preventDefault();

    if (drag.current.kind === "pan") {
      const d = drag.current;
      const now = toStage(e);
      // Рамка при этом не двигается: сдвигая снимок, человек разглядывает его,
      // а не переставляет выделение.
      setPlaced(clampPan(
        { ...d.placed, x: d.placed.x + (now.x - d.from.x), y: d.placed.y + (now.y - d.from.y) },
        stageSize(),
      ));
      return;
    }

    const p = toImage(e, loaded.size);
    if (drag.current.kind === "move") {
      const d = drag.current;
      setBox(moveBy(d.box, p.x - d.from.x, p.y - d.from.y, loaded.size));
    } else {
      const next = resizeCorner(box, drag.current.corner, p, loaded.size);
      setBox(next);
      // Человек задал новый вид рамки — его и держим при следующем приближении.
      if (visible) frac.current = fractionIn(next, visible);
    }
  }

  function endPointer(e: React.PointerEvent) {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    if (pointers.current.size === 0) drag.current = null;
  }

  // На ноутбуке пальцев нет, а проверять приближение надо: колесо делает то же самое.
  function onWheel(e: React.WheelEvent) {
    if (!base || !placed) return;
    const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    const next = clampPan(zoomAt(placed, factor, toStage(e), base), stageSize());
    setPlaced(next);
    reframe(next);
  }

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
  const zoom = base && placed ? zoomLevel(placed, base) : 1;

  const another_ = (
    <input
      ref={another} type="file" accept="image/*" className="hidden"
      onChange={(e) => {
        const next = e.target.files?.[0];
        e.target.value = "";
        if (next) onReplace(next);
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
      <span className="flex-1 text-nav font-bold text-ink-strong">Frame the sign</span>
      {/* Один контрол вместо пары «снять ещё раз / другой снимок»: он ведёт
          на экран камеры, а там есть и спуск, и плитка галереи — оба источника
          в одном тапе. */}
      <button type="button" onClick={onRetake} disabled={busy || sending}
              className="text-label font-semibold text-link disabled:opacity-50">
        Replace
      </button>
    </div>
  );

  if (failed) {
    return (
      <section className="flex flex-col gap-4">
        {nav}
        <div className="rounded-card bg-ground p-6 shadow-card">
          <p className="text-body text-ink">{failed}</p>
          <button type="button" onClick={() => another.current?.click()}
                  className="mt-5 w-full rounded-button-sm bg-accent py-4 text-body
                             font-bold text-on-dark">
            Choose another photo
          </button>
        </div>
        {another_}
      </section>
    );
  }

  const pct = (n: number) => `${n * 100}%`;
  const size = loaded?.size;

  return (
    <section className="flex flex-col gap-4">
      {nav}

      {/* Снимок лежит на тёмном поле во всю ширину экрана — карточки внутри
          карточки больше нет. Сам он при этом не растянут и не обрезан: что
          видно, то и уходит (решение 148). */}
      <div
        ref={room}
        className="flex w-full items-center justify-center overflow-hidden
                   rounded-card bg-stage"
      >
      <div
        ref={stage}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endPointer}
        onPointerCancel={endPointer}
        onWheel={onWheel}
        className="relative touch-none select-none overflow-hidden"
        style={base ? { width: base.w, height: base.h } : { width: "100%", height: "100%" }}
      >
        {loaded && placed && (
          <img
            src={loaded.url}
            alt="The photo you chose"
            draggable={false}
            className="pointer-events-none absolute max-w-none"
            style={{ left: placed.x, top: placed.y, width: placed.w, height: placed.h }}
          />
        )}

        {loaded && size && box && placed && (
          <div
            className="pointer-events-none absolute"
            style={{ left: placed.x, top: placed.y, width: placed.w, height: placed.h }}
          >
            {/* Затемнение снаружи рамки: видно, что уйдёт, а что нет. */}
            <div className="absolute inset-0 bg-stage/50"
                 style={{
                   clipPath: `polygon(0 0, 100% 0, 100% 100%, 0 100%, 0 0,
                     ${pct(box.x / size.w)} ${pct(box.y / size.h)},
                     ${pct(box.x / size.w)} ${pct((box.y + box.h) / size.h)},
                     ${pct((box.x + box.w) / size.w)} ${pct((box.y + box.h) / size.h)},
                     ${pct((box.x + box.w) / size.w)} ${pct(box.y / size.h)},
                     ${pct(box.x / size.w)} ${pct(box.y / size.h)})`,
                 }} />
            <div
              className="absolute border-2 border-on-dark shadow-handle"
              style={{
                left: pct(box.x / size.w),
                top: pct(box.y / size.h),
                width: pct(box.w / size.w),
                height: pct(box.h / size.h),
              }}
            >
              {CORNERS.map((c) => (
                <span
                  key={c}
                  data-corner={c}
                  aria-label={`Resize ${c}`}
                  className={`pointer-events-auto absolute h-11 w-11 ${cornerClass(c)}`}
                >
                  {/* Точка не ловит касание сама: иначе нажатие приходит на неё,
                      `data-corner` не находится, и тяга за угол превращается
                      в перестановку рамки. */}
                  <span
                    className={`pointer-events-none absolute h-6 w-6 rounded-[7px] bg-ground
                                shadow-handle ${dotClass(c)}`}
                  />
                </span>
              ))}
            </div>
          </div>
        )}

        {zoom > 1.01 && (
          <button
            type="button"
            onClick={() => base && setPlaced(base)}
            className={CHIP + " absolute left-3 top-3"}
          >
            Fit · {zoom.toFixed(1)}×
          </button>
        )}

        {/* Подсказка меняется с приближением: иначе про угловые ручки узнать
            неоткуда. Статичная строка макета этого не говорит. */}
        <span className="pointer-events-none absolute inset-x-0 top-4 flex justify-center">
          <span className="rounded-full bg-stage/70 px-4 py-2 text-caption font-semibold
                           text-on-dark">
            {zoom > 1.01
              ? "Zoom in, then fine-tune with the corners"
              : "Drag the frame onto the sign"}
          </span>
        </span>

        {/* Затемнение под нижним слоем — единственный градиент в продукте.
            Без него подпись 11 px белым моноширинным лежит прямо на снимке
            и на светлом знаке не читается вовсе. */}
        <div
          ref={footer}
          className="scrim absolute inset-x-0 bottom-0 flex flex-col gap-3 px-5 pb-5 pt-10"
        >
          <span className="text-center font-mono text-mono text-on-dark">
            {loaded
              ? `sending about ${Math.round(share * 100)}% of ${loaded.size.w}×${loaded.size.h}`
              : "opening the photo…"}
          </span>
          <button type="button" onClick={send} disabled={!loaded || busy || sending}
                  className="rounded-button-sm bg-accent py-5 text-row font-bold
                             text-on-dark disabled:opacity-50">
            {busy || sending ? "Sending…" : "Send this to be read"}
          </button>
        </div>
      </div>
      </div>

      {another_}
    </section>
  );
}

const CHIP = "rounded-full bg-stage/70 px-4 py-2 text-caption font-semibold text-on-dark";

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
