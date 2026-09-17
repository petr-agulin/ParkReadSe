// Экран 3c — разбор знака.
//
// **Ответ идёт перед доказательством** (решение 149): окно стоянки, затем кому
// отведены места, и только потом — что именно прочитано с табличек. Человек стоит
// у знака и хочет ответ; реконструкция нужна ему, чтобы этот ответ проверить,
// а не вместо него.
//
// Два блока ответа поменялись местами по слову разработчика; суть решения 149
// цела — доказательство по-прежнему последнее.
//
// Сами карточки рисуют прежние компоненты. Здесь — порядок и та оговорка,
// которая обязана стоять ВЫШЕ окна.

import { firstWindow, readFor } from "../lib/reading";
import type { Analysis, GeneralRule } from "../types";
import ErrorBoundary from "./ErrorBoundary";
import PeriodTimeline from "./PeriodTimeline";
import WhatWeSaw from "./WhatWeSaw";
import WhoCanPark from "./WhoCanPark";

type Props = {
  data: Analysis;
  preview: string | null;
  rules: GeneralRule[];
  onAnother: () => void;
  /** Стрелка в шапке. Ведёт туда же, куда кнопка внизу, — в камеру:
   *  с разбора уходят снимать следующий знак. */
  onBack: () => void;
};

export default function Reading({ data, preview, rules, onAnother, onBack }: Props) {
  const c = data.completeness;
  // Первой рисуется не обязательно первый режим: режим без периодов и без
  // объяснения карточки не даёт вовсе. Строку момента вешаем на ту, что видна,
  // и какая это — решает `lib/reading`, а не эта разметка.
  const firstCard = firstWindow(data.regimes);

  return (
    <ErrorBoundary>
      <section className="flex flex-col gap-3.5">
        {/* Навигация как на камере. Стрелка шлёт то же действие, что и кнопка
            внизу: с разбора уходят снимать следующий знак, а не на главный. */}
        <div className="flex items-center gap-3.5">
          <button
            type="button"
            onClick={onBack}
            aria-label="Back"
            className="flex h-10 w-10 items-center justify-center rounded-full bg-chip
                       text-lg font-semibold text-ink-2"
          >
            ‹
          </button>
          <span className="flex-1 text-nav font-bold text-ink-strong">Sign reading</span>
        </div>

        {/* Оговорка стоит НАД окном, потому что оговаривает именно его: уехав
            в карточку «что прочитано», она оказалась бы ниже того, к чему
            относится. Остальная полнота живёт там, внизу. */}
        {c.may_hide_prohibition && (
          <p className="rounded-card-sm bg-danger-bg p-4 text-body font-semibold text-deny">
            An unread panel may carry a prohibition, so no period below is presented
            as permitted.
          </p>
        )}

        {/* Формулировка приходит из ответа, а не живёт в вёрстке: место для слов
            о знаке — рядом с остальными, в `present`. */}
        {data.has_answer && data.note && (
          <p className="rounded-card-sm bg-ground p-4 text-label text-ink-2 shadow-card">
            {data.note.text}
          </p>
        )}

        {/* Одна карточка окна на каждый режим: стрелки делят знак на участки,
            адресаты — на круги, и у каждого своё окно. */}
        <div id="window" className="flex flex-col gap-3.5">
          {data.regimes.map((r, i) => (
            <PeriodTimeline
              key={i}
              regime={r}
              momentLine={i === firstCard ? readFor(data.moment) : undefined}
              showExtent={new Set(data.regimes.map((x) => x.extent)).size > 1
                          || r.extent !== "here"}
            />
          ))}
        </div>

        {/* Адресаты — под окном: слово разработчика. Суть решения 149 цела —
            таблички по-прежнему последние, доказательство идёт после ответа. */}
        <div id="who">
          <WhoCanPark regimes={data.regimes} />
        </div>

        <div id="plates">
          <WhatWeSaw data={data} preview={preview} rules={rules} />
        </div>

        <button
          type="button"
          onClick={onAnother}
          className="rounded-button-sm bg-accent py-4 text-body font-bold text-on-dark"
        >
          Scan another sign
        </button>
      </section>
    </ErrorBoundary>
  );
}
