// Блок 1: что сервис увидел.
//
// Человек у знака читает знак, а не схему. На каждую панель — что на ней написано
// и что это значит, с официальным названием и кодом (`Length of road section (T1)`).
// Коды приходят из справочника, куда занесены по сериям E, C и T; пустой код
// означает, что кода не существует — табло оператора не дорожный знак.

import { useState } from "react";
import type { Analysis, GeneralRule, Meaning } from "../types";
import Completeness from "./Completeness";

function meaningLine(m: Meaning): string {
  const head = m.code ? `${m.label} (${m.code})` : m.label;
  if (!m.short) return head;
  // `continues` — подпись продолжает заголовок одним предложением:
  // «No parking (C35) on Thursdays between 10:00 and 14:00».
  return m.continues ? `${head} ${m.short}` : `${head}. ${m.short}`;
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-ground-2 bg-inset p-2.5">
      {/* Название прижато вправо и выровнено по ПЕРВОЙ строке содержимого:
          иначе первая строка карточки пустует, и текст начинается со второй. */}
      <div className="flex items-baseline gap-3">
        <div className="min-w-0 flex-1">{children}</div>
        <p className="shrink-0 text-xs text-ink-3">{title}</p>
      </div>
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
    <section className="rounded-xl border border-line bg-ground p-4 shadow-sm">
      <h2 className="mb-2 font-medium text-ink">What we read</h2>
      <Completeness data={data} />

      {wide && photo}

      <div className="flex flex-col gap-4 sm:flex-row">
        {!wide && photo}

        <div className="min-w-0 flex-1 space-y-2">
          <Block title="Primary sign">
            <p className="text-sm text-ink">
              {primary ? meaningLine(primary) : "Not identified"}
            </p>
          </Block>

          {panels.map((p) => (
            <Block key={p.index} title="Panel">
              {!p.carries_rule && (
                <span className="mb-0.5 inline-block rounded bg-line px-1.5 py-0.5 text-xs text-ink-2">
                  Not a parking rule
                </span>
              )}

              {/* У правилообразующей панели сначала её текст, потом смысл.
                  У табло наоборот: сперва чем она оказалась, текст второстепенен. */}
              {p.carries_rule ? (
                <>
                  {p.text && (
                    <p className="text-sm font-medium text-ink">{p.text}</p>
                  )}
                  {(p.meanings ?? []).map((m, i) => (
                    <p key={`${m.key}-${i}`} className="text-sm text-ink-2">
                      {meaningLine(m)}
                    </p>
                  ))}
                </>
              ) : (
                <>
                  {(p.meanings ?? []).map((m, i) => (
                    <p key={`${m.key}-${i}`} className="text-sm text-ink">
                      {m.label}
                    </p>
                  ))}
                  {p.text && <p className="text-sm text-ink-3">{p.text}</p>}
                </>
              )}

              {/* Подпись приходит готовой: видов у неё три — текст напечатан выше,
                  текста нет вовсе (рисунок), остаток при понятой табличке, —
                  и различает их тот, кто знает, что именно не понято. Пустая
                  панель без подписи однажды оставила на экране голую рамку. */}
              {p.not_interpreted_text && (
                <p className="text-sm text-ink-3">{p.not_interpreted_text}</p>
              )}
            </Block>
          ))}

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
