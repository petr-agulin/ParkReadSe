// The requirements of step 3 a machine can check: 4 (resolution) and 8 (support).
// The rest is hardware — the camera, the access permission, the torch — and belongs
// to the manual scenario.

import { describe, expect, it } from "vitest";
import {
  CAPTURE_ASPECT,
  CAPTURE_IDEAL,
  cameraFailure,
  cameraSupported,
  captureConstraints,
  torchSupported,
} from "./camera";

const media = { getUserMedia: () => Promise.resolve({} as MediaStream) } as unknown as MediaDevices;

describe("whether to offer the camera", () => {
  it("yes, when the context is secure and the browser can", () => {
    expect(cameraSupported(media, true)).toBe(true);
  });

  it("no at an insecure address: getUserMedia does not work there at all", () => {
    expect(cameraSupported(media, false)).toBe(false);
  });

  it("no, when the browser cannot", () => {
    expect(cameraSupported(undefined, true)).toBe(false);
    expect(cameraSupported({} as MediaDevices, true)).toBe(false);
  });
});

describe("what we ask of the camera", () => {
  const video = captureConstraints().video as MediaTrackConstraints;

  it("the rear camera", () => {
    expect(video.facingMode).toEqual({ ideal: "environment" });
  });

  it("the largest resolution, not the size of the screen", () => {
    expect(video.height).toEqual({ ideal: CAPTURE_IDEAL });
    expect(CAPTURE_IDEAL).toBeGreaterThanOrEqual(3000);
  });

  it("an upright 3:4 frame: the stream's shape decides whether it fits the screen's width", () => {
    expect(video.aspectRatio).toEqual({ ideal: CAPTURE_ASPECT });
    expect(CAPTURE_ASPECT).toBeCloseTo(0.75);
    // The width is asked for in the same proportion, or the wishes argue with each other.
    const w = (video.width as { ideal: number }).ideal;
    const h = (video.height as { ideal: number }).ideal;
    expect(w / h).toBeCloseTo(CAPTURE_ASPECT, 2);
  });

  it("asks rather than demands: `exact` would be refused on a weak device", () => {
    expect(JSON.stringify(video)).not.toContain("exact");
  });

  it("does not ask for sound at all", () => {
    expect(captureConstraints().audio).toBe(false);
  });
});

describe("the torch", () => {
  const track = (caps: object) =>
    ({ getCapabilities: () => caps }) as unknown as MediaStreamTrack;

  it("is there when the camera declares it", () => {
    expect(torchSupported(track({ torch: true }))).toBe(true);
  });

  it("is not there when it is undeclared or declared false", () => {
    expect(torchSupported(track({}))).toBe(false);
    expect(torchSupported(track({ torch: false }))).toBe(false);
  });

  it("is not there when the browser cannot ask (iOS Safari)", () => {
    expect(torchSupported({} as MediaStreamTrack)).toBe(false);
    expect(torchSupported(null)).toBe(false);
  });
});

describe("the camera failing", () => {
  const named = (name: string) => Object.assign(new Error("x"), { name });

  it("explains a refused access as a refusal, not as a fault", () => {
    expect(cameraFailure(named("NotAllowedError"))).toMatch(/allow camera access/i);
  });

  it("tells a busy camera from a missing one", () => {
    expect(cameraFailure(named("NotReadableError"))).toMatch(/another app/i);
    expect(cameraFailure(named("NotFoundError"))).toMatch(/no camera/i);
  });

  it("leaves the way through the gallery open, whatever the reason", () => {
    for (const n of ["NotAllowedError", "NotFoundError", "NotReadableError", "Whatever"]) {
      expect(cameraFailure(named(n))).toMatch(/choose a photo/i);
    }
  });
});
