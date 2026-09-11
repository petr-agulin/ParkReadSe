// Блок «Parking window»: вертикальная шкала от начала стоянки до её конца.
//
// Два узла — начало и конец — и цветная линия между ними. Она отвечает на вопрос
// «сколько я здесь простою» одним взглядом, тогда как список периодов заставлял
// складывать ответ из строк.
//
// Цвет линии решает бэкенд полем `tone`: платность — свойство правила, а не оформления.
// Оранжевая — платно, зелёная — плата не указана, красная пунктиром — стоять нельзя.
//
// **Геометрия здесь содержательна.** Значок и линия стоят в одной колонке шириной
// ровно в значок, а у отрезка нет вертикальных отступов — поэтому линия упирается
// в оба значка вплотную и одинаково сверху и снизу. Стоит добавить отступ с одной
// стороны, и шкала перестаёт читаться как непрерывная.

import { isStayLimit, lasting, splitWindow } from "../lib/period";
import type { DayNote, Period, Regime, Term } from "../types";
import { when } from "../lib/when";
import SignIcon from "./SignIcon";

const COLUMN = "w-9 shrink-0";      // ширина значка: линия идёт ровно под ним

// Линия и подпись отрезка — одно и то же утверждение, поэтому и цвет у них один.
// Оттенок 700 взят от подписи: 500 на белом бледнее текста рядом, и линия читалась
// как украшение, а не как часть ответа.
const LINE: Record<string, string> = {
  paid: "bg-amber-700",
  free: "bg-emerald-700",
  uncertain: "bg-amber-700",
  not_stated: "",                   // знак молчит — линии нет, только пунктир
  prohibited: "",                   // запрет — пунктир, а не сплошная заливка
};

// Пунктир значит две разные вещи, и различает их цвет: красный — стоять нельзя,
// цветной по тону — стоять можно, но за правило продукт не ручается (разбор
// неполон или знак отсылает к условиям вне себя, как `Privat parkering`).
const DASH: Record<string, string> = {
  prohibited: "border-red-700",
  paid: "border-amber-700",
  free: "border-emerald-700",
  uncertain: "border-amber-700",
  not_stated: "border-slate-400",
};

const HEADLINE: Record<string, string> = {
  paid: "text-amber-700",
  free: "text-emerald-700",
  uncertain: "text-amber-700",
  not_stated: "text-slate-600",
  prohibited: "text-red-700",
};

// Подпись класса дня — серым и полужирным, одинаково для красных дней и канунов.
// Цветом её пробовали различать, и разработчик это отверг: красный на этой шкале
// уже значит «стоять нельзя», а подпись под датой — не правило, а пояснение.
// Выделяет её начертание, а не цвет.
const DAY_NOTE = "text-xs font-semibold leading-tight text-slate-600";

// Кусок линии в колонке значка. Узел бывает выше значка — под датой стоит ещё
// и класс дня, — и без этих кусков линия соседнего отрезка не доставала бы
// до значка, а шкала переставала бы читаться как непрерывная.
function Rail({ p }: { p?: Period }) {
  if (!p) return <span className="flex-1" />;
  const dashed = p.tone === "prohibited" || p.tone === "not_stated" || p.certain === false;
  return dashed ? (
    <span className={`w-0 flex-1 border-l-[3px] border-dashed ${DASH[p.tone] ?? "border-red-700"}`} />
  ) : (
    <span className={`w-[3px] flex-1 ${LINE[p.tone] ?? "bg-slate-400"}`} />
  );
}


function Node({
  kind, title, at, note, above, below,
}: {
  kind: "start" | "end"; title: string; at: string;
  note?: DayNote | null; above?: Period; below?: Period;
}) {
  return (
    // Значок центрируется, а остаток высоты занимают куски линии: узел с третьей
    // строкой выше значка, и без них между линией и значком открывался зазор.
    <div className="flex items-stretch gap-3">
      <div className={`${COLUMN} flex flex-col items-center`}>
        <Rail p={above} />
        <SignIcon kind={kind} />
        <Rail p={below} />
      </div>
      <div className="min-w-0 self-center">
        <p className="font-medium leading-tight text-slate-900">{title}</p>
        <p className="text-xs leading-tight text-slate-500">{at}</p>
        {/* Класс дня — почему на знаке действуют именно эти часы. Текст с бэкенда:
            какой день красный, вёрстка не знает и знать не должна. */}
        {note && <p className={DAY_NOTE}>{note.text}</p>}
      </div>
    </div>
  );
}


