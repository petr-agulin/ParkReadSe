// Две стадии, на которых вызывается модель. Порт `parkread/vision.py`.
//
// `classifyImage` — стадия 0, отсев. `extractSignData` — стадия 1, извлечение.
// Инструментов у модели нет ни на одной; обе возвращают данные, а решения по ним
// принимает код.
//
// Диалект — OpenAI-совместимый: его понимают и Google через совместимый эндпоинт,
// и Mistral, и OpenRouter. Плата за это — провайдер не принимает нашу схему
// и не может заставить модель отвечать строго по ней. Форма объясняется словами
// в промпте, а настоящей гарантией остаётся наш валидатор.
//
// **Здесь впервые в браузере появляется ключ пользователя.** Он уходит ровно
// в одно место — заголовок запроса к провайдеру, — и ни в одно другое: ни в лог,
// ни в сообщение об ошибке, ни в тело отчёта. Тело ошибки провайдера обрезается
// перед показом (решение 125).

import { extractPrompt, triagePrompt } from "./prompts";
import { InvalidModelResponse, parseJson, sign as validateSign,
         triage as validateTriage, type Result } from "./validation";
import type { SignDoc } from "./sign";

export const TIMEOUT_MS = 120_000;

// Коды, при которых повтор осмыслен: провайдер занят или просит подождать.
const RETRY_STATUS = new Set([429, 500, 502, 503, 504]);

// Паузы между попытками. Их длина и задаёт число повторов.
//
// Найдено прогоном: из четырнадцати снимков одиннадцать упали на `503` «high
// demand», и повтор их бы вытянул. `429` — наша спешка, лечится секундами;
// `503` — чужая перегрузка, и снимается она не сразу. Поэтому пауза растёт.
// А `400` или `401` повторять нельзя: там неверный запрос или ключ, и вторая
// попытка — просто вторая трата квоты.
export const RETRY_PAUSE_MS = [20_000, 45_000, 90_000];

export class VisionCallFailed extends Error {}

export type Provider = {
  baseUrl: string;
  apiKey: string;
  triageModel: string;
  visionModel: string;
};

export type Photo = { name: string; data: Blob | File };

async function dataUrl(photo: Photo): Promise<string> {
  // Снимок уходит провайдеру прямо из памяти: временного файла не возникает.
  const buffer = await photo.data.arrayBuffer();
  let binary = "";
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  const mime = photo.data.type || "image/jpeg";
  return `data:${mime};base64,${btoa(binary)}`;
}

const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms));

export type CallResult = { text: string; usage: Record<string, unknown> };

/** Один вызов провайдера, с повторами там, где повтор осмыслен. */
export async function call(provider: Provider, model: string, prompt: string,
                           image: Photo,
                           pause: (ms: number) => Promise<unknown> = sleep,
                           fetchImpl: typeof fetch = fetch): Promise<CallResult> {
  if (!model) throw new VisionCallFailed("Модель не выбрана.");
  if (!provider.baseUrl) throw new VisionCallFailed("Адрес провайдера не задан.");
  if (!provider.apiKey) throw new VisionCallFailed("Ключ не введён.");

  const body = {
    model,
    messages: [{ role: "user", content: [
      { type: "text", text: prompt },
      { type: "image_url", image_url: { url: await dataUrl(image) } },
    ] }],
    temperature: 0,
    response_format: { type: "json_object" },
  };
  const endpoint = provider.baseUrl.replace(/\/+$/, "") + "/chat/completions";

  let why = "";
  let response: Response | null = null;
  let attempt = 0;
  for (; attempt <= RETRY_PAUSE_MS.length; attempt += 1) {
    const stop = new AbortController();
    const timer = setTimeout(() => stop.abort(), TIMEOUT_MS);
    try {
      response = await fetchImpl(endpoint, {
        method: "POST",
        headers: {
          // Единственное место, где ключ покидает устройство.
          Authorization: `Bearer ${provider.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: stop.signal,
      });
    } catch (e) {
      response = null;
      why = `${(e as Error).name}: ${String((e as Error).message).slice(0, 200)}`;
    } finally {
      clearTimeout(timer);
    }

    if (response && response.status === 200) break;
    if (response) {
      // Тело ошибки провайдера ключа не содержит; на всякий случай обрезаем.
      why = `HTTP ${response.status}: ${(await response.text()).slice(0, 400)}`;
      if (!RETRY_STATUS.has(response.status)) break;
    }
    if (attempt < RETRY_PAUSE_MS.length) await pause(RETRY_PAUSE_MS[attempt]);
  }

  if (!response || response.status !== 200) {
    throw new VisionCallFailed(`${why} (попыток: ${Math.min(attempt + 1, RETRY_PAUSE_MS.length + 1)})`);
  }
  const payload = await response.json();
  const text = payload?.choices?.[0]?.message?.content;
  if (typeof text !== "string") {
    throw new VisionCallFailed(
      `неожиданная форма ответа: ${JSON.stringify(payload).slice(0, 400)}`);
  }
  return { text, usage: payload.usage ?? {} };
}

export type TriageOutcome = {
  category: string;
  whatISee: string;
  panelsBelowMainSign: number | null;
  usage: Record<string, unknown>;
  validation: Result | null;
};

export const isParkingSign = (t: TriageOutcome) => t.category === "parking_sign";

export type ExtractOutcome = {
  data: SignDoc | null;
  validation: Result;
  usage: Record<string, unknown>;
};

/** Стадия 0: парковочный ли это знак. Отвечает МЕТКОЙ, а не решением:
 *  останавливать ли конвейер, решает вызывающий код. */
export async function classifyImage(image: Photo, provider: Provider,
                                    deps: Partial<{ pause: (ms: number) => Promise<unknown>;
                                                    fetchImpl: typeof fetch }> = {},
                                   ): Promise<TriageOutcome> {
  const { text, usage } = await call(provider, provider.triageModel, triagePrompt(),
                                     image, deps.pause, deps.fetchImpl);
  const doc = parseJson(text);
  const res = validateTriage(doc);
  const data: any = res.data ?? {};
  return {
    category: String(data.category ?? "unreadable"),
    whatISee: String(data.what_i_see ?? ""),
    panelsBelowMainSign: typeof data.panels_below_main_sign === "number"
      ? data.panels_below_main_sign : null,
    usage,
    validation: res,
  };
}

/** Стадия 1: чтение знака в JSON. `panelsSeen` приходит со стадии отсева —
 *  независимый взгляд на ту же фотографию. */
export async function extractSignData(image: Photo, provider: Provider,
                                      panelsSeen: number | null = null,
                                      deps: Partial<{ pause: (ms: number) => Promise<unknown>;
                                                      fetchImpl: typeof fetch }> = {},
                                     ): Promise<ExtractOutcome> {
  const { text, usage } = await call(provider, provider.visionModel, extractPrompt(),
                                     image, deps.pause, deps.fetchImpl);
  const doc = parseJson(text);
  const res = validateSign(doc, panelsSeen);
  return { data: res.data, validation: res, usage };
}

export { InvalidModelResponse };
