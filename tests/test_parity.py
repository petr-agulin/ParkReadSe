# -*- coding: utf-8 -*-
"""Двойной прогон: эталоны, на которых сойдутся две реализации.

Тесты здесь стерегут САМ механизм, а не правила: свежесть эталонов, объявленность
случаев и то, что в эталоны не попало ничего лишнего. Правила стережёт всё
остальное в этой папке.

Главный из них — первый: эталон, разошедшийся с кодом, хуже отсутствующего.
Он выглядит проверкой, а проверяет вчерашний день.
"""
import json
from pathlib import Path

from parkread import parity

ROOT = Path(__file__).resolve().parent.parent


def test_the_golden_answers_are_current():
    """Эталоны пересчитываются и сверяются с теми, что лежат в репозитории.

    Упало — значит, ответ продукта изменился. Это не поломка теста: это его работа.
    Посмотреть, что именно поехало, и переписать сознательно:

        .venv\\Scripts\\python.exe cli.py parity --write
    """
    stale = parity.stale()
    assert not stale, "\\n".join(stale)


def test_every_document_of_the_set_is_a_case():
    """Сверка идёт по всему набору, а не по паре удобных снимков: 57 ответов модели
    и 57 эталонов разработчика. У модели встречаются склейки панелей и странные
    поля, каких в аккуратном эталоне не бывает, и порт обязан вести себя одинаково
    на тех и на других."""
    docs = parity.documents()
    assert len(docs) > 100, len(docs)
    assert any(k.startswith("demo/") for k in docs)
    assert any(k.startswith("expected/") for k in docs)

    ids = {c["id"] for c in parity.build_cases()}
    for name in docs:
        assert f"{name}@base" in ids, name


def test_the_awkward_moments_are_all_covered():
    """Особые моменты — не украшение списка: на каждом из них уже ломалось
    что-нибудь живое. Канун, красный день, обе ночи перевода, край сезона, полночь."""
    labels = {s["label"] for s in parity.SPECIAL}
    assert labels == {"eve", "red", "dst-back", "dst-forward", "season-edge", "midnight"}

    ids = {c["id"] for c in parity.build_cases()}
    for label in labels:
        assert any(i.endswith(f"@{label}") for i in ids), label

    # У каждого момента названа причина: без неё список превращается в набор чисел.
    assert all(s["why"] for s in parity.SPECIAL)


def test_the_case_file_is_read_by_both_sides():
    """Случаи объявлены файлом, а не собираются на лету каждой стороной по-своему."""
    cases = json.loads((ROOT / "parity/cases.json").read_text(encoding="utf-8"))
    assert cases == parity.build_cases()
    assert all({"id", "doc", "moment"} <= set(c) for c in cases)

    # Тот же файл читает и фронтенд — иначе стороны сверялись бы на разных задачах.
    ts = (ROOT / "web/src/lib/parity.test.ts").read_text(encoding="utf-8")
    assert 'read("cases")' in ts


def test_the_engine_golden_holds_the_answer_not_the_innards():
    """Сравнивается то, что движок выдаёт: режимы и отрезки. Не внутренние поля —
    иначе сверка ломалась бы на каждой перестановке кода, ничего не говоря о смысле."""
    golden = json.loads((ROOT / "parity/engine.json").read_text(encoding="utf-8"))
    случай = golden["demo/005-2tim-8-18-parentes-8-15-dubbelpil@base"]
    assert set(случай) == {"permits_parking", "uncertainties", "note", "regimes"}
    режим = случай["regimes"][0]
    assert {"extent", "audience", "audience_excluded", "eligibility", "place_notes",
            "duration_expires_at", "duration_source", "periods"} == set(режим)
    assert {"start", "end", "state", "conditions", "max_duration_minutes",
            "note"} == set(режим["periods"][0])


def test_the_present_golden_is_the_finished_answer():
    """У показа сверяется готовый текст: заголовки, подписи, оговорки. Слова —
    это и есть его работа, и разойтись они могут молча."""
    golden = json.loads((ROOT / "parity/present.json").read_text(encoding="utf-8"))
    случай = golden["expected/049-moped-sasong-avgift-tva-taxor@season-edge"]
    assert случай["contract"] == parity.present.CONTRACT
    окна = случай["regimes"]
    assert any(w["audience_short"] for w in окна), окна
    assert any(p["headline"] for w in окна for p in w["periods"])


