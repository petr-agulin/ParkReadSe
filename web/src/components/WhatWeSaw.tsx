// Блок 1: что сервис увидел.
//
// Человек у знака читает знак, а не схему. На каждую панель — что на ней написано
// и что это значит, с официальным названием и кодом (`Length of road section (T1)`).
// Коды приходят из справочника, куда занесены по сериям E, C и T; пустой код
// означает, что кода не существует — табло оператора не дорожный знак.

import { useState } from "react";
import { plateRow } from "../lib/reading";
import type { Analysis, GeneralRule, Panel } from "../types";
import Completeness from "./Completeness";

/**
 * Табличка карточкой: сверху её собственный текст, под ним — что он значит,
 * в углу — главный это знак или табличка под ним.
 *
 * Читается как сама табличка. Прежняя форма «подпись слева → значение справа»
 * держалась, пока значение одно, и разъезжалась дальше; разработчик посмотрел
 * на оба варианта на телефоне и выбрал этот.
 *
 * Что показывать, решает `lib/reading`: пустой `quote` значит, что своего текста
 * у таблички нет — верхней строки тогда не будет вовсе.
 */
function Plate({ panel }: { panel: Panel }) {
  const row = plateRow(panel);
  return (
    <div className="flex items-start justify-between gap-3 rounded-tile border border-line
                    bg-inset px-4 py-3">
      {/* `min-w-0` — чтобы длинная строка переносилась, а не выталкивала
          метку за край карточки. */}
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        {row.quote && <span className="text-body text-ink">{row.quote}</span>}
        {row.lines.map((line, i) => (
          <span key={i} className="text-body text-ink-3">{line}</span>
        ))}
        {/* Пометку «это не правило» нельзя подавать как смысл таблички:
            табло оператора дорожным знаком не является. */}
        {!panel.carries_rule && (
          <span className="text-label text-ink-3">Not a parking rule</span>
        )}
      </div>
      <span className="shrink-0 text-label text-link">{row.tag}</span>
    </div>
  );
}

export default function WhatWeSaw({
  data, preview, rules,
}: { data: Analysis; preview: string | null; rules: GeneralRule[] }) {
  const [openRules, setOpenRules] = useState(false);
  // Горизонтальный снимок в узкой колонке превращается в марку. Ориентацию
  // узнаём у самой картинки и кладём такую над разбором, во всю ширину.
  const [wide, setWide] = useState(false);
  const saw = data.what_we_saw;
  const panels = saw.panels ?? [];
  const primary = saw.primary_sign;

  const photo = preview && (
    <img
      src={preview}
      alt="the sign you photographed"
      onLoad={(e) => {
        const img = e.currentTarget;
        setWide(img.naturalWidth > img.naturalHeight * 1.1);
      }}
      className={
        wide
          ? "mb-3 max-h-72 w-full rounded-lg object-contain"
          : "max-h-72 w-full rounded-lg object-contain sm:w-44 sm:shrink-0"
      }
    />
  );

  return (
    <section className="rounded-card bg-ground p-6 shadow-raised">
      {/* Уверенности в шапке нет: она была сказана дважды — чипом здесь и строкой
          прямо под ним, в `Completeness`. Осталась строка, где рядом с ней
          полнота, причины и тон. */}
      <h2 className="mb-3 text-card-sm font-bold text-ink-strong">What we read</h2>
      <Completeness data={data} />

      {wide && photo}

      <div className="flex flex-col gap-4 sm:flex-row">
        {!wide && photo}

        <div className="min-w-0 flex-1 space-y-3">
          {primary && (
            <Plate panel={{
              index: 0, kind: "main_sign", lines: [], background_color: null,
              carries_rule: true, reference_keys: [], uninterpreted: [],
              not_interpreted_text: null, fields: [], title: "", text: "",
              meanings: [primary],
            }} />
          )}

          {panels.map((p) => <Plate key={p.index} panel={p} />)}

          {rules.length > 0 && (
            <div className="rounded-md border border-dashed border-line bg-inset p-2.5">
              {/* Кнопка — только заголовок. Раскрытый текст лежит СНАРУЖИ неё:
                  внутри кнопки клик по самому правилу сворачивал бы список. */}
              <button
                type="button"
                onClick={() => setOpenRules(!openRules)}
                className="flex w-full items-baseline gap-3 text-left"
              >
                <span className="min-w-0 flex-1 text-xs text-ink-3">
                  General parking rules
                </span>
                <span className="shrink-0 text-xs text-ink-3 underline-offset-2 hover:underline">
                  {openRules ? "hide" : "show"}
                </span>
              </button>

              {openRules && (
                <>
                  <p className="mt-2 text-xs text-ink-3">
                    These are general parking rules applied by law in Sweden.
                  </p>
                  <ul className="mt-1.5 list-outside list-disc space-y-1 pl-4 text-sm text-ink-2">
                    {rules.map((r) => (
                      <li key={r.key}>{r.text}</li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
