// Решения главного экрана: что написано на чипе момента и чем начинается путь
// к разбору. Ни разметки, ни браузера — только то, что можно проверить тестом
// (решение 151).

import { when } from "./when";

/** Края окна продукта. Календарь считается кодом и покрывает 2026-2030;
 *  выбрать момент вне окна нельзя, потому что отвечать за него нечем. */
export const MOMENT_FROM = "2026-01-01T00:00";
export const MOMENT_TO = "2030-12-31T23:59";

/** Заголовок первого запуска. */
export const HEADLINE = "Snap a sign.";

/**
 * Что человек получит — по строке на обещание.
 *
 * Набор один на оба состояния главного экрана, и это главное здесь свойство.
 * Первое замечание разработчика с телефона было ровно о том, что два состояния
 * говорили разными словами об одном и том же и читались как разные приложения.
 * Повторённая по файлам строка разойдётся снова — вопрос лишь в том, когда.
 */
export const BENEFITS = [
  "Know who can park here.",
  "See your parking window.",
  "Read plate by plate.",
];

/**
 * Заголовок главного экрана, когда ключ есть.
 *
 * Ведёт ИСХОДОМ, а не глаголом. Дословный `Snap a sign.` с первого запуска взять
 * было нельзя: кнопка внизу того же экрана говорит `Scan a sign`, и два почти
 * одинаковых слова в пяди друг от друга читаются как заикание. На первом запуске
 * такой кнопки нет, поэтому там глагол уместен, а здесь — нет.
 */
export const HOME_HEADLINE = BENEFITS[1];

/** Строки под ним — те же обещания, минус поднятое в заголовок. */
export const HOME_LINES = [BENEFITS[0], BENEFITS[2]];

/**
 * Три коротких обещания о том, что происходит с ключом и снимком.
 *
 * «Key stays on your device» — про умолчание (решение 146): переключатель
 * «запомнить» включён, и ключ сохраняется. Выключить его можно там же,
 * в настройках, и полное правило сказано именно там: короткой метке оговорку
 * не унести, а врать она не должна.
 */
export const ASSURANCES = [
  "Key stays on your device",
  "No ParkRead server",
  "Only the framed part is sent",
];

export type Chip = { label: string; canReset: boolean };

/**
 * Чип момента.
 *
 * Пусто значит «сейчас», и время берётся в минуту отправки. Поэтому в покое чип
 * говорит СЛОВО, а не застывший отсчёт: нарисованное «now · Tue 19:38» пришлось бы
 * обновлять каждую минуту, иначе оно врёт тому, кто простоял у знака пять минут.
 */
export function momentChip(moment: string): Chip {
  const chosen = moment.trim().length > 0;
  return { label: chosen ? when(moment) : "Now", canReset: chosen };
}

export type Entry = {
  /** Что стоит основным действием. */
  primary: "scan" | "pick";
  primaryLabel: string;
  primaryNote: string;
  /** Тихая ссылка под ним; без камеры её нет — выбор снимка уже наверху. */
  secondary: string | null;
  /** Почему съёмки нет. Пусто — камера на месте. */
  unavailable: string | null;
};

/**
 * Чем начинается путь к разбору.
 *
 * Камера — обычный случай: приложением пользуются с телефона. Но `getUserMedia`
 * живёт только в защищённом контексте, и по адресу вида `http://192.168.x.x` его
 * нет вовсе. Мёртвой кнопке там не место: основным действием становится выбор
 * снимка, а причина названа вслух — иначе человек решит, что сломались мы.
 */
export function entryActions(cameraAvailable: boolean): Entry {
  return cameraAvailable
    ? {
      primary: "scan",
      primaryLabel: "Scan a sign",
      primaryNote: "Opens the camera",
      secondary: "Pick a photo you already took",
      unavailable: null,
    }
    : {
      primary: "pick",
      primaryLabel: "Pick a photo",
      primaryNote: "Choose one you already took",
      secondary: null,
      unavailable: "The camera needs a secure address, so it is unavailable here.",
    };
}
