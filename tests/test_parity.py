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
