// The live camera: what to ask of the browser, and what it is able to do.
//
// Only the decisions expressible in numbers and conditions live here — and tests hold
// those. The stream itself, the frame and the torch live in CameraCapture.tsx.

/** The resolution we ask for. `ideal` and not `exact`: the device gives back the
 *  nearest it can manage rather than refusing outright. */
export const CAPTURE_IDEAL = 4096;

/**
 * The shape of frame we ask of the camera: 3:4, upright.
 *
 * The browser picks the sensor's mode itself, and phones pick differently: one gives
 * back 16:9, another 4:3. Whether the viewfinder fits across the width of the screen
 * depends on that: a 9:16 stream is too tall, runs up against the height and loses
 * width. 3:4 is the native shape of most sensors, and it is markedly closer to the
 * shape of the room we have. A phone without such a mode will simply give back the
 * nearest one: this is a wish, not a requirement.
 */
export const CAPTURE_ASPECT = 3 / 4;

/**
 * The camera is offered only if the browser will give it.
 *
 * `getUserMedia` lives in a secure context alone: over `https://` and on `localhost`.
 * At an address of the form `http://192.168.x.x` it is not there at all, and a button
 * saying "take a photo" there is a promise that cannot be kept.
 */
export function cameraSupported(
  media: MediaDevices | undefined,
  secure: boolean,
): boolean {
  return Boolean(secure && media && typeof media.getUserMedia === "function");
}

/**
 * We ask for the rear camera and the largest resolution the device will give.
 *
 * The size of the screen has nothing to do with it: at the screen we only look, while
 * the frame is cut from the real pixels of the stream. A sign across the road
 * survives the cropping on account of those alone.
 */
export function captureConstraints(): MediaStreamConstraints {
  return {
    audio: false,
    video: {
      facingMode: { ideal: "environment" },
      aspectRatio: { ideal: CAPTURE_ASPECT },
      width: { ideal: Math.round(CAPTURE_IDEAL * CAPTURE_ASPECT) },
      height: { ideal: CAPTURE_IDEAL },
    },
  };
}

/** Whether this camera can manage a torch. On iOS Safari it cannot, and there must
 *  then be no button. */
export function torchSupported(track: MediaStreamTrack | null | undefined): boolean {
  if (!track || typeof track.getCapabilities !== "function") return false;
  const caps = track.getCapabilities() as MediaTrackCapabilities & { torch?: boolean };
  return caps.torch === true;
}

/** What to tell a person when the camera did not open. The reason matters: "it was
 *  refused" and "there is no camera" are cured differently, and the browser reports
 *  both of them with one exception. */
export function cameraFailure(error: unknown): string {
  const name = error instanceof Error ? error.name : "";
  switch (name) {
    case "NotAllowedError":
    case "SecurityError":
      return "The browser blocked the camera. Allow camera access for this page, " +
        "or choose a photo instead.";
    case "NotFoundError":
    case "OverconstrainedError":
      return "No camera the browser can use. Choose a photo instead.";
    case "NotReadableError":
      return "The camera is busy in another app. Close it and try again, " +
        "or choose a photo instead.";
    default:
      return "The camera could not be started. Choose a photo instead.";
  }
}
