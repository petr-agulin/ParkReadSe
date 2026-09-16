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
  good: "text-free",
  // Оговорка и тревога обязаны различаться мелким кеглем: прежние оттенки
  // из палитры сборщика в этом размере сливались в один красный. Теперь оба
  // цвета — токены смысла, и разводит их тон, а не насыщенность.
  caution: "text-fee",
  bad: "text-deny",
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

      {/* Оговорка о непрочитанной панели живёт НЕ здесь, а на экране разбора,
          над карточкой окна: она оговаривает шкалу, и ниже шкалы от неё не было
          бы толку. Здесь остаётся полнота — причины и неопределённости. */}

      {c.reasons.length > 0 && (
        <ul className="mt-1 space-y-0.5 text-xs text-ink-2">
          {/* Причина без подписи не показывается: служебному слову на странице
              не место. Что подпись потерялась, ловит проверка на стороне API. */}
          {c.reasons.filter((r) => r.text).map((r) => (
            <li key={r.token}>{r.text}</li>
          ))}
        </ul>
      )}

      {uncertainties.length > 0 && (
        <>
          <p className="mt-1 text-xs font-medium text-ink-2">Left undetermined</p>
          <ul className="space-y-0.5 text-xs text-ink-2">
            {uncertainties.map((u) => (
              <li key={u.token}>{u.text}</li>
            ))}
          </ul>
        </>
      )}

    </div>
  );
}
