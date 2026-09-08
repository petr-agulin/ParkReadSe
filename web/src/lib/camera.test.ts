// Требования шага 3, проверяемые машиной: 4 (разрешение) и 8 (поддержка).
// Остальное — железо: камера, разрешение доступа, фонарик. Их берёт ручной сценарий.

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

describe("предлагать ли камеру", () => {
  it("да, когда контекст защищён и браузер умеет", () => {
    expect(cameraSupported(media, true)).toBe(true);
  });

  it("нет по незащищённому адресу: getUserMedia там не работает вовсе", () => {
    expect(cameraSupported(media, false)).toBe(false);
  });

  it("нет, когда браузер не умеет", () => {
    expect(cameraSupported(undefined, true)).toBe(false);
    expect(cameraSupported({} as MediaDevices, true)).toBe(false);
  });
});

describe("что просим у камеры", () => {
  const video = captureConstraints().video as MediaTrackConstraints;

  it("заднюю камеру", () => {
    expect(video.facingMode).toEqual({ ideal: "environment" });
  });

  it("наибольшее разрешение, а не размер экрана", () => {
    expect(video.height).toEqual({ ideal: CAPTURE_IDEAL });
    expect(CAPTURE_IDEAL).toBeGreaterThanOrEqual(3000);
  });

  it("вертикальный кадр 3:4: от формы потока зависит, влезет ли он в ширину экрана", () => {
    expect(video.aspectRatio).toEqual({ ideal: CAPTURE_ASPECT });
    expect(CAPTURE_ASPECT).toBeCloseTo(0.75);
    // Ширина просится в той же пропорции, иначе пожелания спорят между собой.
    const w = (video.width as { ideal: number }).ideal;
    const h = (video.height as { ideal: number }).ideal;
    expect(w / h).toBeCloseTo(CAPTURE_ASPECT, 2);
  });

  it("просит, но не требует: `exact` отказал бы на слабом аппарате", () => {
    expect(JSON.stringify(video)).not.toContain("exact");
  });

  it("звук не просит вовсе", () => {
    expect(captureConstraints().audio).toBe(false);
  });
});

describe("фонарик", () => {
  const track = (caps: object) =>
    ({ getCapabilities: () => caps }) as unknown as MediaStreamTrack;

  it("есть, когда камера о нём заявляет", () => {
    expect(torchSupported(track({ torch: true }))).toBe(true);
  });

  it("нет, когда не заявляет или заявляет ложь", () => {
    expect(torchSupported(track({}))).toBe(false);
    expect(torchSupported(track({ torch: false }))).toBe(false);
  });

  it("нет, когда браузер не умеет спрашивать (iOS Safari)", () => {
    expect(torchSupported({} as MediaStreamTrack)).toBe(false);
    expect(torchSupported(null)).toBe(false);
  });
});

describe("отказ камеры", () => {
  const named = (name: string) => Object.assign(new Error("x"), { name });

  it("запрет доступа объясняется как запрет, а не как поломка", () => {
    expect(cameraFailure(named("NotAllowedError"))).toMatch(/allow camera access/i);
  });

  it("занятая камера отличается от отсутствующей", () => {
    expect(cameraFailure(named("NotReadableError"))).toMatch(/another app/i);
    expect(cameraFailure(named("NotFoundError"))).toMatch(/no camera/i);
  });

  it("любая причина оставляет путь через галерею", () => {
    for (const n of ["NotAllowedError", "NotFoundError", "NotReadableError", "Whatever"]) {
      expect(cameraFailure(named(n))).toMatch(/choose a photo/i);
    }
  });
});
