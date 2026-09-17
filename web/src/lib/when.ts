// Как на экране пишется момент времени.
//
// **Часы — двадцатичетырёхчасовые, всегда.** Знак написан именно так: `8-18`,
// `(8-15)`, `00-24`. Ответ про знак, напечатанный в другой записи, заставляет
// читателя переводить одно в другое, стоя у столба, — а ошибка перевода стоит
// штрафа. Найдено разработчиком: телефон показывал «2:00 pm» там, где ноутбук
// показывал «14:00», потому что формат брался у устройства.
//
// **Язык дат закреплён тоже.** Экран продукта английский целиком, и «måndag»
// посреди английских фраз — не локализация, а разнобой: локализован был бы весь
// экран, а не одна строка из двадцати.

const LOCALE = "en-GB";

const FULL: Intl.DateTimeFormatOptions = {
  weekday: "long", day: "numeric", month: "long",
  hour: "2-digit", minute: "2-digit",
  hour12: false, hourCycle: "h23",      // полночь — «00:00», а не «24:00»
};

/**
 * Сокращения дня и месяца.
 *
 * Полные слова («Thursday 17 September») занимают столько, что строка переносится
 * даже на широком телефоне. Довод «внутри фраз сокращения читаются хуже» звучал
 * и был отвергнут разработчиком по делу: эту строку не читают как прозу —
 * её сканируют, стоя у столба.
 *
 * У «May» точки нет: сокращать в нём нечего.
 */
const SHORT: Record<string, string> = {
  Monday: "Mon.", Tuesday: "Tue.", Wednesday: "Wed.", Thursday: "Thu.",
  Friday: "Fri.", Saturday: "Sat.", Sunday: "Sun.",
  January: "Jan.", February: "Feb.", March: "Mar.", April: "Apr.",
  May: "May", June: "Jun.", July: "Jul.", August: "Aug.",
  September: "Sep.", October: "Oct.", November: "Nov.", December: "Dec.",
};

/** Момент словами: «Fri. 30 Oct. at 14:00». */
export function when(iso: string): string {
  return new Date(iso).toLocaleString(LOCALE, FULL)
    .replace(/[A-Z][a-z]+/g, (word) => SHORT[word] ?? word);
}
