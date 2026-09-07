# -*- coding: utf-8 -*-
"""Что промпт обязан объяснить.

Промпт — не гарантия, а просьба, и проверить его по-настоящему может только прогон.
Но одну вещь проверить можно и без модели: **названо ли в нём то, из чего модели
предлагают выбирать**. Скелет схемы перечисляет допустимые значения, и этого хватает,
чтобы ответ прошёл валидацию, — но не хватает, чтобы выбрать верное.

Так и вышло с `main_sign.type`. Значения были в скелете, а РАЗНИЦЫ между ними
не объяснял никто, и на снимках `037` и `050` указатель к чужой стоянке был прочитан
как разрешение стоять у столба — самое дорогое расхождение всего замера.
"""
import json
from pathlib import Path

from parkread import prompts

SCHEMA = json.loads(Path("schema/sign.schema.json").read_text(encoding="utf-8"))


def test_every_kind_of_main_sign_is_explained_not_just_listed():
    """Каждое значение `main_sign.type` названо в самих указаниях, а не только
    в скелете схемы. Выбор между ними решает, идёт ли речь о стоянке ЗДЕСЬ."""
    значения = SCHEMA["properties"]["main_sign"]["properties"]["type"]["enum"]
    пропущены = [v for v in значения if v not in prompts.EXTRACT_INSTRUCTIONS]
    assert not пропущены, пропущены


def test_the_two_prohibition_signs_are_told_apart_by_something_countable():
    """`C35` и `C39` — один и тот же круглый знак, отличаются числом полос.
    Признак должен быть назван: «похоже на запрет» не отличает их."""
    т = prompts.EXTRACT_INSTRUCTIONS
    assert "ONE diagonal bar" in т and "TWO bars" in т, "признак различения не назван"


def test_brackets_and_red_ink_are_told_apart_by_the_days_they_mean():
    """Скобки — субботы, красные чернила — воскресенья, и это разные сигналы.

    Найдено в браузере на снимке `030`: разбор сказал `red` там, где на плате
    скобки, и продукт объявил плату по воскресеньям вместо суббот. Прежний ответ
    был верен — сломала его правка промпта: описание круглых знаков добавило слово
    `red` четырежды в промпт, где «красные цифры значат red» — правило дня недели.
    Теперь круглые знаки описаны через полосы, а слово `red` осталось только там,
    где речь о цвете чернил.
    """
    т = prompts.EXTRACT_INSTRUCTIONS
    assert "SATURDAYS" in т and "SUNDAYS" in т, "дни не названы в открытую"
    assert "Brackets are never about Sundays" in т
    # Слово `red` не должно вернуться в описание круглых знаков: там оно уводит
    # день недели, а различить их можно и по числу полос.
    круглые = т[т.index('"prohibition_parking"'):т.index('"wayfinding_park_and_ride"')]
    assert "red" not in круглые.lower(), круглые


def test_fields_that_changed_the_answer_are_explained_by_name():
    """Список не произвольный: это ровно те поля, на которых калибровка поймала
    расхождение ОТВЕТА, а не полей.

    `042` — `vehicle_class` подменён ближайшим значением; `010` — `permit_required`
    потерян рядом с заполненным `eligibility`; `054` — `prohibition` подменён
    на `scope_shift`. Поле, которое меняет ответ, обязано быть объяснено.
    """
    для_ответа = ("vehicle_class", "permit_required", "prohibition",
                  "scope_shift", "eligibility")
    пропущены = [f for f in для_ответа if f not in prompts.EXTRACT_INSTRUCTIONS]
    assert not пропущены, пропущены


def test_the_prompt_names_the_fields_it_forbids_guessing_into():
    """Обратная сторона: там, где перечисление схемы кончается, промпт обязан
    сказать, что делать. Иначе модель подставит ближайшее — и отличить подстановку
    от прочтения будет нечем."""
    т = prompts.EXTRACT_INSTRUCTIONS
    assert "bicycle" in т and '"other" in "pictogram"' in т, (
        "не сказано, как отвечать про класс, которого в перечислении нет")


def test_the_triage_prompt_was_not_disturbed():
    """Отсев на замере отработал без единой ошибки: 47 знаков, 7 отказных кадров,
    ноль промахов в обе стороны. Правка промпта извлечения не должна стоить нам
    этого результата — а стоила бы, будь промпты общими: сменился бы отпечаток,
    и все ответы отсева пришлось бы получать заново.
    """
    from parkread import fixtures

    схема = json.loads(Path("schema/triage.schema.json").read_text(encoding="utf-8"))
    отпечаток = fixtures.fingerprint(prompts.triage(схема))
    сохранённые = {
        json.loads(f.read_text(encoding="utf-8")).get("prompt_fingerprint")
        for f in Path("demo").glob("*.triage.json")
        if json.loads(f.read_text(encoding="utf-8")).get("origin", "model") == "model"
    }
    assert сохранённые == {отпечаток}, sorted(x or "нет отпечатка" for x in сохранённые)


def test_scope_shift_may_not_be_inferred_from_position():
    """`scope_shift` ставится только по написанному на табличке, а не по её месту
    в стопке.

    Найдено разработчиком в браузере на снимке `044`: табличка `Boende` с пиктограммой
    мотоцикла получила `remaining_time`, и продукт сообщил «Applies outside the hours
    above». На табличке нет ни одного часа — она про то, КОМУ отведены места, и про
    время не говорит вовсе. Продукт приписал знаку условие, которого на нём нет.
    """
    т = prompts.EXTRACT_INSTRUCTIONS
    assert "ONLY when the plate says so IN WRITING" in т
    assert "Never infer it from where the plate sits in the stack" in т
