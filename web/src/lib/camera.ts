// Живая камера: что спросить у браузера и что он умеет.
//
// Здесь только решения, выразимые числами и условиями, — их держат тесты.
// Сам поток, кадр и фонарик живут в CameraCapture.tsx.

/** Разрешение, которое просим. Именно `ideal`, а не `exact`: аппарат отдаёт
 *  ближайшее, что умеет, а не отказывает совсем. */
export const CAPTURE_IDEAL = 4096;

/**
 * Форма кадра, которую просим у камеры: 3:4, вертикально.
 *
 * Браузер сам выбирает режим сенсора, и выборы у телефонов разные: один отдаёт
 * 16:9, другой 4:3. От этого зависит, влезет ли видоискатель в ширину экрана:
 * поток 9:16 слишком высок и упирается в высоту, теряя ширину. 3:4 — родная
 * форма большинства сенсоров, и она заметно ближе к форме места, которое у нас
 * есть. Телефон без такого режима просто отдаст ближайший: это пожелание,
 * а не требование.
 */
export const CAPTURE_ASPECT = 3 / 4;

/**
 * Камеру предлагаем, только если браузер её отдаст.
 *
 * `getUserMedia` живёт лишь в защищённом контексте: по `https://` и на `localhost`.
 * По адресу вида `http://192.168.x.x` его нет вовсе, и кнопка «снять» там —
 * обещание, которого не сдержать.
 */
export function cameraSupported(
  media: MediaDevices | undefined,
  secure: boolean,
): boolean {
  return Boolean(secure && media && typeof media.getUserMedia === "function");
}

/**
 * Просим заднюю камеру и наибольшее разрешение, какое даст аппарат.
 *
 * Размер экрана здесь ни при чём: на экран мы только смотрим, а режем кадр
 * из настоящих пикселей потока. Знак через дорогу переживает кадрирование
 * только за счёт них.
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

/** Умеет ли эта камера фонарик. На iOS Safari — нет, и кнопки быть не должно. */
export function torchSupported(track: MediaStreamTrack | null | undefined): boolean {
  if (!track || typeof track.getCapabilities !== "function") return false;
  const caps = track.getCapabilities() as MediaTrackCapabilities & { torch?: boolean };
  return caps.torch === true;
}

/** Что писать человеку, когда камера не открылась. Причина важна: «запретили»
 *  и «камеры нет» лечатся по-разному, а браузер сообщает их одним исключением. */
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
