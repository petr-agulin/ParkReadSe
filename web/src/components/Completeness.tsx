// Полнота разбора: сколько знака удалось прочитать и чему это мешает.
//
// Живёт ВНУТРИ блока «что сервис увидел», сразу под его заголовком и без рамки.
// Это не отдельный вывод, а оговорка к тому, что показано ниже, и своя рамка
// делала её громче самого разбора.
//
// Здесь же неопределённости движка: тот же разговор о том, чему в ответе нельзя
// верить целиком.
//
// Ни одна фраза о смысле знака здесь не сочиняется — тексты приходят с бэкенда.

import type { Analysis } from "../types";

// Цвет решает бэкенд (`tone`), вёрстка только красит: зелёный — прочитано всё
// и ни один сигнал уверенность не снизил; жёлтый — ответ есть, но с оговоркой;
// красный — ответа нет. Оттенки 700 взяты ради читаемости на белом: 500 на светлом
// фоне уже плохо различим, а строку эту читают мельком.
const TONE: Record<string, string> = {
  good: "text-emerald-700",
  // `amber-700` — коричнево-оранжевый, и рядом с малиновым `rose-700` мелким
  // кеглем читается как тот же красный. Жёлтый берём золотой (`yellow-600`),
  // а тревожный — чистый красный: разные тона важнее точного попадания в палитру.
  caution: "text-yellow-600",
  bad: "text-red-700",
};

export default function Completeness({ data }: { data: Analysis }) {
  const c = data.completeness;
  const uncertainties = data.uncertainties ?? [];
  const tone = TONE[c.tone] ?? TONE.caution;

  return (
    <div className="mb-3">
      <p className={`text-xs font-medium ${tone}`}>
        {c.category_text} <span className="px-0.5 opacity-40">|</span> confidence{" "}
        {(c.confidence * 100).toFixed(0)}%
      </p>

      {c.may_hide_prohibition && (
        <p className="mt-1 text-sm font-medium text-rose-700">
          An unread panel may carry a prohibition, so no period below is presented
          as permitted.
        </p>
      )}

      {c.reasons.length > 0 && (
        <ul className="mt-1 space-y-0.5 text-xs text-slate-600">
          {/* Причина без подписи не показывается: служебному слову на странице
              не место. Что подпись потерялась, ловит проверка на стороне API. */}
          {c.reasons.filter((r) => r.text).map((r) => (
            <li key={r.token}>{r.text}</li>
          ))}
        </ul>
      )}

      {uncertainties.length > 0 && (
        <>
          <p className="mt-1 text-xs font-medium text-slate-700">Left undetermined</p>
          <ul className="space-y-0.5 text-xs text-slate-600">
            {uncertainties.map((u) => (
              <li key={u.token}>{u.text}</li>
            ))}
          </ul>
        </>
      )}

    </div>
  );
}
