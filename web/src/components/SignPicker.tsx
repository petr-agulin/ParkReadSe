// The framing screen: the photograph, the frame, and a clear fork - send it, take
// another, or leave.
//
// Only what is cut out ever leaves this screen. Zooming is about what you aim with:
// the frame lives in the pixels of the original and does not depend on the zoom at
// all.

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
  /** The frame the person already aimed in the viewfinder. Empty - we centre it. */
  initialBox?: Box;
  busy: boolean;
  onSend: (cropped: File) => void;
  /** Another photograph from the gallery - we stay here, with the new picture. */
  onReplace: (file: File) => void;
  /** Take another - back to our own viewfinder, not to the system camera. */
  onRetake: () => void;
  /** Cancel - go back to the start and leave nothing behind. */
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
  // The share of the screen the frame takes up. The person changes it by the
  // corners, the zoom never does: that is the point - the frame always looks the
  // same and stays wholly in view.
  const frac = useRef<Size>({ w: DEFAULT_HEIGHT * BOX_ASPECT, h: DEFAULT_HEIGHT });
  const [sending, setSending] = useState(false);
  const room = useRef<HTMLDivElement>(null);
  const footer = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const another = useRef<HTMLInputElement>(null);

  // `base` is the whole photograph on screen, `placed` is where it lies now, zoom
  // included. Both are in the pixels of the stage.
  const [base, setBase] = useState<Box | null>(null);
  const [placed, setPlaced] = useState<Box | null>(null);
  const [stageDims, setStageDims] = useState<Size | null>(null);

  // Gestures are kept in refs rather than in state: they change on every movement of
  // a finger, and redrawing at every step is pointless.
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
        // There is always a frame: it can be sent without a single touch. From the
        // viewfinder it arrives already aimed; for a photograph from the gallery it
        // is proposed by the search for the main sign on the device, and failing
        // that it stands in the centre, as before.
        const start = initialBox ?? suggestFrame(l.image, l.size) ?? defaultBox(l.size);
        setBox(start);
        frac.current = fractionIn(start, { x: 0, y: 0, ...l.size });
      })
      .catch((e) => !dead && setFailed(e.message));
    return () => { dead = true; release(mine); };
  }, [file, initialBox]);

  // The photograph fits into the stage whole, with margins left around it. On a
  // change of window size or a turn of the phone the zoom is reset: recomputing the
  // pan for a new stage is more confusion than it is worth.
  useEffect(() => {
    if (!loaded || !room.current) return;
    const el = room.current;
    const measure = () => {
      const r = el.getBoundingClientRect();
      // The photograph takes the full width, and as much height as is left beneath
      // it so the buttons do not run off the edge. It is measured from the top of
      // the PAGE rather than the window: otherwise the size would depend on where
      // the page happened to be scrolled at the moment of measuring, and one and the
      // same screen would measure differently (observed: 103 against 159).
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

  // What the person intends and what the frame shows are different things. What is
  // shown always fits inside what is on screen now: zoom in and it shrinks and stays
  // in view, zoom out and it returns to what was set.
  const visible = useMemo(
    () => (loaded && placed && stageDims ? visibleRect(placed, loaded.size, stageDims) : null),
    [loaded, placed, stageDims],
  );
  /** The zoom changed - the frame is centred again, at the same share of the screen. */
  function reframe(next: Box) {
    if (!loaded || !stageDims) return;
    setBox(frameForView(frac.current, visibleRect(next, loaded.size, stageDims), loaded.size));
  }

  function onPointerDown(e: React.PointerEvent) {
    if (!loaded || !box || !placed || busy) return;
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, toStage(e));

    // Two fingers are about the picture, not the frame: a pinch begins, and anything
    // begun with one finger is cancelled.
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
    // Inside the frame a finger moves the frame; outside it moves the PHOTOGRAPH.
    // A touch outside used to reposition the frame instantly, and the first finger
    // of a pinch dragged it away at every step of the zoom. Only an explicit button
    // places the frame now.
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
      // A pinch both zooms and drags: the midpoint between the fingers leads the
      // picture.
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
      // The frame does not move meanwhile: dragging the photograph, the person is
      // examining it rather than moving the selection.
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
      // The person has set a new shape for the frame - that is what the next zoom
      // will keep.
      if (visible) frac.current = fractionIn(next, visible);
    }
  }

  function endPointer(e: React.PointerEvent) {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    if (pointers.current.size === 0) drag.current = null;
  }

  // A laptop has no fingers, and the zoom still has to be testable: the wheel does
  // the same thing.
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
      {/* One control instead of a pair of "take another / choose a photo": it leads
          to the camera screen, and there are both a shutter and a gallery tile
          there - both sources in one tap. */}
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
    <section className="flex flex-1 flex-col gap-4">
      {nav}

      {/* The hint sits above the photograph, not on it: on the photograph it covers
          exactly what is being aimed at. Unlike the camera's, it is live - there is
          nowhere else to learn about the corner handles. */}
      {/* Its height is fixed for TWO lines, and that is not decoration.

          The hint changes with the zoom, and it now stands in the shared column.
          Let the longer wording wrap to a second line and the wrapper below loses a
          line of height, the observer on it fires, the measuring pass fits the
          photograph afresh and sets `base` and `placed` equal, and the zoom is
          computed from those two - so it becomes 1. The zoom would reset at the very
          moment it was being made, the hint would go back to the short wording, and
          round it would go again.

          While the box is one height at both one line and two, the wrapper has
          nothing to change. */}
      <p className="min-h-11 text-center text-label text-ink-2">
        {zoom > 1.01
          ? "Zoom in, then fine-tune with the corners"
          : "Drag the frame onto the sign"}
      </p>

      {/* The photograph is neither stretched nor cropped: what is seen is what is
          sent (decision 148). The wrapper takes the remaining height and presses the
          photograph up against the hint - the wrapper itself is empty, and the dark
          card sits on the photograph. Were the dark ground on the wrapper, it would
          stretch across the whole remainder, and the band under the frame would grow
          wider rather than narrower. */}
      <div ref={room} className="flex w-full flex-1 items-start justify-center">
      <div
        ref={stage}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endPointer}
        onPointerCancel={endPointer}
        onWheel={onWheel}
        className="relative touch-none select-none overflow-hidden rounded-card bg-stage"
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
            {/* Darkening outside the frame: it shows what will go and what will not. */}
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
                  {/* The dot does not catch the touch itself: otherwise the press
                      lands on it, the corner attribute is not found, and dragging a
                      corner turns into repositioning the frame. */}
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

      </div>
      </div>

      {/* The button and the line about size sit at the bottom of the screen rather
          than over the photograph. The line stands with the button: it says exactly
          what the button will send. The gradient that used to darken the area behind
          it existed because a white monospaced line lay on the photograph and could
          not be read against a pale sign. The line left the frame, so there was
          nothing left to darken and the gradient is gone. */}
      <div ref={footer} className="flex flex-col gap-3">
        <span className="text-center font-mono text-mono text-ink-3">
          {loaded
            ? `sending about ${Math.round(share * 100)}% of ${loaded.size.w}×${loaded.size.h}`
            : "opening the photo…"}
        </span>
        <button type="button" onClick={send} disabled={!loaded || busy || sending}
                className="rounded-button-sm bg-accent py-5 text-row font-bold
                           text-on-dark disabled:opacity-50">
          {busy || sending ? "Reading…" : "Send this to be read"}
        </button>
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