def test_the_layers_are_declared_and_none_is_ported_yet():
    """Непортированный слой пропускается, но объявлен: список обязан пустеть,
    и он же — мера продвижения порта."""
    ported = parity.ported()
    assert set(ported) <= set(parity.LAYERS), ported
    ts = (ROOT / "web/src/lib/parity.test.ts").read_text(encoding="utf-8")
    for layer in parity.LAYERS:
        assert f'"{layer}"' in ts, layer
    # Слой, объявленный портированным без пробы, роняет фронтенд-тест — так и надо.
    assert "объявлен портированным, но пробы нет" in ts


def test_no_photograph_ever_reaches_the_reference_answers():
    """В эталонах только разборы. Снимки с номерами машин в репозиторий не попадают
    (`AGENTS.md`, §14), и этот путь для них тоже закрыт."""
    files = sorted(p.name for p in (ROOT / "parity").iterdir())
    assert all(f.endswith(".json") for f in files), files
    for name in files:
        text = (ROOT / "parity" / name).read_text(encoding="utf-8")
        assert "data:image" not in text
        assert "base64" not in text
        assert ".jpg" not in text and ".png" not in text


def test_rewriting_is_a_separate_command():
    """Переписывание эталонов — отдельная команда, а не побочный эффект прогона.
    Иначе однажды их перезапишут, чтобы «стало зелено», и вместе с красным
    исчезнет расхождение."""
    source = (ROOT / "cli.py").read_text(encoding="utf-8")
    assert 'if cmd == "parity"' in source
    assert 'cmd_parity("--write" in rest)' in source

    # Ни один тест не пишет эталоны сам. Этот файл из проверки исключён: он же
    # эту строку и называет — иначе тест ловил бы сам себя.
    for path in (ROOT / "tests").glob("test_*.py"):
        if path.name == Path(__file__).name:
            continue
        assert "parity.write(" not in path.read_text(encoding="utf-8"), path.name


# --- порт: что должно оставаться верным на той стороне ---------------------

def test_the_types_match_the_schema():
    """Типы разбора в браузере выведены из схемы, а не угаданы.

    Схема — граница между моделью и кодом. Второй её экземпляр, написанный
    по памяти, однажды разойдётся с первым, и первым пострадает поле, которое
    модель вернула, а браузер не прочёл."""
    schema = json.loads((ROOT / "schema/sign.schema.json").read_text(encoding="utf-8"))
    types = (ROOT / "web/src/lib/sign.ts").read_text(encoding="utf-8")

    parsed = schema["$defs"]["parsed"]["properties"]
    for field in parsed:
        assert field in types, f"поля {field} нет в типах"

    panel = schema["$defs"]["panel"]["properties"]
    for field in panel:
        assert field in types, f"поля панели {field} нет в типах"

    # Перечисления тоже: значение, которого нет в типах, приедет и не прочтётся.
    for field in ("vehicle_class", "eligibility", "arrow", "scope_shift",
                  "payment_method", "placement"):
        for value in parsed[field].get("enum", []):
            assert f'"{value}"' in types, f"{field}: {value} не назван в типах"

    for value in schema["properties"]["main_sign"]["properties"]["type"]["enum"]:
        assert f'"{value}"' in types, f"тип знака {value} не назван"


def test_the_ported_engine_touches_no_clock_of_its_own():
    """`Date` в расчётах не участвует: знак говорит о календаре, а `Date` —
    о мгновении, и вместе с ним в расчёт входят часовой пояс машины, летнее время
    и месяцы, считающиеся с нуля (риск 5 порта). Время идёт через `civil`/`clock`."""
    for name in ("engine.ts", "calendar.ts", "clock.ts", "civil.ts"):
        source = (ROOT / "web/src/lib" / name).read_text(encoding="utf-8")
        for forbidden in ("new Date", "Date.now", "toLocale", "getTimezoneOffset",
                          "Intl.", "zoneinfo", "tzdata"):
            assert forbidden not in source, f"{name}: {forbidden}"


