// Решения экрана разбора: как выглядит строка таблички, чем подписана уверенность
// и на какой момент посчитан ответ.
//
// Ни разметки, ни браузера. Компонент красит то, что решено здесь (решение 151).

import type { Analysis, Meaning, Panel } from "../types";
import { when } from "./when";

/**
 * Одно значение таблички строкой.
 *
 * Код идёт в скобках после названия — как на самом знаке. `continues` значит,
 * что подпись продолжает заголовок одним предложением: «No parking (C35) on
 * Thursdays between 10:00 and 14:00», а не двумя обрубками.
 */
export function meaningLine(m: Meaning): string {
  const head = m.code ? `${m.label} (${m.code})` : m.label;
  if (!m.short) return head;
  return m.continues ? `${head} ${m.short}` : `${head}. ${m.short}`;
}

export type PlateRow = {
  /** Слева: то, что написано на табличке. У таблички без текста — её название. */
  label: string;
  /** Справа: что это значит. Плюс остаток, который истолковать не удалось. */
  values: string[];
  /**
   * Подпись уходит на свою строку, а значения идут списком.
   *
   * Строка «подпись → значение» хороша, пока значение одно. Дальше она лжёт
   * формой: три смысла, втиснутые в одну ячейку, читаются как один длинный.
   * Так же и с табличкой, которая правила не несёт: пометку об этом нельзя
   * подавать как её значение.
   */
  stacked: boolean;
};

export function plateRow(panel: Panel): PlateRow {
  const values = panel.meanings.map(meaningLine);
  // Подпись о непонятом — не значение таблички, но и терять её нельзя:
  // пустая панель без неё однажды оставила на экране голую рамку.
  if (panel.not_interpreted_text) values.push(panel.not_interpreted_text);

  // У таблички-пиктограммы текста нет вовсе: подписью становится её название.
  const label = panel.text.trim() || panel.meanings[0]?.label || `Panel ${panel.index}`;

  return { label, values, stacked: values.length > 1 || !panel.carries_rule };
}

/** Уверенность в шапке карточки «что прочитано». Тон решает бэкенд. */
export function confidenceLabel(c: Analysis["completeness"]): {
  text: string; tone: "good" | "caution" | "bad";
} {
  return { text: `${Math.round(c.confidence * 100)}% confident`, tone: c.tone };
}

/**
 * На какой момент посчитан ответ — и чьё решение.
 *
 * Момент выбирается на главном экране, поэтому ответ обязан назвать его вслух:
 * иначе разбор «на 07:00» невозможно отличить от разбора «на сейчас». Вторая
 * половина строки — не вежливость: продукт читает знак, а не разрешает стоянку.
 */
export function readFor(moment: string): string {
  return `Read for ${when(moment)}. Judgement is yours.`;
}