function Connector({ at, note, above, below }: {
  at: string; note?: DayNote | null; above?: Period; below?: Period;
}) {
  // Стык двух отрезков — момент, когда правило меняется. Значок отмечает его
  // на линии, а время рядом объясняет, чем именно этот стык является: без него
  // значок был бы украшением, а на этой шкале украшений нет.
  return (
    <div className="flex items-stretch gap-3">
      <div className={`${COLUMN} flex flex-col items-center`}>
        <Rail p={above} />
        <SignIcon kind="start" size="small" />
        <Rail p={below} />
      </div>
      <div className="min-w-0 self-center">
        <p className="text-xs leading-tight text-slate-500">{when(at)}</p>
        {note && <p className={DAY_NOTE}>{note.text}</p>}
      </div>
    </div>
  );
}


function Segment({ p, extra }: { p: Period; extra: Term[] }) {
  // Пунктир значит «на это время знак не отвечает»: запрет — своим окном,
  // молчание — тем, что сказать нечего.
  const dashed = p.tone === "prohibited" || p.tone === "not_stated" || p.certain === false;
  return (
    <div className="flex items-stretch gap-3">
      <div className={`${COLUMN} flex justify-center`}>
        {dashed ? (
          <span className={`w-0 border-l-[3px] border-dashed ${DASH[p.tone] ?? "border-red-700"}`} />
        ) : (
          <span className={`w-[3px] ${LINE[p.tone] ?? "bg-slate-400"}`} />
        )}
      </div>
      {/* Отступ задаётся ТЕКСТУ, а не линии. Линия тянется на всю высоту строки,
          поэтому воздух вокруг середины появляется, а связь между значками
          сохраняется: оба конца по-прежнему упираются в них вплотную. */}
      <div className="min-w-0 space-y-1 py-8">
        <p className={`text-sm font-medium leading-tight ${HEADLINE[p.tone] ?? "text-slate-700"}`}>
          {p.headline}
          {/* Период, упирающийся в край горизонта, не имеет известной длительности:
              знак в этот момент ничего не меняет, просто дальше движок не смотрит.
              Найдено на обкатке — знак `007` запрещает стоянку бессрочно, а отрезок
              сообщал «169 h 30 min», то есть выдавал край расчёта за свойство знака.
              Дату продукт здесь скрывал давно (`ends_at_horizon` для того и заведён),
              а длительность — та же утечка, только вторым выходом. */}
          {!p.ends_at_horizon && (
            <>
              <span className="px-1.5" aria-hidden>&#9679;</span>
              <span className="font-normal">
                {lasting(p.minutes)}
                {/* «max» относится к стоянке: столько можно простоять. Там, где
                    знак стоянки не даёт, длительность точная (`lib/period`). */}
                {isStayLimit(p.tone) && " max"}
              </span>
            </>
          )}
        </p>
        {[...(p.notes ?? []), ...extra].map((n) => (
          <p key={n.key} className="text-sm leading-tight text-slate-500">{n.text}</p>
        ))}
      </div>
    </div>
  );
}

