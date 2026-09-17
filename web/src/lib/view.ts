// Какой экран показывать и куда ведут действия.
//
// Здесь только решения: ни разметки, ни состояния React, ни обращений к браузеру.
// Компонент красит то, что уже решено и проверено здесь, — по тому же правилу,
// по которому слова о знаке живут в `present`, а не в вёрстке. Среды DOM в наборе
// нет вовсе (решение 151), и это единственный способ держать переходы под тестом.

import { canAnswerHere, type Settings } from "./settings";

export type Screen =
  | "first-launch"   // 2f — ключа ещё нет
  | "home"           // 3a — ключ есть
  | "settings"       // 3e
  | "help"           // 2h — где взять ключ
  | "camera"         // 3d
  | "frame"          // 3b — кадрирование
  | "reading";       // 3c — разбор

/** Экраны, доступные без ключа (решение 147).
 *
 *  Снимать и выбирать снимок нельзя: кадр, сделанный без ключа, кончается
 *  сообщением «нужен ключ», а путь, ведущий в тупик, хуже честного «сначала ключ».
 *  Отвергнуто было другое — встречать человека ТРЕБОВАНИЕМ вместо объяснения,
 *  и `2f` объясняет: показывает знак, говорит, что читает, и просит в последнюю
 *  очередь. */
export const WITHOUT_KEY: readonly Screen[] = ["first-launch", "settings", "help"];

/** Начальный экран: без ключа — первый запуск, с ключом — главный.
 *  Это два состояния одного места, а не два разных экрана в пути. */
export function start(settings: Settings): Screen {
  return canAnswerHere(settings) ? "home" : "first-launch";
}

/** Можно ли вообще оказаться на этом экране при таких настройках. */
export function reachable(settings: Settings, screen: Screen): boolean {
  if (!canAnswerHere(settings)) return WITHOUT_KEY.includes(screen);
  // С ключом первого запуска не бывает: его место занимает главный экран.
  return screen !== "first-launch";
}

export type Action =
  | "open-settings"   // таблетка Settings на главном, «Add your key» на 2f
  | "open-help"       // «How keys work, and where to get one»
  | "back"            // стрелка в шапке
  | "scan"            // «Scan a sign» — в видоискатель
  | "pick"            // «Pick a photo you already took» — сразу к рамке
  | "captured"        // спуск нажат: снимок есть, дальше рамка
  | "replace"         // «Replace» на рамке — обратно в камеру
  | "sent"            // кадр ушёл модели, ответ получен
  | "scan-another";   // «Scan another sign» — и стрелка в шапке разбора

/** Где мы сейчас и откуда пришли.
 *
 *  `from` нужен ровно двум экранам — настройкам и помощи: на них попадают
 *  и с первого запуска, и с главного, и «назад» обязан вернуть туда, откуда
 *  человек пришёл. Нарисованная в макете кнопка «Back to Settings» была бы
 *  неправдой в половине случаев, поэтому её и не будет. */
export type View = { screen: Screen; from?: Screen };

const TARGET: Record<Action, Screen | null> = {
  "open-settings": "settings",
  "open-help": "help",
  back: null,           // решается по `from`
  scan: "camera",
  pick: "frame",
  captured: "frame",
  replace: "camera",
  sent: "reading",
  // С разбора уходят снимать следующий знак, а не на главный экран: человек
  // стоит у столба, и следующее его действие — снова камера. На главный ведёт
  // системная кнопка «назад» в браузере.
  "scan-another": "camera",
};

/**
 * Следующий вид. Недостижимый экран не показывается: вид остаётся прежним.
 *
 * Это вторые ворота, а не первые. Первые — сам экран: без ключа на нём нет ни
 * «Scan a sign», ни «Pick a photo», и нажать нечего. Но ворота, которые держатся
 * только на том, что кнопку не нарисовали, держатся на памяти верстальщика.
 */
export function go(view: View, action: Action, settings: Settings): View {
  if (action === "back") {
    // Настройки и помощь возвращают туда, откуда пришли; всё остальное — в начало.
    const to = view.from ?? start(settings);
    return { screen: reachable(settings, to) ? to : start(settings) };
  }
  const to = TARGET[action];
  if (!to || !reachable(settings, to)) return view;
  // Помнит дорогу только тот, кто обязан по ней вернуться.
  return to === "settings" || to === "help"
    ? { screen: to, from: view.screen }
    : { screen: to };
}
