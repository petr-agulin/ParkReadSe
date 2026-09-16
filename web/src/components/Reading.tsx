// Экран 3c — разбор знака.
//
// **Ответ идёт перед доказательством** (решение 149): кому отведены места, затем
// окно стоянки, и только потом — что именно прочитано с табличек. Человек стоит
// у знака и хочет ответ; реконструкция нужна ему, чтобы этот ответ проверить,
// а не вместо него.
//
// Сами карточки рисуют прежние компоненты. Здесь — порядок, чипы перехода
// и та оговорка, которая обязана стоять ВЫШЕ окна.

import { readFor } from "../lib/reading";
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
};

const JUMPS: { id: string; label: string }[] = [
  { id: "who", label: "Who" },
  { id: "window", label: "Window" },
  { id: "plates", label: "Plates" },
];

export default function Reading({ data, preview, rules, onAnother }: Props) {
  const c = data.completeness;

  return (
    <ErrorBoundary>
      <section className="flex flex-col gap-3.5">
        {/* Чипы перехода: разбор длинный, и листать его до нужного места —
            работа, которую экран может взять на себя. «Window» ведёт к первой
            карточке окна: их бывает несколько. */}
        <nav className="flex gap-2">
          {JUMPS.map((j) => (
            <a
              key={j.id}
              href={`#${j.id}`}
              className="flex-1 rounded-full bg-ground py-2.5 text-center text-label
                         font-bold text-ink-2 shadow-chip"
            >
              {j.label}
            </a>
          ))}
        </nav>

        <div id="who">
          <WhoCanPark regimes={data.regimes} />
        </div>

        {/* На какой момент посчитан ответ — и чьё решение. Момент выбирается
            на главном экране, и разбор «на 07:00» иначе не отличить от разбора
            «на сейчас». */}
        <p className="px-1.5 text-label text-ink-3">{readFor(data.moment)}</p>

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
              showExtent={new Set(data.regimes.map((x) => x.extent)).size > 1
                          || r.extent !== "here"}
            />
          ))}
        </div>

        <div id="plates">
          <WhatWeSaw data={data} preview={preview} rules={rules} />
        </div>

        <button
          type="button"
          onClick={onAnother}
          className="rounded-button-sm bg-accent py-4 text-body font-bold text-on-dark"
        >
          Read another sign
        </button>
      </section>
    </ErrorBoundary>
  );
}