export default function PeriodTimeline(
  { regime, showExtent = false }: { regime: Regime; showExtent?: boolean },
) {
  const periods = regime.periods ?? [];
  // Шкалы может не быть, а сказать при этом есть что: знак, который о выбранном
  // моменте молчит, окна не даёт, и вместо шкалы встаёт фраза. Поэтому пусто
  // здесь только тогда, когда пусто и то и другое.
  if (periods.length === 0 && !regime.no_window_text) return null;

  // Запрет перед окном — это ещё не окно, и делит их `lib/period`.
  const { leadIn, window } = splitWindow(periods);
  const last = window.length ? window[window.length - 1] : undefined;

  // Строка под отрезком: кому годится это окно — или какое исключение из запрета
  // называет знак. Ставится ОДИН раз, у отрезка того рода, к которому относится.
  //
  // Место решает смысл, а не порядок: «Visitors only» под «No parking» прочтётся
  // ровно наоборот тому, что на знаке, а исключение из запрета под разрешающим
  // отрезком повиснет без предмета.


  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="font-medium text-slate-800">
        Your parking window
        {/* Участок — рядом с заголовком, а не строкой ниже: на знаке с двумя
            стрелками окон два, и без подписи они выглядят повтором, хотя
            задают разные правила. Показывается там, где различает: когда окно
            не одно или когда стрелка увела участок от самого знака. */}
        {showExtent && (
          <span className="font-normal text-slate-500">
            {" · "}
            {regime.extent_short}
          </span>
        )}
        {/* Кому окно. Стоит после участка: сначала где, потом для кого —
            в таком порядке их и читают. Подпись приходит с бэкенда. */}
        {regime.audience_short && (
          <span className="font-normal text-slate-500">
            {" · "}
            {regime.audience_short}
          </span>
        )}
      </h2>
      {/* Шкалы может не быть вовсе. На знаке арендованных мест «Free parking,
          28 h max» — число не со знака, а из правила 24 часов: чьё это место,
          тот знает срок из договора, а всем прочим стоять нельзя вовсе.
          Рисовать им окно значит предлагать то, чего нет. */}
      {regime.no_window_text ? (
        <p className="mt-2 text-sm text-slate-600">{regime.no_window_text}</p>
      ) : (
      <>
      {/* Подпись отвечает сразу на три недоразумения, найденных на обкатке:
          «первое» — окон будет ещё много, знак после этого не исчезает;
          «от выбранного времени» — момент может быть и загрузкой снимка, и выбранным
          вперёд, и обе формулировки должны оставаться верными;
          «знак действует и дальше» — конец окна не конец возможности стоять. */}
      {/* Подпись — про окно, поэтому и стоит она только там, где окно есть.
          Знак, который сейчас запрещает и ничего не обещает дальше, окна не
          образует: обещать «более окон впереди» под одной красной линией
          значит говорить за знак. */}
      {window.length > 0 && (
        <p className="mb-4 text-sm text-slate-500">
          The first window from your selected start time; the sign carries on
          beyond it, with more windows to follow
        </p>
      )}

      {leadIn.length > 0 && (
        <>
          <Node
            kind="end"
            title="Your selected start time"
            at={when(leadIn[0].start)}
            note={leadIn[0].start_day}
            below={leadIn[0]}
          />
          {leadIn.map((p, n) => (
            <Segment key={`lead-${n}`} p={p} extra={p.aside ?? []} />
          ))}
        </>
      )}

      {window.length > 0 && (
        <>
          <Node
            kind="start"
            title="Window starts"
            at={when(window[0].start)}
            note={window[0].start_day}
            above={leadIn.length ? leadIn[leadIn.length - 1] : undefined}
            below={window[0]}
          />
          {window.map((p, n) => (
            <div key={n}>
              {/* Стык рисуется перед каждым отрезком, кроме первого: первый начинается
                  от узла «Window starts», и второй значок там был бы лишним. */}
              {n > 0 && (
                <Connector at={p.start} note={p.start_day}
                           above={window[n - 1]} below={p} />
              )}
              {/* Что писать под отрезком, решает бэкенд: круг стоящих идёт
                  под отрезками своего рода, примечания участка (`Boende`) —
                  под всеми, а сказанное условием этого же отрезка не повторяется. */}
              <Segment p={p} extra={p.aside ?? []} />
            </div>
          ))}
          {last && (
            <Node kind="end" title="Window ends" at={when(last.end)}
                  note={last.end_day} above={last} />
          )}
        </>
      )}

      {/* Перевод часов. Стоит под шкалой, потому что относится к ней целиком:
          это оговорка о показанных временах, а не свойство отдельного отрезка.
          Появляется, только когда показанный отрезок перевод пересекает. */}
      {regime.clock_change_text && (
        <p className="mt-4 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
          {regime.clock_change_text}
        </p>
      )}
      </>
      )}
    </section>
  );
}
