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

// Модель одна: отсев и разбор идут в неё (решение 134). Они и прежде шли в одну
// и ту же, а второе поле спрашивало у человека то, чего он не знает.
export type Provider = {
  baseUrl: string;
  visionModel: string;
};

export const EMPTY_PROVIDER: Provider = { baseUrl: "", visionModel: "" };

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
  // Адрес провайдера и название модели — не секрет, и помнить их полезно
  // всегда: без них ключ бесполезен, а вводить их заново у знака мучительно.
  store.setItem(PROVIDER, JSON.stringify(settings.provider));
}

/** Забыть ключ везде: и в памяти, и на устройстве. */
export function forget(store: Store | null): Settings {
  store?.removeItem(KEY);
  return { ...EMPTY_SETTINGS, provider: load(store).provider };
}

/** Готов ли браузер отвечать сам: есть ключ, адрес и модель. */
export function canAnswerHere(s: Settings): boolean {
  return Boolean(s.apiKey && s.provider.baseUrl && s.provider.visionModel);
}

/** Чего не хватает — списком, чтобы экран сказал это словами, а не «ошибка». */
export function missing(s: Settings): string[] {
  const out: string[] = [];
  if (!s.apiKey) out.push("your API key");
  if (!s.provider.baseUrl) out.push("the provider address");
  if (!s.provider.visionModel) out.push("the model name");
  return out;
}

// --- что показывает экран настроек ------------------------------------------
//
// Решения экрана живут здесь, рядом с самими настройками, а не в разметке:
// среды DOM в наборе нет (решение 151), и проверить их можно только так.

/** Строка настроек в покое: что видно и как называется действие справа. */
export type Row = {
  /** Значение, маска или «ещё не задано». */
  shown: string;
  /** Пока значения нет — «Add», дальше — «Edit». Не «Replace»: заменяют вещь,
   *  а правят значение, и человек делает именно второе. */
  action: "Add" | "Edit";
  filled: boolean;
};

export const NOT_SET = "Not set";

/** Маска ключа — постоянной длины. Число точек по длине ключа показывало бы
 *  рядом с платным средством его размер: мелочь, которую незачем сообщать
 *  ни соседу в метро, ни скриншоту. */
export const MASK = "••••••••••••••••";

export function row(value: string, { secret = false } = {}): Row {
  const filled = value.trim().length > 0;
  return {
    shown: !filled ? NOT_SET : secret ? MASK : value,
    action: filled ? "Edit" : "Add",
    filled,
  };
}

/** Переключатель «запомнить на этом устройстве» (решение 146).
 *
 *  Пока поле ключа пусто, он показывает умолчание — включён, — но нажать его
 *  нельзя: выбирать ещё нечего. С первым введённым знаком он оживает, оставаясь
 *  включённым, и выключить его можно ДО сохранения. Умолчание тем самым
 *  «запомнить», но выбор не отнят: он на том же экране, в ту минуту, когда
 *  сохранять ещё нечего. */
export function rememberToggle(draftKey: string, chosen?: boolean):
    { on: boolean; disabled: boolean } {
  const empty = draftKey.trim().length === 0;
  return { on: empty ? true : chosen ?? true, disabled: empty };
}

/** Настроено ли приложение, и если нет — чего не хватает, словами. */
export type Readiness = { ready: boolean; chip: string; missing: string[] };

export function readiness(s: Settings): Readiness {
  const gaps = missing(s);
  return {
    ready: gaps.length === 0,
    // Метка отвечает на вопрос «всё ли готово»: «всё» либо «пойди настрой».
    // «Configure» — глагол: он говорит, что делать, а не только чего нет.
    // Красным не красится ни то, ни другое: красный в продукте значит
    // «знак запрещает», и больше ничего.
    chip: gaps.length === 0 ? "All set" : "Configure",
    missing: gaps,
  };
}

/** Показывать ли «Forget key». Кнопке, которой нечего делать, на экране
 *  не место: она обещает действие и не совершает его. */
export const canForget = (s: Settings): boolean => s.apiKey.trim().length > 0;