def test_the_rulings_moved_with_the_engine():
    """Сверка доказывает, что две реализации согласны; эти тесты говорят, ПОЧЕМУ
    ответ такой. Механику сверка покрывает сама, поэтому переехали только правила,
    за которыми стоит решение разработчика или находка на живом снимке."""
    ported = (ROOT / "web/src/lib/engine.test.ts").read_text(encoding="utf-8")
    for mark in ("решение 82", "решение 113", "решение 118", "решение 120",
                 "решение 121", "`005`", "`033`", "`038`", "`049`",
                 "знак Б", "Frihamnen"):
        assert mark in ported, mark

def test_the_browser_reference_is_current():
    """Справочник для браузера порождается из markdown. Правили записи
    и не пересобрали — падает здесь, а не у пользователя, которому показали
    вчерашнюю формулировку.

        .venv/Scripts/python.exe cli.py reference --emit
    """
    from parkread.reference import Reference, emit_ts

    emitted = ROOT / "web/src/lib/reference.data.ts"
    assert emitted.exists(), "справочник для браузера не собран"
    fresh = emit_ts(Reference(ROOT / "reference/signs"))
    assert emitted.read_text(encoding="utf-8") == fresh, "справочник устарел"


def test_the_emitted_reference_carries_what_the_screen_shows():
    """Переезжают поля, которые показ берёт у записи, и не переезжает `body`:
    многоабзацный markdown справки на экране разбора не участвует."""
    from parkread.reference import EMITTED_FIELDS

    assert set(EMITTED_FIELDS) >= {"en", "short", "label", "code", "category"}
    assert "body" not in EMITTED_FIELDS and "tokens" not in EMITTED_FIELDS
    text = (ROOT / "web/src/lib/reference.data.ts").read_text(encoding="utf-8")
    assert "Руками не правится" in text

def test_the_forbidden_wording_guard_moved_with_the_words():
    """Словарь формулировок сторожит тест НА ТОЙ ЖЕ стороне, где живут слова.

    Оставить его только в питоне значит потерять страховку в тот день, когда
    питон уйдёт, — а формулировки ради этой страховки и держат в одном месте
    (риск 6 порта)."""
    guard = (ROOT / "web/src/lib/present.test.ts").read_text(encoding="utf-8")
    for bad in ("parking allowed", "you may park", "you can park here"):
        assert bad in guard, bad
    # Проверяется весь набор, а не один удобный снимок.
    assert "parity/cases.json" in guard

def test_the_schema_check_has_something_to_be_checked_against():
    """Условие решения 124: своя проверка схемы в браузере сверяется
    с `jsonschema` на поломанных нарочно разборах — пока питон жив.

    Проверка проверки: рецепты обязаны ЛОМАТЬ документ. Не ломали бы —
    сверка сравнивала бы две единицы и всегда была зелёной."""
    golden = json.loads((ROOT / "parity/schema.json").read_text(encoding="utf-8"))
    assert len(golden) >= 100, len(golden)
    целые = {k: v for k, v in golden.items() if k.endswith("::как есть")}
    поломанные = {k: v for k, v in golden.items() if not k.endswith("::как есть")}
    assert len(целые) >= 10, len(целые)
    assert all(целые.values()), "исходные разборы обязаны проходить схему"
    # Девять рецептов из десяти ломают документ, и ломать они обязаны: иначе
    # сверка сравнивала бы две единицы и всегда была зелёной.
    assert not any(поломанные.values()), [k for k, v in поломанные.items() if v]
    assert len(поломанные) >= 8 * len(целые), (len(поломанные), len(целые))

    # Рецепты — те же с обеих сторон, иначе сравнивались бы разные документы.
    ts = (ROOT / "web/src/lib/parity.test.ts").read_text(encoding="utf-8")
    for mutation in parity.MUTATIONS:
        assert mutation["label"] in ts, mutation["label"]


def test_the_browser_schemas_are_current():
    """Схемы в браузере — копия `schema/*.json`. Правили схему и не пересобрали —
    падает здесь: .venv/Scripts/python.exe cli.py schema --emit"""
    from parkread.reference import emit_schema_ts

    emitted = ROOT / "web/src/lib/schema.data.ts"
    assert emitted.exists(), "схемы для браузера не собраны"
    assert emitted.read_text(encoding="utf-8") == emit_schema_ts(ROOT / "schema")

