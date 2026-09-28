// What the person reads while a sign is being read, and when the reading fails.
//
// Step 16. The provider answered `503` four times, the app gave up after two and a
// half minutes, and all that time the button said "Reading…" and nothing more. The
// message it then wrote was raw - `HTTP 503: {…} (attempts: 4)` - and stood below the
// screen, where nobody scrolls. The words are chosen here, by the KIND of failure:
// the provider's own text differs from provider to provider and is not shown as the
// message, only under "Details".

import { InvalidModelResponse, VisionCallFailed, APP_PATIENCE,
         type Failure } from "./vision";
import type { Progress } from "./pipeline";

export type Trouble = {
  /** One sentence the person can act on. */
  message: string;
  /** Whether the way out lies in the settings - the screen offers a link there. */
  settings: boolean;
  /** What exactly happened, for whoever wants it. Truncated provider text, never
   *  the key (decision 125). */
  details: string | null;
};

const SECONDS = Math.round(APP_PATIENCE.timeoutMs / 1000);

const SAID: Record<Exclude<Failure, "settings" | "cancelled">, Omit<Trouble, "details">> = {
  key: { message: "The provider did not accept your key.", settings: true },
  limit: { message: "Your provider's request limit is used up. Wait a minute and try "
                    + "again, or check your plan with the provider.", settings: false },
  busy: { message: "The provider is overloaded right now. Try again in a few minutes.",
          settings: false },
  timeout: { message: `The provider did not answer within ${SECONDS} seconds. Try again `
                      + "in a few minutes.", settings: false },
  network: { message: "Could not reach the provider. Check your internet connection, "
                      + "and the provider address in Settings.", settings: true },
  reply: { message: "The model's answer could not be understood. Try again.",
           settings: false },
  other: { message: "The provider returned an error. Try again, or check your key, the "
                    + "provider address and the model in Settings.", settings: true },
};

/** A failure in words. `null` when there is nothing to say: the person stopped it. */
export function explain(error: unknown): Trouble | null {
  if (error instanceof VisionCallFailed) {
    if (error.kind === "cancelled") return null;
    // Nothing was sent: the message is already ours, in the words the settings use.
    if (error.kind === "settings") {
      return { message: error.message, settings: true, details: null };
    }
    // The whole story in a line where there is one: the last attempt alone can
    // mislead (steps 16b, 16c).
    return { ...SAID[error.kind], details: error.summary ?? error.message };
  }
  if (error instanceof InvalidModelResponse) {
    return { ...SAID.reply, details: error.message };
  }
  // Not the provider at all - something in the app itself. Still a sentence, and the
  // rest under "Details".
  const details = error instanceof Error ? error.message : String(error);
  return { message: "Something went wrong while reading the sign. Try again.",
           settings: false, details: details || null };
}

/** The provider's address as a person would recognise it: the host, no path. */
export function hostOf(baseUrl: string): string {
  try {
    return new URL(baseUrl).host || baseUrl;
  } catch {
    return baseUrl;
  }
}

const WHY_WAITING: Record<Failure, string> = {
  key: "The provider refused the request.",
  limit: "The provider asks to slow down.",
  busy: "The provider is busy.",
  timeout: "The provider did not answer.",
  network: "Could not reach the provider.",
  reply: "The provider's answer could not be read.",
  settings: "The provider refused the request.",
  cancelled: "The provider refused the request.",
  other: "The provider refused the request.",
};

/** The line on the card while the reading is under way. `elapsedMs` is how long ago
 *  this progress arrived: the wait before a retry counts down by it (step 16c) - a
 *  figure that stood still read as attempts flickering past rather than as waiting. */
export function progressLine(progress: Progress, baseUrl: string, elapsedMs = 0): string {
  const { stage, retry } = progress;
  if (retry) {
    const left = Math.ceil((retry.inMs - elapsedMs) / 1000);
    const when = left > 0 ? `in ${left} s` : "now";
    return `${WHY_WAITING[retry.kind]} Trying again ${when} (attempt ${retry.next}).`;
  }
  const doing = stage === "check" ? "check the photo" : "read the sign";
  return `Asking the AI model at ${hostOf(baseUrl)} to ${doing}…`;
}
