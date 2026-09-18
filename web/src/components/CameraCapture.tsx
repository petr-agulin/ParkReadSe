// The live camera: the person aims, and the photograph is taken at the stream's full
// resolution.
//
// A frame from here does not leave the device - it goes to the framing screen: aiming
// on the move is imprecise, and the confirmation stays with the person. What leaves is
// still only what was cut out.

import { useEffect, useRef, useState } from "react";
import { cameraFailure, captureConstraints, torchSupported } from "../lib/camera";
import { defaultBox, fit, type Box, type Size } from "../lib/crop";
import { roomBelow } from "../lib/layout";

type Props = {
  onCaptured: (file: File, box: Box) => void;
  onCancel: () => void;
  /** The gallery tile beside the shutter: from here one can step into the other
   *  path - to a photograph already taken - without returning to the home screen. */
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
        // The screen may have been left while permission was being asked: the stream
        // has to be put out, or the camera indicator stays lit on the phone.
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

  // The stream is fitted into the stage whole, with margins around it - the same
  // computation as on the framing screen, and the same function. Otherwise the guide
  // would show one thing and the frame on the next screen would stand somewhere else.
  useEffect(() => {
    if (!size || !room.current) return;
    const el = room.current;
    const measure = () => {
      const r = el.getBoundingClientRect();
      // The stream takes the full width, and as much height as is left beneath it. It
      // is measured from the top of the PAGE rather than the window: otherwise the
      // size would depend on where the page was scrolled at the moment of measuring.
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
      // The torch is not standardised: it does not exist in the types at all, which
      // is why the cast goes through `unknown`. A browser that does not know it
      // simply refuses - and then the button disappears rather than staying to lie.
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
    // The pixels are taken from the stream rather than from the screen: on screen the
    // frame is fitted to the phone, and a sign across the road survives cropping only
    // thanks to the real pixels.
    const canvas = document.createElement("canvas");
    canvas.width = size.w;
    canvas.height = size.h;
    canvas.getContext("2d")?.drawImage(v, 0, 0, size.w, size.h);
    canvas.toBlob(
      (blob) => {
        setTaking(false);
        if (!blob) { setFailed("The frame could not be captured. Try again."); return; }
        // The frame stays in the page's memory and is never written to disk. Taking
        // it from the stream creates no metadata at all - there is nowhere for a
        // location tag to come from.
        onCaptured(new File([blob], "camera.jpg", { type: "image/jpeg" }), defaultBox(size));
      },
      "image/jpeg",
      0.92,
    );
  }

  /** The way into the gallery. The capture attribute is deliberately not set: it
   *  would open the camera instead of the gallery, and a photograph already taken
   *  would become unreachable. */
  const galleryInput = (
    <input
      ref={gallery}
      type="file"
      accept="image/*"
      className="hidden"
      onChange={(e) => {
        const picked = e.target.files?.[0];
        e.target.value = "";          // or the same file a second time fires no event
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
      {/* The torch sits in the header so as not to lie over the frame. It is absent
          entirely where the camera cannot do it: on iOS Safari there is no torch, and
          a dead control has nowhere to come from there. */}
      {hasTorch && (
        <button type="button" onClick={toggleTorch} aria-pressed={torch}
                className="rounded-full bg-chip px-4 py-2 text-label font-semibold text-ink-2">
          {torch ? "Torch on" : "Torch off"}
        </button>
      )}
    </div>
  );

  // A failure takes the place of the viewfinder: the header stays, and the way out is
  // the same gallery tile. There are four causes, and they differ in kind - permission
  // refused, no camera, busy with another application, would not start.
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

      {/* The hint stands above the viewfinder rather than on the frame: on the frame
          it covers exactly what is being aimed at. And it says what to do rather than
          naming the thing. */}
      <p className="text-center text-label text-ink-2">
        Aim at the whole sign. You'll frame it next.
      </p>

      {/* `items-start` rather than centring: the wrapper is stretched across the
          remainder, and centred the stage drifted away from the hint - on the second
          phone a gap yawned between them. The frame begins directly under the text. */}
      <div ref={room} className="flex w-full flex-1 items-start justify-center">
        {/* The stage is sized to the stream rather than the other way round:
            otherwise dark margins remain at the sides and the viewfinder looks like a
            frame inside a frame. Cropping to fill would show something other than
            what is being photographed (decision 148). */}
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

          {/* The guide is exactly the frame that will stand on the next screen:
              computed by the same function from the size of the stream, not a share
              picked by eye. */}
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

      {/* The buttons stand at the foot of the screen rather than over the frame.
          `lib/layout` says outright that the layout with buttons over the photograph
          was tried on two phones and abandoned - on this screen it had lingered.

          The height of this row is what `roomBelow` subtracts. While the row lay over
          the frame, that subtraction was an allowance for something taking no space;
          now it is simply true, and the viewfinder gets exactly the remainder. */}
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
        {/* Empty space the same width as the tile: it is what holds the shutter in
            the middle. */}
        <span className="h-14 w-20 shrink-0" aria-hidden />
      </div>

      {galleryInput}
    </section>
  );
}
