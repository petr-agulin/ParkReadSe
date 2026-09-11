// Ключ пользователя и адрес провайдера.
//
// **Решение 125.** Ключ живёт в памяти вкладки. На устройстве он сохраняется
// только по явной галочке «запомнить», и её же можно снять — тогда сохранённое
// стирается. Решать за человека, где лежать его платному ключу, продукт не вправе.
//
// Ключ уходит ровно в одно место — заголовок запроса к провайдеру (`vision.ts`).
// Ни в лог, ни в отчёт, ни в адрес он не попадает, и на чужой сервер не уходит
// вовсе: у этого приложения своего сервера нет.

const KEY = "parkread.key";
const PROVIDER = "parkread.provider";

export type Provider = {
  baseUrl: string;
  triageModel: string;
  visionModel: string;
};

export const EMPTY_PROVIDER: Provider = { baseUrl: "", triageModel: "", visionModel: "" };

/** Хранилище, которое может отсутствовать: приватная вкладка, запрет сайту,
 *  старый телефон. Продукт от этого не ломается — он просто не помнит. */
export type Store = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

export function browserStore(): Store | null {
  try {
    const probe = "parkread.probe";
    window.localStorage.setItem(probe, "1");
    window.localStorage.removeItem(probe);
    return window.localStorage;
  } catch {
    return null;               // хранить негде — значит не храним
  }
}

export type Settings = {
  apiKey: string;
  remember: boolean;
  provider: Provider;
};

export const EMPTY_SETTINGS: Settings = {
  apiKey: "", remember: false, provider: EMPTY_PROVIDER,
};

/** Что удалось вспомнить при открытии страницы. */
export function load(store: Store | null): Settings {
  if (!store) return { ...EMPTY_SETTINGS };
  const apiKey = store.getItem(KEY) ?? "";
  let provider = EMPTY_PROVIDER;
  try {
    const raw = store.getItem(PROVIDER);
    if (raw) provider = { ...EMPTY_PROVIDER, ...JSON.parse(raw) };
  } catch {
    provider = EMPTY_PROVIDER;      // испорченная запись — как её отсутствие
  }
  return { apiKey, remember: Boolean(apiKey), provider };
}

/** Сохранить то, что просили сохранить. Ключ — только при `remember`;
 *  снятая галочка стирает сохранённое немедленно, а не при следующем запуске. */
export function save(store: Store | null, settings: Settings): void {
  if (!store) return;
  if (settings.remember && settings.apiKey) store.setItem(KEY, settings.apiKey);
  else store.removeItem(KEY);
  // Адрес провайдера и названия моделей — не секрет, и помнить их полезно
  // всегда: без них ключ бесполезен, а вводить их заново у знака мучительно.
  store.setItem(PROVIDER, JSON.stringify(settings.provider));
}

/** Забыть ключ везде: и в памяти, и на устройстве. */
export function forget(store: Store | null): Settings {
  store?.removeItem(KEY);
  return { ...EMPTY_SETTINGS, provider: load(store).provider };
}

/** Готов ли браузер отвечать сам: есть ключ, адрес и обе модели. */
export function canAnswerHere(s: Settings): boolean {
  return Boolean(s.apiKey && s.provider.baseUrl
                 && s.provider.triageModel && s.provider.visionModel);
}

/** Чего не хватает — списком, чтобы экран сказал это словами, а не «ошибка». */
export function missing(s: Settings): string[] {
  const out: string[] = [];
  if (!s.apiKey) out.push("your API key");
  if (!s.provider.baseUrl) out.push("the provider address");
  if (!s.provider.triageModel || !s.provider.visionModel) out.push("the model names");
  return out;
}
