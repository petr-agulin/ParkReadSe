"""Экономика отсева: считается, а не предполагается.

Отсев выгоден, только если он дешевле, чем доля мусора, умноженная на стоимость
извлечения:

    C_отсев < доля_мусора × C_извлечение

Отсюда точка безубыточности — доля мусора, начиная с которой отсев окупается:

    доля_мусора > C_отсев / C_извлечение

Ключевое наблюдение: **изображение уходит в обе модели**. На проверке модели оно
заняло 1078 токенов из 1401 входных, то есть короткий промпт почти ничего не экономит.
Значит отношение стоимостей определяется не длиной запроса, а разницей в цене моделей.

Абсолютные цены здесь не нужны и намеренно не зашиты: считается отношение. Цена задаётся
одним числом — во сколько раз модель извлечения дороже модели отсева за токен.
На бесплатном тарифе это отношение равно 1, и вывод получается ровно тот, который
записан в плане.
"""
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Usage:
    """Замеренный расход одного вызова."""
    prompt_tokens: int
    output_tokens: int
    image_tokens: int = 0

    @property
    def total(self) -> int:
        return self.prompt_tokens + self.output_tokens

    @property
    def text_tokens(self) -> int:
        return max(self.prompt_tokens - self.image_tokens, 0)


@dataclass(frozen=True)
class Scenario:
    triage: Usage
    extract: Usage
    price_ratio: float = 1.0   # во сколько раз модель извлечения дороже за токен

    def cost_triage(self) -> float:
        return self.triage.total

    def cost_extract(self) -> float:
        return self.extract.total * self.price_ratio

    def break_even_junk_share(self) -> float:
        """Доля мусора, начиная с которой отсев окупается."""
        return self.cost_triage() / self.cost_extract()

    def cost_per_photo(self, junk_share: float) -> tuple[float, float]:
        """Средняя стоимость одного снимка без отсева и с отсевом."""
        without = self.cost_extract()
        with_ = self.cost_triage() + (1 - junk_share) * self.cost_extract()
        return without, with_

    def worth_it(self, junk_share: float) -> bool:
        return junk_share > self.break_even_junk_share()


def table(sc: Scenario, junk_shares=(0.0, 0.05, 0.10, 0.25, 0.50)) -> str:
    """Таблица для отчёта этапа. Единица — условный токен, приведённый к цене
    модели отсева: абсолютные цены не нужны, нужно отношение."""
    be = sc.break_even_junk_share()
    rows = [
        "| Доля мусора | Без отсева | С отсевом | Выгода |",
        "|---|---|---|---|",
    ]
    for js in junk_shares:
        wo, w = sc.cost_per_photo(js)
        diff = wo - w
        rows.append(f"| {js:.0%} | {wo:,.0f} | {w:,.0f} | "
                    f"{'+' if diff > 0 else ''}{diff:,.0f} |")
    head = (
        f"Отсев: {sc.triage.total} токенов (из них изображение {sc.triage.image_tokens}).\n"
        f"Извлечение: {sc.extract.total} токенов "
        f"(из них изображение {sc.extract.image_tokens}), "
        f"модель дороже в {sc.price_ratio:g} раз(а).\n\n"
        f"**Точка безубыточности: доля мусора {be:.0%}.**\n"
    )
    return head + "\n" + "\n".join(rows)