def test_the_general_rules_travel_with_the_page():
    """Справка «общие правила» приходила с сервера, и отказ был МОЛЧАЛИВЫМ:
    нет сервера — блок исчезал без единого слова. Сломалось бы это в день вывода
    питона, когда искать причину уже некому (шаг 6d).

        .venv/Scripts/python.exe cli.py rules --emit
    """
    from parkread.reference import emit_rules_ts

    emitted = ROOT / "web/src/lib/rules.data.ts"
    assert emitted.exists(), "правила для браузера не собраны"
    assert emitted.read_text(encoding="utf-8") == emit_rules_ts(ROOT / "reference/general_rules")

    # Страница берёт их локально и в сеть за справкой не ходит.
    app = (ROOT / "web/src/App.tsx").read_text(encoding="utf-8")
    assert "GENERAL_RULES" in app
    assert "generalRules()" not in app, "остался сетевой вызов за справкой"

    # Переезжают поля, которые показывает экран.
    text = emitted.read_text(encoding="utf-8")
    for field in ("key", "text", "source", "body"):
        assert f'"{field}"' in text, field

    # И пометка остаётся: продукт не вправе подать общее правило как прочитанное
    # со столба. Она живёт в вёрстке блока и обязана там остаться.
    block = (ROOT / "web/src/components/WhatWeSaw.tsx").read_text(encoding="utf-8")
    assert "These are general parking rules applied by law in Sweden." in block


def test_the_server_still_serves_the_rules_for_the_python_path():
    """Ответ `/api/general-rules` остаётся: питон-путь ещё жив, и ломать его
    заодно незачем."""
    source = (ROOT / "parkread/api.py").read_text(encoding="utf-8")
    assert '@app.get("/api/general-rules")' in source
    assert '"advisory": True' in source

# --- замер (шаг 7) ---------------------------------------------------------

def test_the_measurement_is_a_tool_and_not_part_of_the_product():
    """Замер — инструмент разработчика. В страницу он попасть не должен:
    ни одна часть приложения его не импортирует, и в обычный прогон он не входит
    (печатать таблицы на каждый прогон незачем)."""
    import json as _json

    src = ROOT / "web/src"
    для_приложения = [p for p in src.rglob("*.ts*")
                      if not p.name.endswith(".test.ts")
                      and p.name not in ("measure.ts",)]
    for path in для_приложения:
        text = path.read_text(encoding="utf-8")
        assert 'from "./measure"' not in text, path.name
        assert 'from "../lib/measure"' not in text, path.name

    package = _json.loads((ROOT / "web/package.json").read_text(encoding="utf-8"))
    assert "measure" in package["scripts"], "нет команды npm run measure"
    assert "--dir measure" in package["scripts"]["measure"]
    assert "--exclude" in package["scripts"]["test"], "замер попадёт в обычный прогон"


def test_the_measurement_reads_the_same_set_from_disk():
    """Тот же набор, что у питона: эталоны разработчика, ответы модели и снимки
    (площадь кадра входит в уверенность)."""
    report = (ROOT / "web/measure/report.test.ts").read_text(encoding="utf-8")
    for path in ("testset/expected", "demo/", "testset/photos"):
        assert path in report, path
    # Считает TypeScript-реализация, а не питон.
    assert "../src/lib/engine" in report and "../src/lib/measure" in report


def test_the_stale_answers_are_named_and_not_counted():
    """Ответ, полученный другим промптом, в замер не входит — и назван вслух.
    Молчаливый пропуск выглядел бы как «такого снимка нет», а снимок есть."""
    golden = json.loads((ROOT / "parity/measure.json").read_text(encoding="utf-8"))
    assert golden["excluded"], "на наборе есть устаревшие ответы — их и проверяем"
    assert golden["photos"] + len(golden["excluded"]) >= 57
    # Отпечаток — тот же, что у промпта, которым спрашивают сейчас.
    assert len(golden["fingerprint"]) == 12


def test_the_threshold_table_is_the_one_the_threshold_stands_on():
    """Порог 0.9 калиброван по расхождению ОТВЕТА, а не по полям: поля расходятся
    у девятнадцати снимков, ответ — у трёх. Таблица обязана это показывать."""
    golden = json.loads((ROOT / "parity/measure.json").read_text(encoding="utf-8"))
    assert "| 0.900 |" in golden["threshold_table"]
    assert len(golden["diverged"]) < 10, "расхождений ответа мало — так и должно быть"
    полей = sum(1 for name, (hits, total) in golden["fields"].items() if hits < total)
    assert полей > len(golden["diverged"]), "поля обязаны расходиться чаще ответа"
