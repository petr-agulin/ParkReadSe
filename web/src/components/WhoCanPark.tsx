// Кому отведены места.
//
// **Это подпись, а не проверка.** Продукт называет круг и останавливается: относится
// ли к нему человек у знака, знает только он сам (`PROJECT_BRIEF.md`). Поэтому здесь
// не бывает «вам можно» и «вам нельзя» — только то, что говорит сам знак.
//
// Круг приходит с бэкенда готовой строкой из справочника. Если знак никого не сужает,
// там стоит его собственное значение: `P` отведён всем зарегистрированным
// транспортным средствам.

import { distinctCircles } from "../lib/circles";
import type { Regime } from "../types";

export default function WhoCanPark({ regimes }: { regimes: Regime[] }) {
  // Окон бывает несколько, а круг у них часто один: повторять его незачем
    // (`lib/circles`). Разные круги остаются раздельными.
  const shown = distinctCircles(
    regimes.map((r) => r.who_can_park ?? []).filter((c) => c.length > 0),
  );
  if (shown.length === 0) return null;

  return (
    <section className="rounded-card bg-ground p-6 shadow-raised">
      <h2 className="mb-4 text-card font-extrabold text-ink-strong">Who can park here</h2>

      {shown.map((circle, i) => (
        <div key={i} className={i > 0 ? "mt-3" : undefined}>
          {/* Про сторону здесь не говорим вовсе: блок отвечает на вопрос «кому»,
              а не «где». Место названо панелью со стрелкой. */}
          {/* Одно условие — просто строка. Несколько — список: иначе они
              слипаются в абзац, и непонятно, где кончается одно и начинается
              другое. */}
          <ul
            className={
              circle.length > 1
                ? "list-outside list-disc space-y-0.5 pl-5"
                : "space-y-0.5"
            }
          >
            {circle.map((t) => (
              <li key={t.key} className="text-sm text-ink">
                {t.text}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
