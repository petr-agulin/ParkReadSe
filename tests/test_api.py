# -*- coding: utf-8 -*-
"""Этап 6a: HTTP-слой на уровне запроса.

Конфиг здесь собирается **руками**, а не через `config.load()`. Правило `AGENTS.md`, §3
запрещает ИИ читать `.env` вообще — в том числе скриптом, который он сам написал
и запустил. Побочный выигрыш: тесты не зависят от того, что лежит в `.env`
у конкретного разработчика.

Все проверки идут в демо-режиме: ключ не нужен, ответы берутся из фикстур авторского
набора, и приёмка этапа («поднимается без ключа») проверяется тем же кодом.
"""
import json
import tempfile
from dataclasses import replace
from pathlib import Path

from parkread.api import create_app
from parkread.config import Config
from parkread.history import History

ROOT = Path(__file__).resolve().parent.parent
PHOTO = ROOT / "testset/photos/005-2tim-8-18-parentes-8-15-dubbelpil.jpg"


def _cfg(tmp: Path, demo: bool = True) -> Config:
    return Config(
        demo_mode=demo,
        demo_fixtures_path=ROOT / "demo",
        vision_model="", triage_model="", triage_enforce=False, max_rpm=0,
        api_base_url="",
        schema_path=ROOT / "schema",
        reference_path=ROOT / "reference/signs",
        general_rules_path=ROOT / "reference/general_rules",
        db_path=tmp / "history.sqlite3",
        log_level="INFO",
    )


def _client(tmp: Path, demo: bool = True):
    cfg = _cfg(tmp, demo)
    return create_app(cfg, history=History(cfg.db_path)).test_client()


def _post(client, path: Path, **form):
    with path.open("rb") as fh:
        data = {"photo": (fh, path.name)}
        data.update(form)
        return client.post("/api/analyze", data=data,
                           content_type="multipart/form-data")


# --- health ----------------------------------------------------------------

def test_health_reports_configuration():
    with tempfile.TemporaryDirectory() as t:
        r = _client(Path(t)).get("/api/health")
        assert r.status_code == 200
        body = r.get_json()
        assert body["ok"] is True and body["demo_mode"] is True
        assert body["reference_entries"] > 0


def test_health_never_leaks_the_key():
    """Самая дорогая ошибка этого слоя. Ключа в ответе нет ни в каком виде —
    только признак «задан» и длина (`AGENTS.md`, §3)."""
    with tempfile.TemporaryDirectory() as t:
        cfg = _cfg(Path(t))
        cfg = Config(**{**cfg.__dict__, "_api_key": "СЕКРЕТ-которого-не-должно-быть"})
        client = create_app(cfg, history=History(cfg.db_path)).test_client()
        raw = client.get("/api/health").get_data(as_text=True)
        assert "СЕКРЕТ" not in raw
        assert "set, length" in raw


# --- analyze ---------------------------------------------------------------

def test_analyze_returns_the_four_blocks():
    with tempfile.TemporaryDirectory() as t:
        r = _post(_client(Path(t)), PHOTO, moment="2026-03-10T12:00")
        assert r.status_code == 200, r.get_data(as_text=True)
        b = r.get_json()
        assert b["completeness"]["category"] in ("full", "partial")
        assert b["what_we_saw"]["panels"], "блок 1: панели"
        assert b["regimes"], "блок 3: шкала периодов"
        assert b["day_class"] == "weekday"
        assert b["has_answer"] is True


def test_wording_comes_from_the_reference_not_from_the_api():
    """Тексты приходят из справочника готовыми строками. Фронтенду нечего сочинять,
    поэтому проверка словаря формулировок остаётся на бэкенде.

    Снимок здесь `006`, а не `005`: у простого знака длительности условий нет вовсе —
    его правило живёт в `max_duration_minutes`, и проверять на нём подстановку текста
    значит проверять пустой список."""
    with tempfile.TemporaryDirectory() as t:
        photo = ROOT / "testset/photos/006-tillstand-07-17-ovrig-tid-avgift.jpg"
        b = _post(_client(Path(t)), photo, moment="2026-03-10T12:00").get_json()
        terms = [c for r in b["regimes"] for p in r["periods"] for c in p["conditions"]]
        assert terms, "условия периодов размечены ключами справочника"
        assert all(x["known"] and x["text"] != x["key"] for x in terms), terms


def test_forbidden_wording_never_appears():
    """Словарь формулировок из PROJECT_BRIEF: продукт не разрешает и не приказывает."""
    with tempfile.TemporaryDirectory() as t:
        raw = _post(_client(Path(t)), PHOTO,
                    moment="2026-03-10T12:00").get_data(as_text=True).lower()
        for bad in ("parking allowed", "you may park", "you need to move the car",
                    "you can park here"):
            assert bad not in raw, bad


def test_missing_photo_is_a_clear_error():
    with tempfile.TemporaryDirectory() as t:
        r = _client(Path(t)).post("/api/analyze", data={},
                                  content_type="multipart/form-data")
        assert r.status_code == 400 and r.get_json()["error"] == "no_photo"


def test_bad_moment_is_rejected_before_any_model_call():
    with tempfile.TemporaryDirectory() as t:
        r = _post(_client(Path(t)), PHOTO, moment="позавчера")
        assert r.status_code == 400 and r.get_json()["error"] == "bad_moment"


def test_a_moment_outside_the_window_is_refused():
    """Календарь считается кодом и умеет шире окна, но отвечать за годы, которых
    никто не сверял, продукт не должен: набор праздников со временем меняется.
    Поле на экране ограничено теми же краями — эта проверка стоит на случай
    запроса мимо экрана."""
    with tempfile.TemporaryDirectory() as t:
        client = _client(Path(t))
        for moment in ("2031-01-05T10:00", "2025-12-31T23:00"):
            r = _post(client, PHOTO, moment=moment)
            assert r.status_code == 400, moment
            body = r.get_json()
            assert body["error"] == "moment_out_of_range"
            # Сообщение уходит на экран, поэтому оно по-английски и называет края.
            assert "2026-01-01" in body["message"] and "2030-12-31" in body["message"]

        # Край окна — внутри окна.
        assert _post(client, PHOTO, moment="2030-12-31T23:59").status_code == 200


def test_unknown_photo_in_demo_mode_is_explained_not_crashed():
    """Демо работает на авторском наборе. Чужой снимок — штатный отказ с объяснением,
    а не 500."""
    with tempfile.TemporaryDirectory() as t:
        tmp = Path(t)
        stranger = tmp / "чужой-снимок.jpg"
        stranger.write_bytes(PHOTO.read_bytes())
        r = _post(_client(tmp), stranger)
        assert r.status_code == 422 and r.get_json()["error"] == "no_fixture"


# --- границы ответственности ------------------------------------------------

def test_uploaded_photo_is_never_written_to_disk():
    """Фотография живёт в памяти запроса. Ни временного файла, ни фикстуры:
    `Photo.remember` по умолчанию False, и API его не поднимает."""
    with tempfile.TemporaryDirectory() as t:
        tmp = Path(t)
        before = {p.name for p in (ROOT / "demo").iterdir()}
        _post(_client(tmp), PHOTO, moment="2026-03-10T12:00")
        after = {p.name for p in (ROOT / "demo").iterdir()}
        assert before == after, "в demo/ ничего не добавилось"
        # в рабочем каталоге запроса остаётся только база истории
        assert {p.name for p in tmp.iterdir()} <= {"history.sqlite3"}


def test_history_records_the_verdict_and_no_image():
    with tempfile.TemporaryDirectory() as t:
        tmp = Path(t)
        cfg = _cfg(tmp)
        hist = History(cfg.db_path)
        client = create_app(cfg, history=hist).test_client()
        _post(client, PHOTO, moment="2026-03-10T12:00")

        rows = hist.recent()
        assert len(rows) == 1
        assert rows[0].category in ("full", "partial")
        blob = json.dumps(rows[0].__dict__, ensure_ascii=False, default=str)
        assert PHOTO.name not in blob, "имя файла не сохраняется"
        assert "jpg" not in blob.lower(), "снимка и следа от него в истории нет"


# --- справочник -------------------------------------------------------------

def test_reference_entry_is_served_for_explanations():
    with tempfile.TemporaryDirectory() as t:
        r = _client(Path(t)).get("/api/reference/avgift")
        assert r.status_code == 200
        assert r.get_json()["text"]


def test_unknown_reference_key_is_404_not_invented():
    with tempfile.TemporaryDirectory() as t:
        r = _client(Path(t)).get("/api/reference/такого-ключа-нет")
        assert r.status_code == 404


# --- собранная страница и общие правила -------------------------------------

def test_index_serves_the_built_page_or_explains_how_to_build_it():
    """Несобранный фронт — состояние репозитория, а не ошибка сервера: ревьюер
    ставит Node и собирает сам, и страница должна сказать ему об этом, а не упасть."""
    with tempfile.TemporaryDirectory() as t:
        r = _client(Path(t)).get("/")
        assert r.status_code == 200
        body = r.get_data(as_text=True)
        built = (ROOT / "web" / "dist" / "index.html").exists()
        assert ("ParkRead" in body) if built else ("npm run build" in body)


def test_general_rules_are_served_separately_and_marked_advisory():
    """Общих правил нет на знаке, и в вычисления они не входят. Они приходят
    ОТДЕЛЬНОЙ ручкой, а не полем разбора: не путешествуя вместе с ответом,
    они не могут случайно оказаться его частью."""
    with tempfile.TemporaryDirectory() as t:
        r = _client(Path(t)).get("/api/general-rules")
        assert r.status_code == 200
        body = r.get_json()
        assert body["advisory"] is True
        assert len(body["rules"]) >= 5
        assert all(x["text"] and x["source"] for x in body["rules"])


def test_general_rules_never_ride_inside_an_analysis():
    with tempfile.TemporaryDirectory() as t:
        b = _post(_client(Path(t)), PHOTO, moment="2026-03-10T12:00").get_json()
        assert "general_rules" not in b and "rules" not in b


def test_state_wording_is_authored_by_the_backend():
    """Подписи состояний приходят готовыми (`state_text`), чтобы фронтенд не сочинял
    ни одной фразы о смысле знака — иначе словарь формулировок проверять негде."""
    with tempfile.TemporaryDirectory() as t:
        b = _post(_client(Path(t)), PHOTO, moment="2026-03-10T12:00").get_json()
        texts = [p["state_text"] for r in b["regimes"] for p in r["periods"]]
        assert texts and all(t.startswith("The sign") for t in texts), texts
        assert b["completeness"]["category_text"]


def test_no_internal_token_is_shown_without_words():
    """Внутренние токены (`here`, `panel_count_disagreement`) человеку у знака
    ничего не сообщают. Токен остаётся в ответе для замера, но рядом обязан лежать
    текст — иначе он утечёт в интерфейс как есть, что и случилось с «Stretch: here»."""
    with tempfile.TemporaryDirectory() as t:
        b = _post(_client(Path(t)), PHOTO, moment="2026-03-10T12:00").get_json()

        for r in b["regimes"]:
            assert r["extent_text"].startswith("The sign"), r["extent_text"]
            assert r["extent_text"] != r["extent"]

        for item in b["completeness"]["reasons"] + b["uncertainties"]:
            assert item["text"] != item["token"], f"токен без текста: {item['token']}"


def test_every_reason_and_uncertainty_token_has_wording():
    """Проверяется не текущий снимок, а полнота таблиц: токен, для которого забыли
    формулировку, `_explain` вернёт как есть — и он молча окажется на экране."""
    from parkread import completeness, engine, present

    produced = set()
    for path in (ROOT / "parkread/completeness.py", ROOT / "parkread/engine.py"):
        for line in path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            for call in ('reasons.append("', 'uncertainties.append("'):
                if line.startswith(call):
                    produced.add(line.split('"')[1].rstrip(":"))

    known = (set(present.REASON_TEXT) | set(present.UNCERTAINTY_TEXT)
             | {"unread_panels", "uninterpreted_plates"})
    assert produced <= known, f"без формулировки: {sorted(produced - known)}"
    assert produced, "токены не нашлись — проверка потеряла смысл"

    # участки: каждое значение из движка должно иметь подпись
    extents = set(engine._ARROW_EXTENT.values()) | {engine.HERE}
    assert extents <= set(present.EXTENT_TEXT), sorted(extents - set(present.EXTENT_TEXT))
    assert completeness.FULL in present.CATEGORY_TEXT


def test_every_shown_value_carries_its_field_name():
    """Блок «что сервис увидел» показывает разбор, а не пересказ: у каждого значения
    написано, как называется поле. Имена приходят с бэкенда дословно из схемы —
    придуманные во вёрстке разошлись бы с ней при первой же правке."""
    with tempfile.TemporaryDirectory() as t:
        w = _post(_client(Path(t)), PHOTO,
                  moment="2026-03-10T12:00").get_json()["what_we_saw"]

        assert {f["name"] for f in w["main_sign_fields"]} >= {"type", "form",
                                                             "background_color"}
        for p in w["panels"]:
            names = [f["name"] for f in p["fields"]]
            assert names[:2] == ["index", "kind"], "порядок полей фиксирован"
            assert "lines" in names, "пустой список строк — тоже факт о панели"
            assert all(f["value"] for f in p["fields"]), "значение без текста не показать"


def test_parsed_fields_are_named_with_their_schema_path():
    """`parsed.duration_limit`, а не «Duration»: сверить разбор со знаком можно
    только по настоящим именам полей."""
    with tempfile.TemporaryDirectory() as t:
        w = _post(_client(Path(t)), PHOTO,
                  moment="2026-03-10T12:00").get_json()["what_we_saw"]
        rows = {f["name"]: f["value"] for p in w["panels"] for f in p["fields"]}
        assert rows["parsed.duration_limit"] == "2 hours", rows
        assert "08:00–18:00 (weekday)" in rows["parsed.time_windows"], rows


def test_no_parsed_field_is_silently_dropped_from_the_screen():
    """Поле, которое модель заполнила, а `_PARSED_ORDER` не знает, всё равно
    показывается: молча потерянное поле выглядит как непрочитанный знак."""
    from parkread.present import _panel_fields
    rows = _panel_fields({"index": 1, "kind": "sign_plate", "lines": ["x"],
                          "parsed": {"выдуманное_поле": "значение"}}, [])
    assert any(r["name"] == "parsed.выдуманное_поле" for r in rows), rows


# --- человеческий вид блока «что сервис увидел» ------------------------------

def test_every_reference_entry_has_a_human_label():
    """Запись без названия покажется человеку ключом справочника — то есть кодом.
    Проверяется весь справочник, а не тот снимок, что под рукой."""
    from parkread.reference import Reference
    for e in Reference(ROOT / "reference/signs").all():
        assert e.label, f"{e.key}: нет названия для показа"


def test_official_codes_look_like_official_codes():
    """Коды берутся из официальных серий: C — запрещающие, D — предписывающие,
    E — указательные, F — знаки направления (`F28` «Parking facility» — указатель
    к крытой стоянке), S — символы, T — таблички. Пустой код допустим и означает
    «кода не существует» (табло оператора не дорожный знак), но выдуманный — нет.

    Список серий расширяется по мере надобности и осознанно: буква, которой здесь
    нет, — это либо опечатка, либо серия, которую в проект ещё не вводили."""
    import re
    from parkread.reference import Reference
    for e in Reference(ROOT / "reference/signs").all():
        assert e.code == "" or re.fullmatch(r"[CDEFST]\d{1,2}", e.code), (e.key, e.code)


def test_panels_are_titled_panel_without_a_number():
    """Номер панели нужен коду для ссылок, человеку у знака — нет. Панели и так
    идут сверху вниз, как на самом знаке."""
    with tempfile.TemporaryDirectory() as t:
        w = _post(_client(Path(t)), PHOTO,
                  moment="2026-03-10T12:00").get_json()["what_we_saw"]
        assert [p["title"] for p in w["panels"]] == ["Panel"] * len(w["panels"])


def test_primary_sign_is_named_and_coded():
    with tempfile.TemporaryDirectory() as t:
        w = _post(_client(Path(t)), PHOTO,
                  moment="2026-03-10T12:00").get_json()["what_we_saw"]
        assert w["primary_sign"]["label"] == "Parking"
        assert w["primary_sign"]["code"] == "E19"


def test_info_board_says_what_it_is_and_shows_its_text():
    """Табло тоже панель, и заголовок у неё тот же. Чем она оказалась — сказано
    строкой ниже, а её текст показывается как есть."""
    photo = ROOT / "testset/photos/008-rorelsehindrad-avgift.jpg"
    with tempfile.TemporaryDirectory() as t:
        w = _post(_client(Path(t)), photo,
                  moment="2026-03-10T12:00").get_json()["what_we_saw"]
        # Не несущих правила панелей на знаке две — табличка оператора и табло, —
        # и порядок между ними от прогона к прогону меняется. Выбирать первую
        # попавшуюся значит проверять не то: род панели назван в `kind`.
        boards = [p for p in w["panels"] if p["kind"] == "info_board"]
        assert boards, "на 008 есть платёжное табло"
        assert boards[0]["meanings"][0]["label"] == "Info board"
        assert boards[0]["meanings"][0]["code"] == "", "у табло кода нет"
        assert boards[0]["text"], "текст табла показывается"


def test_every_entry_has_a_short_caption_too():
    """`en` — полное утверждение для шкалы периодов, `short` — строка под текстом
    панели. Без неё панель покажет только название вида таблички."""
    from parkread.reference import Reference
    for e in Reference(ROOT / "reference/signs").all():
        assert e.short, f"{e.key}: нет короткой подписи"
        assert len(e.short) <= 60, f"{e.key}: подпись длинная — {e.short!r}"


def test_two_plates_with_the_same_code_merge_into_one_line():
    """`Avgift` и `Taxa 2` обе несут T16 и порознь дали бы «Fee (T16)» дважды.
    Смысл при этом разный, поэтому подписи склеиваются, а не теряются."""
    from parkread.present import _merge
    merged = _merge([
        {"key": "avgift", "label": "Fee", "code": "T16",
         "text": "payment required", "short": "Parking is not free"},
        {"key": "taxa", "label": "Fee", "code": "T16",
         "text": "tariff number", "short": "Municipal tariff number"},
    ])
    assert len(merged) == 1
    assert "Parking is not free" in merged[0]["short"]
    assert "Municipal tariff number" in merged[0]["short"]


def test_response_states_its_contract_version():
    """Сборка и сервер расходятся легко: страница обновляется из dist сразу,
    а процесс server.py живёт с прежним кодом. Без версии это выглядит как пустые
    блоки без объяснения — то же самое, что пустой экран."""
    from parkread import present
    with tempfile.TemporaryDirectory() as t:
        b = _post(_client(Path(t)), PHOTO, moment="2026-03-10T12:00").get_json()
        assert b["contract"] == present.CONTRACT
        assert isinstance(present.CONTRACT, int)


def test_user_facing_text_never_explains_the_machinery():
    """Формулировка объясняет последствие, а не устройство.

    Найдено на обкатке: «Two independent readings counted the plates differently» —
    рассказ о внутренней кухне, из которого пользователь не может понять, чему верить.
    Он не знает, что разбор идёт двумя вызовами модели, и знать не должен."""
    from parkread import present
    from parkread.reference import Reference

    forbidden = ["independent reading", "triage", "extraction", "fixture", "schema",
                 "panel_count", "validator", "pipeline", "prompt", "the model",
                 "vision api", "json"]

    texts = []
    for table in (present.STATE_TEXT, present.CATEGORY_TEXT, present.EXTENT_TEXT,
                  present.REASON_TEXT, present.UNCERTAINTY_TEXT):
        texts += list(table.values())
    for e in Reference(ROOT / "reference/signs").all():
        texts += [e.en, e.short, e.label]

    for text in texts:
        low = text.lower()
        for bad in forbidden:
            assert bad not in low, f"внутренняя кухня в тексте для человека: {text!r}"


def test_confidence_caveats_do_not_contradict_the_headline():
    """«Прочитаны все таблички» и рядом «граница могла быть потеряна» читается как
    противоречие. Причины, снижающие уверенность, названы оговоркой явно."""
    from parkread import present
    assert present.REASON_TEXT["panel_count_disagreement"].startswith("Confidence is lower")
    assert present.REASON_TEXT["day_class_unknown"].startswith("Confidence is lower")


def test_the_timeline_ends_where_the_stay_ends():
    """Шкала отвечает на вопрос «сколько я здесь простою». Раньше она шла до края
    горизонта расчёта, и «знак разрешает стоянку … onwards» стояло рядом с «предел
    истекает завтра в 17:11» — читалось как противоречие."""
    photo = ROOT / "testset/photos/008-rorelsehindrad-avgift.jpg"
    with tempfile.TemporaryDirectory() as t:
        r = _post(_client(Path(t)), photo,
                  moment="2026-09-02T17:11").get_json()["regimes"][0]

        assert r["duration_expires_at"] == "2026-09-03T17:11"
        assert r["periods"][-1]["end"] == r["duration_expires_at"]
        assert not any(p["ends_at_horizon"] for p in r["periods"])
        assert "24-hour rule" in r["periods"][-1]["stay_end_text"]


def test_the_stay_end_is_stated_under_its_own_period():
    """Строка про конец стоянки принадлежит последнему периоду, а не всей шкале:
    порознь они и создавали противоречие."""
    with tempfile.TemporaryDirectory() as t:
        r = _post(_client(Path(t)), PHOTO,
                  moment="2026-09-02T17:11").get_json()["regimes"][0]
        marked = [p for p in r["periods"] if p["stay_end_text"]]
        assert len(marked) == 1, "ровно один период кончает стоянку"
        assert marked[0] is r["periods"][-1]
        assert "the sign" in marked[0]["stay_end_text"].lower()


def test_without_a_limit_the_timeline_stops_at_the_first_change():
    """Запрещающий знак предела стоянки не задаёт: стоять сейчас нельзя вовсе.
    Шкала доводится до первой смены состояния — до момента, когда запрет снят."""
    photo = ROOT / "testset/photos/019-forbud-7-18-avgift-ovrig-tid.jpg"
    with tempfile.TemporaryDirectory() as t:
        r = _post(_client(Path(t)), photo,
                  moment="2026-09-02T17:11").get_json()["regimes"][0]
        states = [p["state"] for p in r["periods"]]
        assert states[0] == "prohibited"
        assert states[-1] != states[0], "доведено до снятия запрета"
        assert len(states) == 2, states


def test_completeness_tone_is_decided_by_the_backend():
    """Зелёный только когда прочитано всё и ни один сигнал уверенность не снизил.
    Правило живёт на бэкенде: это суждение о доверии к ответу, а не оформление,
    и вёрстка не должна решать, что считать благополучием."""
    from parkread.present import GOOD_ENOUGH, _tone
    assert _tone("full", 0.975) == "good"
    assert _tone("full", GOOD_ENOUGH - 0.01) == "caution", "оговорка снимает зелёный"
    assert _tone("partial", 0.99) == "caution", "прочитано не всё — не зелёный"
    assert _tone("insufficient", 0.99) == "bad"
    assert _tone("not_a_parking_sign", 1.0) == "bad"


def test_tone_travels_with_the_answer():
    with tempfile.TemporaryDirectory() as t:
        c = _post(_client(Path(t)), PHOTO,
                  moment="2026-09-02T17:11").get_json()["completeness"]
        assert c["tone"] in ("good", "caution", "bad")
        assert (c["tone"] == "good") == (c["category"] == "full"
                                         and c["confidence"] >= 0.9)


def test_who_can_park_never_addresses_the_reader():
    """Условие допуска — подпись к режиму, а не проверка пользователя. Продукт
    называет круг и останавливается: относится ли к нему стоящий у знака, знает
    только он сам. Это главный принцип продукта, и нарушить его проще всего
    именно здесь."""
    photos = ["008-rorelsehindrad-avgift", "015-motorcykel",
              "009-besokande-avgift", "003-p-2tim"]
    forbidden = ("you may", "you can", "you cannot", "you must", "your car",
                 "not allowed to", "you need")
    for stem in photos:
        with tempfile.TemporaryDirectory() as t:
            r = _post(_client(Path(t)), ROOT / f"testset/photos/{stem}.jpg",
                      moment="2026-09-02T17:11").get_json()["regimes"][0]
            assert r["who_can_park"], f"{stem}: круг обязан быть назван"
            for term in r["who_can_park"]:
                low = term["text"].lower()
                assert low.startswith("the sign"), (stem, term["text"])
                for bad in forbidden:
                    assert bad not in low, (stem, bad, term["text"])


def test_a_sign_that_narrows_nobody_still_names_the_circle():
    """Молчать нельзя: пустая строка читается как «неизвестно», хотя ответ есть.
    Простой `P` отведён всем зарегистрированным транспортным средствам."""
    with tempfile.TemporaryDirectory() as t:
        r = _post(_client(Path(t)), ROOT / "testset/photos/003-p-2tim.jpg",
                  moment="2026-09-02T17:11").get_json()["regimes"][0]
        assert r["eligibility"] == [], "круг знаком не сужен"
        assert "all vehicles" in r["who_can_park"][0]["text"]
        assert "general parking rules" in r["who_can_park"][0]["text"]


def test_a_time_plate_reads_as_one_sentence():
    """Табличка `Torsdag 10-14 / Jämna veckor / Augusti-Juni` — одно указание,
    и на экране оно одна строка. Порознь получалось четыре: запрет, часы в названный
    день, чётные недели, сезон — каждая верна, а вместе они шумят и заставляют
    читателя собирать смысл самому."""
    from pathlib import Path as _P
    from parkread import present
    from parkread.reference import Reference, recognise

    ref = Reference(ROOT / "reference/signs")
    panel = {"index": 1, "kind": "sign_plate",
             "lines": ["Torsdag 10-14", "Jämna veckor", "Augusti-Juni"],
             "background_color": "yellow", "legibility": {"readable": True},
             "parsed": {"prohibition": True, "time_windows": [
                 {"from": "10:00", "to": "14:00", "day_class": "named_weekday",
                  "named_weekday": "thursday", "week_parity": "even",
                  "dates": {"mode": "except",
                            "ranges": [{"from": "07-01", "to": "07-31"}]}}]}}
    doc = {"main_sign": {"type": "parking", "form": "regular",
                         "background_color": "blue",
                         "legibility": {"readable": True}}, "panels": [panel]}
    view = present._panel_view(panel, recognise(doc, ref).panel_keys[1], ref)

    assert len(view["meanings"]) == 1, view["meanings"]
    m = view["meanings"][0]
    assert m["label"] == "No parking" and m["code"] == "C35"
    assert m["continues"] is True, "читается как одно предложение, без точки"
    for part in ("Thursdays", "10:00", "14:00", "even weeks"):
        assert part in m["short"], (part, m["short"])
    assert "all year except July" in m["short"], m["short"]


def test_a_complementary_plate_does_not_replace_the_general_rule():
    """`Boende` круг НЕ сужает: он не запрещает стоять никому, а сообщает, что
    у жильцов свои условия. Одна эта строка в блоке «кому» намекала бы, что
    остальным нельзя, — поэтому сначала общее правило знака, потом дополнение."""
    from datetime import datetime
    from parkread import present
    from parkread.calendar_se import Calendar
    from parkread.engine import evaluate_parking_rules
    from parkread.reference import Reference

    ref = Reference(ROOT / "reference/signs")
    cal = Calendar()
    doc = {"schema_version": 1,
           "main_sign": {"type": "parking", "background_color": "blue",
                         "form": "regular", "legibility": {"readable": True}},
           "panel_count": 1, "boundaries": {"certain": True},
           "panels": [{"index": 1, "kind": "sign_plate", "lines": ["Boende Solna"],
                       "background_color": "white",
                       "legibility": {"readable": True},
                       "parsed": {"eligibility": "residents"}}]}
    r = evaluate_parking_rules(doc, datetime(2026, 9, 2, 22, 52), cal).regimes[0]
    who = present._who_can_park(ref, r, "main-parking")

    assert len(who) == 2, who
    assert "all vehicles" in who[0]["text"], "общее правило идёт первым"
    assert "residents" in who[1]["text"], "дополнение — вторым"


def test_a_narrowing_plate_does_replace_the_general_rule():
    """Обратный случай: `Besökande` и коляска круг именно сужают, и общее
    разрешение знака ими заменяется. Сказать про них «стоянка для всех, а также
    для посетителей» значило бы отменить правило, которое знак вводит."""
    for stem, expect in (("008-rorelsehindrad-avgift", "disabled parking permit"),
                         ("009-besokande-avgift", "visitors"),
                         ("015-motorcykel", "motorcycles")):
        with tempfile.TemporaryDirectory() as t:
            r = _post(_client(Path(t)), ROOT / f"testset/photos/{stem}.jpg",
                      moment="2026-09-02T22:52").get_json()["regimes"][0]
            texts = [x["text"] for x in r["who_can_park"]]
            assert len(texts) == 1, (stem, texts)
            assert expect in texts[0], (stem, texts)
            assert "all vehicles" not in texts[0], (stem, texts)


def test_period_tone_and_headline_come_from_the_rule():
    """Цвет линии на шкале — свойство правила, а не оформления, поэтому решает
    его бэкенд. И «Free parking» здесь не бывает: формулировка запрещена словарём,
    потому что обещает бесплатность там, где может требоваться диск или билет."""
    from parkread.engine import Period
    from parkread.present import PERIOD_HEADLINE, _headline, _period_tone
    from datetime import datetime as _dt

    def period(state, conditions):
        return Period(start=_dt(2026, 9, 2, 10), end=_dt(2026, 9, 2, 12),
                      state=state, conditions=conditions)

    assert _period_tone(period("allowed", ["avgift"])) == "paid"
    assert _period_tone(period("allowed", [])) == "free"
    assert _period_tone(period("prohibited", [])) == "prohibited"
    assert _period_tone(period("uncertain", [])) == "uncertain"

    # «Free parking» разрешена ровно там, где условий нет вовсе: тогда она короче
    # и точнее длинной осторожной фразы. Есть хоть одно условие — заголовок снова
    # осторожный, иначе «Free parking» соседствовало бы с «требуется диск».
    free = period("allowed", [])
    with_disc = period("allowed", ["p-skiva"])
    assert _headline(free, _period_tone(free)) == "Free parking"
    assert _headline(with_disc, _period_tone(with_disc)) == "No fee stated for this period"
    assert "free" not in _headline(with_disc, _period_tone(with_disc)).lower()


def test_period_carries_its_duration_and_notes():
    """Длительность считается бэкендом в минутах: вёрстка её только оформляет.
    Плата названа заголовком отрезка, поэтому в примечания второй раз не идёт."""
    with tempfile.TemporaryDirectory() as t:
        r = _post(_client(Path(t)), PHOTO,
                  moment="2026-09-02T22:59").get_json()["regimes"][0]
        for p in r["periods"]:
            assert p["minutes"] > 0
            assert p["headline"]
            assert all(n["key"] != "avgift" for n in p["notes"]), p["notes"]


def test_identical_neighbouring_segments_are_joined():
    """Две одинаковые полосы подряд читаются как ошибка. На `2 tim 8-18` граница
    в 18:00 настоящая — за ней перестаёт действовать лимит с таблички, — но на шкале
    оба отрезка выглядят одинаково, и различие между ними и так сказано концом
    стоянки.

    Число здесь изменилось вместе с правилом предела (решение 118): машина
    поставлена в 17:11, к 18:00 набегает 49 минут, и двух часов не выходит —
    предел не нарушен. Знак дальше молчит, стоянка продолжается, а отсчёт
    начинается заново утром, когда окно откроется: конец — в 10:00.
    Склейка от этого не изменилась: отрезки по-прежнему сливаются в один."""
    with tempfile.TemporaryDirectory() as t:
        r = _post(_client(Path(t)), PHOTO,
                  moment="2026-09-02T17:11").get_json()["regimes"][0]
        assert len(r["periods"]) == 1, r["periods"]
        assert r["duration_expires_at"] == "2026-09-03T10:00"
        assert r["duration_source"] == "plate"
        assert r["periods"][0]["start"] == "2026-09-02T17:11"
        assert r["periods"][0]["end"] == r["duration_expires_at"]


def test_the_day_class_stands_under_the_date_on_the_scale():
    """Почему на знаке действуют именно эти часы, по одной дате не видно.

    Найдено разработчиком на снимке `005`: пятница 30 октября 2026 — канун
    Alla helgons dag, и работают часы В СКОБКАХ. Чтобы проверить ответ, человеку
    пришлось бы держать в голове шведский календарь праздников; теперь класс дня
    стоит строкой под датой.
    """
    with tempfile.TemporaryDirectory() as t:
        client = _client(Path(t))

        r = _post(client, PHOTO, moment="2026-10-30T14:00").get_json()["regimes"][0]
        note = r["periods"][0]["start_day"]
        # «Eve of», а не «день перед красным: имя»: после двоеточия имя читалось
        # как название сегодняшнего дня, хотя праздник — завтра.
        assert note == {"text": "Eve of Alla helgons dag (All Saints' Day)",
                        "kind": "eve"}, note
        # Стоянка кончается в понедельник — обычный будний день, и подписи там нет.
        assert r["periods"][-1]["end_day"] is None

        # Красный день называется своим именем, а воскресенье — днём недели:
        # имени у него нет, а класс есть.
        r = _post(client, PHOTO, moment="2026-12-25T10:00").get_json()["regimes"][0]
        assert r["periods"][0]["start_day"] == {
            "text": "Red day: Juldagen (Christmas Day)", "kind": "red"}
        # Обычные воскресенье и суббота подписи НЕ получают: «Red day: Sunday»
        # под строкой «Sunday, 13 September» повторяет уже написанное (решение 119).
        r = _post(client, PHOTO, moment="2026-09-13T10:00").get_json()["regimes"][0]
        assert r["periods"][0]["start_day"] is None
        r = _post(client, PHOTO, moment="2026-09-12T10:00").get_json()["regimes"][0]
        assert r["periods"][0]["start_day"] is None

        # А суббота перед Пасхой — получает: там завтрашний день именован.
        r = _post(client, PHOTO, moment="2026-04-04T10:00").get_json()["regimes"][0]
        assert r["periods"][0]["start_day"] == {
            "text": "Eve of Påskdagen (Easter Sunday)", "kind": "eve"}


def test_the_scale_stays_continuous_when_a_node_grows():
    """Третья строка в узле делает его выше значка, и линия соседнего отрезка
    до значка не достаёт — шкала перестаёт читаться как непрерывная. Поэтому
    в колонке значка есть куски линии, а узел тянется во всю высоту строки."""
    page = (ROOT / "web/src/components/PeriodTimeline.tsx").read_text(encoding="utf-8")
    assert "function Rail(" in page
    assert page.count("<Rail p=") >= 4
    assert 'className="flex items-stretch gap-3"' in page
    # Подпись класса дня — серым и полужирным, одинаково у красных дней и канунов:
    # красный на этой шкале уже значит «стоять нельзя» (решение 119).
    day_note = page.split("const DAY_NOTE =")[1].split(";")[0]
    assert "font-semibold" in day_note and "text-slate-600" in day_note
    assert "red" not in day_note and "amber" not in day_note
    assert "note.text" in page


def test_joining_never_hides_a_change_of_rule():
    """Склеиваются только отрезки с одинаковым состоянием и условиями. Переход
    «платно → запрещено» обязан остаться видимым: это и есть то, ради чего шкала."""
    photo = ROOT / "testset/photos/019-forbud-7-18-avgift-ovrig-tid.jpg"
    with tempfile.TemporaryDirectory() as t:
        r = _post(_client(Path(t)), photo,
                  moment="2026-09-01T23:30").get_json()["regimes"][0]
        tones = [p["tone"] for p in r["periods"]]
        assert len(tones) == len(set(tones)) or tones != sorted(set(tones)), tones
        for a, b in zip(r["periods"], r["periods"][1:]):
            assert a["tone"] != b["tone"] or a["notes"] != b["notes"], (a, b)


def test_stay_end_reason_says_why_without_repeating_when():
    """Узел «Park end» на шкале уже говорит, КОГДА стоянка кончается. Повторять это
    словами незачем, а вот ПОЧЕМУ он не говорит — и разница существенная: собственный
    предел знака и общее правило 24 часов, которого на знаке нет, это разные вещи."""
    with tempfile.TemporaryDirectory() as t:
        r = _post(_client(Path(t)), ROOT / "testset/photos/008-rorelsehindrad-avgift.jpg",
                  moment="2026-09-02T23:24").get_json()["regimes"][0]
        last = r["periods"][-1]
        assert last["stay_end_reason"] == "general 24-hour rule, not written on the sign"
        assert "must end here" not in last["stay_end_reason"], "когда — говорит узел"


def test_every_duration_source_has_a_reason():
    """Источник предела без формулировки покажется пустой строкой под «Park end»,
    и человек не узнает, откуда взялся конец стоянки."""
    from parkread.present import STAY_END_REASON, STAY_END_TEXT
    assert set(STAY_END_REASON) == set(STAY_END_TEXT)
    assert set(STAY_END_REASON) == {"plate", "24h_default", "prohibition"}
    for text in STAY_END_REASON.values():
        assert text and not text[0].isupper(), text


def test_dates_are_stated_as_the_plate_states_them():
    """`Gäller ej 1 juli - 31 juli` — это «кроме июля». Человек на знаке читает
    исключение и видеть должен исключение, а не пересказ оставшихся промежутков."""
    from parkread.present import _time_phrase

    friday = {"from": "00:00", "to": "06:00", "day_class": "named_weekday",
              "named_weekday": "friday"}
    phrase = _time_phrase({"time_windows": [
        dict(friday, dates={"mode": "except",
                            "ranges": [{"from": "07-01", "to": "07-31"}]})]})
    assert "all year except July" in phrase, phrase
    assert "January" not in phrase and "December" not in phrase, phrase


def test_single_excluded_days_are_named_as_days():
    """`Gäller ej 15/6 15/8` — два дня, а не лето. Пересказать их месяцами значило бы
    отнять у водителя два месяца стоянки."""
    from parkread.present import _time_phrase
    phrase = _time_phrase({"time_windows": [
        {"from": "00:00", "to": "06:00", "day_class": "named_weekday",
         "named_weekday": "friday",
         "dates": {"mode": "except", "ranges": [{"from": "06-15", "to": "06-15"},
                                                {"from": "08-15", "to": "08-15"}]}}]})
    assert "all year except 15 June and 15 August" in phrase, phrase


def test_a_season_keeps_its_day_precision():
    """`1 nov-15 maj` называется до дня. Округление до целых месяцев — ровно то,
    ради чего поле переписано с месяцев на даты."""
    from parkread.present import _time_phrase
    phrase = _time_phrase({"time_windows": [
        {"from": "12:00", "to": "15:00", "day_class": "named_weekday",
         "named_weekday": "tuesday",
         "dates": {"mode": "only", "ranges": [{"from": "11-01", "to": "05-15"}]}}]})
    assert "from 1 November to 15 May inclusive" in phrase, phrase


def test_a_whole_month_is_named_by_its_month():
    """`07-01 … 07-31` — это июль. Пересказывать его как «с 1 по 31 июля» точно
    и нечитаемо."""
    from parkread.present import _range_name
    assert _range_name({"from": "07-01", "to": "07-31"}) == "July"
    assert _range_name({"from": "06-15", "to": "06-15"}) == "15 June"
    assert _range_name({"from": "11-01", "to": "05-15"}) == "1 November to 15 May"



def test_the_window_never_claims_to_be_the_driver_s_plan():
    """Шкала показывает ОКНО, а не намерение водителя. Прежние подписи — «Park end»
    и «to the end of this stay» — читались как «водитель простоит всё это время»,
    хотя он может уехать через 45 минут. И как «после этого стоянки не будет»,
    хотя знак продолжает действовать, а окна идут одно за другим."""
    page = (ROOT / "web/src/components/PeriodTimeline.tsx").read_text(encoding="utf-8")

    assert 'title="Window starts"' in page
    assert 'title="Window ends"' in page
    assert "the sign carries on" in page and "more windows to follow" in page
    assert "max" in page, "длительность отрезка названа пределом, а не планом"
    # Ищем именно подписи узлов, а не любое упоминание: комментарий про старое
    # название — не то же самое, что старое название на экране.
    for gone in ('title="Park start"', 'title="Park end"', "end of this stay"):
        assert gone not in page, gone


def test_a_ban_at_the_selected_time_is_shown_before_the_window():
    """Запрет в начале — это ДО окна, а не часть его. Раньше узел говорил, что окно
    начинается в 06:00, а первый его отрезок шёл с 02:15: подпись и содержимое
    противоречили друг другу, а стык повторял 06:00 второй раз."""
    page = (ROOT / "web/src/components/PeriodTimeline.tsx").read_text(encoding="utf-8")
    rule = (ROOT / "web/src/lib/period.ts").read_text(encoding="utf-8")
    assert 'title="Your selected start time"' in page
    # Само деление переехало в `lib/period` — там оно и проверяется тестом,
    # а не сверкой строк исходника.
    assert "splitWindow(periods)" in page
    assert 'periods[i].tone === "prohibited"' in rule
    # Окна может не быть вовсе: тогда нет и узла его конца.
    assert "{last && (" in page and 'title="Window ends"' in page
    # «max» относится к стоянке; там, где знак её не даёт, длительность точная
    assert "isStayLimit(p.tone)" in page
    assert 'tone !== "prohibited" && tone !== "not_stated"' in rule


def test_the_ban_period_itself_is_still_computed():
    """Сам запрет никуда не делся: движок его считает, и время снятия видно.
    Убрать его с экрана значило бы промолчать о том, что стоять сейчас нельзя."""
    from datetime import datetime
    from parkread.calendar_se import Calendar
    from parkread.engine import evaluate_parking_rules

    cal = Calendar()
    friday = {"from": "00:00", "to": "06:00", "day_class": "named_weekday",
              "named_weekday": "friday"}
    doc = {"schema_version": 1,
           "main_sign": {"type": "parking", "background_color": "blue",
                         "form": "regular", "legibility": {"readable": True}},
           "panel_count": 1, "boundaries": {"certain": True},
           "panels": [{"index": 1, "kind": "sign_plate", "lines": ["Fredag 0-6"],
                       "background_color": "yellow",
                       "legibility": {"readable": True},
                       "parsed": {"prohibition": True, "time_windows": [friday]}}]}
    r = evaluate_parking_rules(doc, datetime(2026, 9, 4, 2, 15), cal).regimes[0]
    assert r.periods[0].state == "prohibited"
    assert r.periods[0].end == datetime(2026, 9, 4, 6, 0), "запрет снимается в 06:00"


def test_a_hyphenated_word_is_joined_back_into_one_word():
    """Шведские таблички переносят слово с дефисом: `Beskicknings-` / `fordon` —
    это одно слово, а не два. Склеивать их пробелом значит показывать слово,
    которого нет ни на знаке, ни в языке."""
    from parkread.present import _join_lines
    assert _join_lines(["Beskicknings-", "fordon"]) == "Beskickningsfordon"
    # дефис внутри строки — не перенос, а часть записи времени
    assert _join_lines(["2 tim", "8-18", "(8-15)"]) == "2 tim 8-18 (8-15)"
    assert _join_lines(["0-12 m"]) == "0-12 m"


def test_an_uninterpreted_panel_does_not_repeat_its_own_text():
    """Текст панели уже напечатан строкой выше. Повторять его в пометке значит
    показать одно и то же дважды, да ещё разбитым на строки таблички.

    Проверяется теперь готовая подпись из `present.py`, а не строка в вёрстке:
    формулировка переехала в Python вместе с остальными словами о знаке.
    """
    from parkread.present import _not_interpreted

    панель = {"kind": "sign_plate", "lines": ["Beskicknings-", "fordon"]}
    подпись = _not_interpreted(панель, [], ["Beskicknings-", "fordon"])
    assert подпись == "Not interpreted — shown above exactly as printed", подпись
    assert "Beskicknings" not in подпись

    # у панели с понятыми ключами остаток всё-таки называется: строкой выше
    # напечатано не оно
    с_ключами = _not_interpreted(панель, ["boende"], ["Ci"])
    assert с_ключами == "Not interpreted: Ci", с_ключами


def test_an_unknown_plate_is_named_in_who_can_park():
    """Правило асимметрии: при неполном разборе можно сузить, но не расширить.
    Знак `Beskickningsfordon` сообщал «стоянка для всех транспортных средств» —
    формально верно, потому что дипломатические машины бывают любого типа,
    и ровно поэтому опасно: водитель, к этому кругу не относящийся, читал
    разрешение там, где на знаке стоит непонятое ограничение."""
    from parkread.present import _who_can_park
    from parkread.engine import Regime
    from parkread.reference import Reference

    ref = Reference(ROOT / "reference/signs")
    regime = Regime(extent="here", eligibility=[], place_notes=[], periods=[])

    plain = _who_can_park(ref, regime, "main-parking", unknown_plates=False)
    guarded = _who_can_park(ref, regime, "main-parking", unknown_plates=True)

    assert len(guarded) == len(plain) + 1
    assert "may narrow who these spaces are for" in guarded[-1]["text"]
    # Оговорка общая: она не притворяется, что знает содержание таблички
    assert guarded[-1]["known"] is False


def test_no_time_key_is_left_out_of_the_composed_phrase():
    """`_TIME_KEYS` перечисляет ключи, уходящие в общую фразу о времени. Забытый
    ключ выходит на экран второй строкой и повторяет то, что фраза уже сказала —
    так и случилось при переименовании `manadsintervall` в `datumintervall`.

    Проверяется не список, а свойство: всякая запись справочника с кодом `T6`
    описывает время, а значит обязана быть в списке."""
    from parkread.present import _TIME_KEYS
    from parkread.reference import Reference
    t6 = {e.key for e in Reference(ROOT / "reference/signs").all() if e.code == "T6"}
    assert t6 == _TIME_KEYS, {"забыты": sorted(t6 - _TIME_KEYS),
                              "лишние": sorted(_TIME_KEYS - t6)}


def test_every_schema_value_reaches_the_reference():
    """Значение схемы без записи в справочнике — тупик: модель читает его верно,
    ключа не находится, и указание молча исчезает из разбора.

    Так и было с `vehicle_class: bus` на снимке `038`. Проверяется не список, а само
    свойство: всякое значение перечисления обязано доходить до существующей записи."""
    import json
    from parkread.reference import ELIGIBILITY_KEYS, VEHICLE_KEYS, Reference

    ref = Reference(ROOT / "reference/signs")
    parsed = json.loads((ROOT / "schema/sign.schema.json")
                        .read_text(encoding="utf-8"))["$defs"]["parsed"]["properties"]

    for field, table in (("vehicle_class", VEHICLE_KEYS),
                         ("eligibility", ELIGIBILITY_KEYS)):
        values = set(parsed[field]["enum"])
        # `custom` намеренно не сопоставляется: он означает «ничего из списка
        # не подошло», и записи справочника под него нет и быть не может.
        values.discard("custom")
        assert values <= set(table), {field: sorted(values - set(table))}
        for value in values:
            assert ref.get(table[value]) is not None, (field, value, table[value])


def test_the_vehicle_table_exists_in_one_place_only():
    """Таблиц было две — в справочнике и в движке, — и значение, добавленное
    в схему, приходилось вносить в оба места. Автобус внесли в схему и забыли
    здесь; так снимок `038` и потерял указание."""
    engine_src = (ROOT / "parkread/engine.py").read_text(encoding="utf-8")
    assert "VEHICLE, WHO = VEHICLE_KEYS, ELIGIBILITY_KEYS" in engine_src
    assert '"motorcycle": "pictogram-motorcycle"' not in engine_src, \
        "движок снова завёл собственную копию таблицы"


def test_an_endless_prohibition_is_marked_as_reaching_the_horizon():
    """Знак `007` запрещает стоянку бессрочно: жёлтая зона плюс `Förhyrda platser`.
    Период такого знака упирается в край расчёта, а не кончается.

    Флаг `ends_at_horizon` — единственное, по чему интерфейс может отличить
    «кончается вот тогда» от «дальше мы не смотрим». Найдено на обкатке: дату
    продукт скрывал, а длительность показывал, и отрезок сообщал «169 h 30 min»
    там, где у запрета конца нет вовсе. Число это — край горизонта (восемь суток
    до полуночи), то есть свойство расчёта, а не знака.
    """
    photo = ROOT / "testset/photos/007-gul-forbud-forhyrda-platser.jpg"
    with tempfile.TemporaryDirectory() as t:
        r = _post(_client(Path(t)), photo,
                  moment="2026-09-04T22:29").get_json()["regimes"][0]

        последний = r["periods"][-1]
        assert последний["state"] == "prohibited", последний["state"]
        assert последний["ends_at_horizon"], "запрет без конца обязан быть помечен"
        # Конца стоянки у такого знака нет: стоять нельзя вовсе.
        assert r["duration_expires_at"] is None, r["duration_expires_at"]


def test_the_window_says_who_it_is_for_when_it_is_not_for_everyone():
    """Найдено на обкатке: под «Who can park here» стояло, что места отведены
    держателям разрешения для инвалидов, а на шкале — только «Parking fee»
    и длительность. Человек смотрит на шкалу, когда решает про СВОЁ время,
    и там круг стоящих терялся: окно выглядело годным для всех.

    Подпись берётся короткой формой из справочника — той же записи, что даёт
    длинный текст в блоке круга. Два места, две длины, один источник.
    """
    photo = ROOT / "testset/photos/008-rorelsehindrad-avgift.jpg"
    with tempfile.TemporaryDirectory() as t:
        r = _post(_client(Path(t)), photo).get_json()["regimes"][0]
        тексты = [x["text"] for x in r["window_for"]]
        assert тексты == ["A disabled parking permit is required"], тексты
        # длинная форма на месте и не подменена короткой
        assert any("disabled parking permit" in x["text"] for x in r["who_can_park"])


def test_a_sign_for_everyone_says_nothing_extra_under_the_window():
    """Обратная сторона: у обычного `P` уточнять нечего, и строка «для всех»
    была бы шумом. Без этой проверки подпись расползётся на все знаки подряд."""
    photo = ROOT / "testset/photos/003-p-2tim.jpg"
    with tempfile.TemporaryDirectory() as t:
        r = _post(_client(Path(t)), photo).get_json()["regimes"][0]
        assert r["window_for"] == [], r["window_for"]


def test_a_complementary_plate_is_not_mistaken_for_the_circle():
    """`Boende` круг не сужает: он сообщает, что у жильцов свои условия.
    Показать его как «окно для жильцов» значило бы намекнуть, что остальным
    нельзя, — ровно та ошибка, ради которой таблички и разведены на два рода."""
    photo = ROOT / "testset/photos/033-avgift-8-21-uppstallning-zon-e-boende-storskogen.png"
    with tempfile.TemporaryDirectory() as t:
        режимы = _post(_client(Path(t)), photo).get_json()["regimes"]
        с_жильцами = [r for r in режимы if r["notes"]]
        assert с_жильцами, "режим с табличкой жильцов не найден"
        for r in с_жильцами:
            assert r["window_for"] == [], r["window_for"]


def test_under_a_prohibition_the_circle_is_named_as_an_exception():
    """`007`: жёлтый запрет плюс `Förhyrda platser`. Табличка тут не сужает
    разрешение — она вводит ИСКЛЮЧЕНИЕ из запрета, и расшифровка снимка это
    прямо называет обратной логикой по сравнению с синими стопками.

    Без оговорки та же короткая подпись прочтётся наоборот: «здесь нельзя стоять
    именно арендаторам». Формулировка при этом остаётся утверждением о ЗНАКЕ:
    «unless you have rented the spot» было бы про читателя, а относится ли он
    к названному кругу, продукт не знает и знать не может.
    """
    photo = ROOT / "testset/photos/007-gul-forbud-forhyrda-platser.jpg"
    with tempfile.TemporaryDirectory() as t:
        r = _post(_client(Path(t)), photo).get_json()["regimes"][0]
        # строка стоит под ЗАПРЕЩАЮЩИМ отрезком: исключение без запрета
        # рядом повисло бы без предмета
        assert all(p["state"] == "prohibited" for p in r["periods"] if p["aside"])
        тексты = [x["text"] for x in r["window_for"]]
        assert тексты == ["The sign names an exception: Rented spaces"], тексты
        # про читателя не сказано ни слова
        assert not any(" you " in x["text"].lower() for x in r["window_for"])


def test_under_a_permission_the_circle_is_not_called_an_exception():
    """Обратная сторона: под синим `P` та же строка — круг окна, а не исключение.
    Перепутать значит сказать противоположное, и оба направления стоят проверки."""
    photo = ROOT / "testset/photos/004-endast-besokande-pingstkyrkan.jpg"
    with tempfile.TemporaryDirectory() as t:
        r = _post(_client(Path(t)), photo).get_json()["regimes"][0]
        assert all(p["state"] == "allowed" for p in r["periods"] if p["aside"])
        assert [x["text"] for x in r["window_for"]] == ["Visitors only"]


def test_each_window_says_which_stretch_it_covers():
    """`010`: две стрелки задают ДВА разных правила — слева просто арендованные
    места, справа арендованные плюс особое разрешение. Продукт показывал два окна,
    ничем не подписанных, и со стороны они выглядели повтором.

    Участок при этом вычислялся всегда и на экран не выводился вовсе: поле
    `extent_text` не читал ни один компонент. Короткая форма — заголовком окна.
    """
    photo = ROOT / "testset/photos/010-forhyrda-platser-tva-pilar.jpg"
    with tempfile.TemporaryDirectory() as t:
        режимы = _post(_client(Path(t)), photo).get_json()["regimes"]
        assert len(режимы) == 2, len(режимы)
        assert [r["extent_short"] for r in режимы] == [
            "To the left of the sign", "To the right of the sign"]
        # и правила у них действительно разные — иначе окна стоило бы слить
        assert режимы[0]["who_can_park"] != режимы[1]["who_can_park"]


def test_every_extent_the_engine_can_produce_has_a_short_caption():
    """Участок приходит готовой подписью, а не служебным токеном (решение 80).
    Пропущенное значение вылезло бы на экран словом `both_directions`."""
    from parkread import present
    from parkread.engine import _ARROW_EXTENT

    участки = set(_ARROW_EXTENT.values()) | {"here"}
    пропущены = участки - set(present.EXTENT_SHORT)
    assert not пропущены, пропущены
    assert set(present.EXTENT_SHORT) == set(present.EXTENT_TEXT)


def test_no_line_under_a_window_is_printed_twice():
    """Найдено на обкатке, `010` справа: «The sign requires a special parking permit»
    строкой условия и «A special parking permit is required» строкой круга — одна
    табличка дважды, разными словами.

    Причина в двойной природе разрешения: оно и условие стоянки, и признак круга,
    и два механизма вывели его каждый по-своему. Проверка идёт по КЛЮЧУ справочника,
    а не по тексту: тексты у длинной и короткой формы разные, и по ним повтор
    как раз не виден — этим он и оказался незаметен.

    Меряется весь набор: повтор такого рода легко завести снова, добавив
    ещё одну строку под отрезок.
    """
    from datetime import datetime

    from parkread import config, pipeline, present
    from parkread.calendar_se import Calendar
    from parkread.photo import Photo
    from parkread.reference import Reference
    from parkread.validation import Validator

    cfg = replace(config.load(), demo_mode=True)
    val, ref = Validator(cfg.schema_path), Reference(cfg.reference_path)
    cal = Calendar()
    moment = datetime(2026, 3, 2, 12)

    беда = []
    for photo in sorted((ROOT / "testset/photos").iterdir()):
        if photo.suffix.lower() not in (".jpg", ".png"):
            continue
        if not (cfg.demo_fixtures_path / f"{photo.stem}.extract.json").exists():
            continue
        d = present.to_json(
            pipeline.analyze(Photo.from_path(photo), cfg, val, ref, cal, moment),
            ref, moment, cal)
        for r in d["regimes"]:
            круг = [t["key"] for t in r["window_for"]] + [t["key"] for t in r["notes"]]
            for p in r["periods"]:
                вместе = [t["key"] for t in p["notes"]] + круг
                if len(вместе) != len(set(вместе)):
                    беда.append((photo.stem, sorted(вместе)))
    assert not беда, беда


def test_a_plate_bound_to_hours_is_not_printed_as_the_circle_of_the_window():
    """`012`: разрешение требуется с 7 до 17, в остальное время довольно платы.

    Строка круга стояла под НОЧНЫМ отрезком и говорила «A special parking permit
    is required» там, где достаточно заплатить. Движок кладёт такое указание
    и в условия отрезка 7-17, и в круг режима — во втором месте оно значит лишь
    «такая табличка на знаке есть», а на экране читалось как правило всего окна.

    Указание, расписанное по часам, сказано у своего отрезка, и сказано точнее.
    """
    photo = ROOT / "testset/photos/012-tillstand-7-17-ovrig-tid-avgift.jpg"
    with tempfile.TemporaryDirectory() as t:
        r = _post(_client(Path(t)), photo,
                  moment="2026-09-06T16:29").get_json()["regimes"][0]

        assert r["window_for"] == [], r["window_for"]
        с_разрешением = [p for p in r["periods"]
                         if any("permit" in n["text"] for n in p["notes"])]
        assert с_разрешением, "разрешение должно остаться у своего отрезка"
        for p in с_разрешением:
            assert p["start"].endswith("07:00"), p["start"]


def test_the_circle_never_names_what_the_timeline_states_by_the_hour():
    """Тот же закон на всём наборе: круг окна и почасовые условия не пересекаются.

    Пересечение означает одно из двух, и оба плохи: либо строка повторится
    дословно, либо — как на `012` — расползётся на часы, к которым не относится.
    """
    from datetime import datetime

    from parkread import config, pipeline, present
    from parkread.calendar_se import Calendar
    from parkread.photo import Photo
    from parkread.reference import Reference
    from parkread.validation import Validator

    cfg = replace(config.load(), demo_mode=True)
    val, ref = Validator(cfg.schema_path), Reference(cfg.reference_path)
    cal = Calendar()
    moment = datetime(2026, 3, 2, 12)

    беда = []
    for photo in sorted((ROOT / "testset/photos").iterdir()):
        if photo.suffix.lower() not in (".jpg", ".png"):
            continue
        if not (cfg.demo_fixtures_path / f"{photo.stem}.extract.json").exists():
            continue
        d = present.to_json(
            pipeline.analyze(Photo.from_path(photo), cfg, val, ref, cal, moment),
            ref, moment, cal)
        for r in d["regimes"]:
            круг = {t["key"] for t in r["window_for"]}
            по_часам = {n["key"] for p in r["periods"] for n in p["notes"]}
            if круг & по_часам:
                беда.append((photo.stem, sorted(круг & по_часам)))
    assert not беда, беда


def test_a_prohibition_with_hours_is_not_stated_as_a_prohibition_always():
    """`019`: знак запрещает стоянку с 7 до 18, в остальное время она платная.
    Шкала это показывала верно, а круг стоящих говорил «The sign prohibits parking»
    без единой оговорки.

    Формулировка бралась у записи справочника, а запись описывает знак вообще,
    безотносительно табличек с часами под ним. Запрет на весь срок и запрет
    с 7 до 18 — разные утверждения, и второе без оговорки читается как первое.
    """
    photo = ROOT / "testset/photos/019-forbud-7-18-avgift-ovrig-tid.jpg"
    with tempfile.TemporaryDirectory() as t:
        r = _post(_client(Path(t)), photo,
                  moment="2026-09-06T19:27").get_json()["regimes"][0]
        строка = r["who_can_park"][0]["text"]
        assert "only during the hours it names" in строка, строка
        # «не запрещает» не равно «разрешает»: вне часов знак молчит,
        # и дальше действуют общие правила
        assert "general parking rules" in строка, строка


def test_a_prohibition_without_hours_keeps_its_plain_wording():
    """Обратная сторона: у `055` разрешённых часов нет вовсе, и оговорка про часы
    там была бы неправдой. Без этой проверки послабление расползётся на все
    запрещающие знаки подряд."""
    photo = ROOT / "testset/photos/055-forbud-stannande-snotackt-pil.jpg"
    with tempfile.TemporaryDirectory() as t:
        r = _post(_client(Path(t)), photo).get_json()["regimes"][0]
        строка = r["who_can_park"][0]["text"]
        assert строка == "The sign prohibits stopping and parking", строка


def test_every_prohibiting_main_sign_has_a_wording_for_the_timed_case():
    """Пропущенный знак молча вернулся бы к формулировке «запрещает всегда» —
    ошибке в сторону строгости, но всё равно неверной. Проверяется по справочнику,
    а не по списку в коде: новая запись обязана попасть в обе таблицы."""
    from parkread import present
    from parkread.reference import Reference

    ref = Reference(Path("reference/signs"))
    запрещающие = {e.key for e in ref.all()
                   if e.key.startswith("main-") and "prohibition" in e.key}
    пропущены = запрещающие - set(present.TIMED_PROHIBITION_TEXT)
    assert not пропущены, пропущены


def test_a_rented_space_gets_no_parking_window():
    """`020`: «Free parking ● 28 h 19 min max» под знаком арендованных мест.

    Оговорка «Rented spaces» строкой ниже верна, а число над ней — нет: оно
    целиком из правила 24 часов, а не со знака. Тому, чьё это место, срок известен
    из договора; всем остальным стоять нельзя вовсе, и предлагать им двадцать
    восемь часов бессмысленно.

    Арендованное место тем и отличается от прочих кругов, что к нему нельзя
    принадлежать: разрешение инвалида предъявляют, а место либо твоё, либо нет.
    """
    photo = ROOT / "testset/photos/020-forhyrda-platser-13-och-14-avstand.jpg"
    with tempfile.TemporaryDirectory() as t:
        r = _post(_client(Path(t)), photo).get_json()["regimes"][0]
        assert r["no_window_text"], "шкала должна быть убрана"
        assert "rented" in r["no_window_text"]
        # круг стоящих при этом никуда не делся: он в своём блоке
        assert any("rented" in x["text"] for x in r["who_can_park"])


def test_a_rented_sign_that_states_its_own_hours_keeps_the_timeline():
    """Обратная сторона, и без неё послабление зайдёт слишком далеко.

    `007` — тоже арендованные места, но знак вводит СВОИ часы: стоянка запрещена.
    Такая шкала несёт настоящее указание, нужное и самому арендатору, и убирать
    её нельзя. Убирается только та, где все отрезки разрешающие, а предел взялся
    из умолчания в 24 часа, — то есть где на шкале нет ничего со знака.
    """
    photo = ROOT / "testset/photos/007-gul-forbud-forhyrda-platser.jpg"
    with tempfile.TemporaryDirectory() as t:
        r = _post(_client(Path(t)), photo).get_json()["regimes"][0]
        assert r["no_window_text"] is None, r["no_window_text"]
        assert r["periods"], "шкала должна остаться"


def test_only_rented_spaces_lose_the_timeline():
    """Прочие круги шкалу сохраняют: посетитель, держатель разрешения, мотоциклист
    — все они могут тут стоять, и «сколько» для них вопрос осмысленный."""
    for имя in ("004-endast-besokande-pingstkyrkan.jpg", "008-rorelsehindrad-avgift.jpg",
                "015-motorcykel.jpg", "003-p-2tim.jpg"):
        with tempfile.TemporaryDirectory() as t:
            r = _post(_client(Path(t)), ROOT / "testset/photos" / имя).get_json()
            for режим in r["regimes"]:
                assert режим["no_window_text"] is None, (имя, режим["no_window_text"])


def test_private_land_is_named_in_both_places_and_keeps_its_timeline():
    """`021` (`Privat parkering / Brf Ängslyckan`).

    Табличка регламентом не предусмотрена — это свободный текст, и поля в схеме
    под неё нет. Но следствие у неё есть: земля частная, стоянка — договор
    с владельцем, а условий владельца на столбе НЕТ. Модель кладёт такую табличку
    в `operator_plate`, и до этой правки запись справочника не доходила до экрана
    ни разу.

    Приговор мягче, чем у арендованных мест: шкала остаётся. `Förhyrda platser`
    утверждает, что место сдано поимённо; `Privat parkering` — только что площадка
    не общедоступна, а сдаются ли места, пускают ли гостей и на сколько, не сказано.
    """
    photo = ROOT / "testset/photos/021-privat-parkering-brf.jpg"
    with tempfile.TemporaryDirectory() as t:
        r = _post(_client(Path(t)), photo).get_json()["regimes"][0]

        assert any("private land" in x["text"] for x in r["who_can_park"]), \
            [x["text"] for x in r["who_can_park"]]
        assert any("Private land" in x["text"] for x in r["window_for"]), \
            [x["text"] for x in r["window_for"]]
        # шкала остаётся, в отличие от арендованных мест
        assert r["no_window_text"] is None
        assert r["periods"], "шкала должна остаться"
        # и общее правило знака никуда не делось: `P` наверху и правда разрешает
        assert any("permits parking" in x["text"] for x in r["who_can_park"])


def test_an_ordinary_sign_says_nothing_about_private_land():
    """Обратная сторона: оговорка появляется только там, где надпись есть."""
    photo = ROOT / "testset/photos/003-p-2tim.jpg"
    with tempfile.TemporaryDirectory() as t:
        r = _post(_client(Path(t)), photo).get_json()["regimes"][0]
        assert not any("private land" in x["text"].lower()
                       for x in r["who_can_park"] + r["window_for"])


def test_the_phrase_matched_in_code_is_the_one_the_article_declares():
    """Опознание идёт по тексту, и оборот объявлен в самой записи справочника.
    Разойдись они — правило молча перестанет срабатывать, а статья останется
    выглядеть рабочей."""
    from parkread.reference import PRIVATE_LAND_PHRASE, Reference

    entry = Reference(Path("reference/signs")).get("privat-parkering")
    assert entry is not None
    assert PRIVATE_LAND_PHRASE in entry.tokens.casefold(), entry.tokens


def test_an_incomplete_parse_marks_its_periods_as_not_vouched_for():
    """Пунктир — не украшение и не частный случай `Privat parkering`.

    Правило общее: продукт ручается за отрезок, только когда разбор ПОЛНЫЙ.
    Не понята табличка, не прочитана, не хватило пикселей на текст, знак отсылает
    к условиям вне себя — во всех этих случаях линия перестаёт быть сплошной,
    а причина названа в блоке полноты.
    """
    for имя in ("021-privat-parkering-brf.jpg",          # частная земля
                "029-beskickningsfordon-0-12m.png",      # табличка не понята
                "061-lastplats-langt-avstand.png"):      # не хватило пикселей
        with tempfile.TemporaryDirectory() as t:
            d = _post(_client(Path(t)), ROOT / "testset/photos" / имя).get_json()
            assert d["completeness"]["category"] != "full", имя
            for r in d["regimes"]:
                assert all(p["certain"] is False for p in r["periods"]), имя


def test_a_complete_parse_keeps_a_solid_line():
    """Обратная сторона: где разобрано всё, линия сплошная. Иначе пунктир
    перестанет что-либо значить — а значит и предупреждать."""
    for имя in ("003-p-2tim.jpg", "008-rorelsehindrad-avgift.jpg",
                "007-gul-forbud-forhyrda-platser.jpg"):
        with tempfile.TemporaryDirectory() as t:
            d = _post(_client(Path(t)), ROOT / "testset/photos" / имя).get_json()
            assert d["completeness"]["category"] == "full", имя
            for r in d["regimes"]:
                assert all(p["certain"] is True for p in r["periods"]), имя


def test_certainty_follows_completeness_across_the_whole_set():
    """Связь та же на всём наборе: пунктир ровно там, где разбор неполон.
    Расхождение означало бы, что линия говорит одно, а блок полноты другое."""
    from datetime import datetime

    from parkread import config, pipeline, present
    from parkread.calendar_se import Calendar
    from parkread.photo import Photo
    from parkread.reference import Reference
    from parkread.validation import Validator

    cfg = replace(config.load(), demo_mode=True)
    val, ref = Validator(cfg.schema_path), Reference(cfg.reference_path)
    cal = Calendar()
    moment = datetime(2026, 3, 2, 12)

    беда = []
    for photo in sorted((ROOT / "testset/photos").iterdir()):
        if photo.suffix.lower() not in (".jpg", ".png"):
            continue
        if not (cfg.demo_fixtures_path / f"{photo.stem}.extract.json").exists():
            continue
        a = pipeline.analyze(Photo.from_path(photo), cfg, val, ref, cal, moment)
        d = present.to_json(a, ref, moment, cal)
        полный = a.assessment.category == "full"
        частная = any("Private land" in t["text"]
                      for r in d["regimes"] for t in r["window_for"])
        for r in d["regimes"]:
            for p in r["periods"]:
                if p["certain"] != (полный and not частная):
                    беда.append((photo.stem, p["certain"], a.assessment.category))
    assert not беда, беда[:5]


def test_a_residents_note_is_repeated_under_every_stretch_of_the_window():
    """`033`: «residents may have separate parking terms» стояло только под первым
    отрезком, а читающий средний — платный — его не видел.

    Примечание относится ко всему окну, значит и к каждой его части. Круг стоящих
    при этом остаётся под отрезками своего рода: исключение из запрета под
    запрещающими, круг окна под разрешающими.
    """
    photo = ROOT / "testset/photos/033-avgift-8-21-uppstallning-zon-e-boende-storskogen.png"
    with tempfile.TemporaryDirectory() as t:
        r = _post(_client(Path(t)), photo,
                  moment="2026-09-06T21:43").get_json()["regimes"][0]
        assert len(r["periods"]) > 1, "нужен знак с несколькими отрезками"
        for p in r["periods"]:
            assert any("residents" in x["text"] for x in p["aside"]), p["start"]


def test_boende_alone_never_makes_the_answer_incomplete():
    """`Boende` — не повод для сомнения: остальным стоять можно, и линия сплошная.

    Табличка жильцов есть в справочнике и сама несёт правило, поэтому она и понята,
    и подтверждает основной знак. Если разбор с ней окажется неполным, причина
    будет другая — и тест назовёт её.
    """
    photo = ROOT / "testset/photos/033-avgift-8-21-uppstallning-zon-e-boende-storskogen.png"
    with tempfile.TemporaryDirectory() as t:
        d = _post(_client(Path(t)), photo, moment="2026-09-06T21:43").get_json()
        assert d["completeness"]["category"] == "full", d["completeness"]["reasons"]
        for r in d["regimes"]:
            assert all(p["certain"] for p in r["periods"])


def test_the_engine_note_reaches_the_screen_as_a_sentence_not_a_token():
    """`037`: на странице стояло `wayfinding_sign_permits_nothing` — служебный токен
    движка, вышедший на экран как есть. Ровно это запрещает решение 80, и ровно
    с этого началась обкатка (запись 1 журнала: «Stretch: here»).

    Заметка приходит парой «токен и текст»: токен нужен замеру, текст — человеку.
    """
    photo = ROOT / "testset/photos/037-hanvisning-p-med-pil.png"
    with tempfile.TemporaryDirectory() as t:
        d = _post(_client(Path(t)), photo).get_json()
        assert d["note"]["token"] == "wayfinding_sign_permits_nothing"
        assert d["note"]["text"].startswith("This sign points the way")
        assert "_" not in d["note"]["text"], d["note"]["text"]


def test_every_note_the_engine_can_produce_has_a_caption():
    """Пропущенная заметка вышла бы на экран токеном — тем же способом, каким
    вышла эта. Проверяется по исходнику движка, а не по памяти."""
    import re

    from parkread import present

    src = Path("parkread/engine.py").read_text(encoding="utf-8")
    токены = set(re.findall(r'note="([a-z_]+)"', src))
    assert токены, "заметок в движке не нашлось — проверка потеряла предмет"
    пропущены = токены - set(present.NOTE_TEXT)
    assert not пропущены, пропущены


def test_a_plate_with_an_unknown_symbol_narrows_instead_of_widening():
    """Табличка с рисунком, которого справочник не знает, обязана СУЖАТЬ ответ.

    Найдено на снимке `042` (велосипед): пиктограмма приходила как
    `pictogram: other` без текста, не считалась ни непрочитанной, ни непонятой,
    и знак читался как «стоянка для всех транспортных средств».

    С тех пор велосипед заведён отдельным классом (`T8-8`, решение 101), и на этом
    снимке случай больше не воспроизводится — что и правильно. Но само свойство
    никуда не делось: любой другой неизвестный рисунок обязан вести себя так же,
    поэтому проверка перешла со снимка на СВОЙСТВО и от прогонов не зависит.
    """
    from parkread.completeness import PARTIAL, grade
    from parkread.reference import Reference, recognise

    знак = {
        "schema_version": 1,
        "main_sign": {"type": "parking", "background_color": "blue",
                      "form": "regular", "legibility": {"readable": True}},
        "panels": [{"index": 1, "kind": "sign_plate", "lines": [],
                    "background_color": "blue", "legibility": {"readable": True},
                    "parsed": {"pictogram": "other"}}],
        "panel_count": 1, "boundaries": {"certain": True},
    }
    rec = recognise(знак, Reference(ROOT / "reference/signs"))
    assert rec.panel_keys[1] == [], rec.panel_keys
    assert 1 in rec.uninterpreted, "бессловесная табличка обязана считаться непонятой"

    a = grade(знак, flags=["uninterpreted_panels:1"])
    assert a.category == PARTIAL, a.category
    assert a.uninterpreted_plates == [1]


def test_a_plate_the_reference_knows_is_not_called_uninterpreted():
    """Обратная сторона: у понятой таблички подписи нет вовсе. Без этого
    послабление превратит каждую бессловесную пиктограмму в «не понято»,
    а их в наборе много — стрелки, коляска, мотоцикл."""
    for имя in ("015-motorcykel.jpg", "017-rorelsehindrad.jpg",
                "032-rorelsehindrad-pil-hoger.png"):
        with tempfile.TemporaryDirectory() as t:
            d = _post(_client(Path(t)), ROOT / "testset/photos" / имя).get_json()
            for pan in d["what_we_saw"]["panels"]:
                assert pan["not_interpreted_text"] is None, (имя, pan["index"])


def test_the_bicycle_symbol_is_a_class_of_its_own():
    """`T8-8` — знак регламента, такая же разновидность символьной таблички, как
    мотоцикл, автобус, грузовик и легковой автомобиль, давно бывшие в справочнике.
    Указан разработчиком после снимка `042`, где велосипед приезжал как `other`
    и ограничение исчезало.

    **Мопед поделён между двумя пиктограммами, и это единственный такой случай:**
    класс II идёт с велосипедом, класс I — с мотоциклом. Перепутать значит
    отправить мопедиста не на ту стоянку, поэтому обе статьи говорят об этом прямо.
    """
    from parkread.reference import VEHICLE_KEYS, Reference

    ref = Reference(ROOT / "reference/signs")
    assert VEHICLE_KEYS["bicycle"] == "pictogram-bicycle"

    велосипед = ref.get("pictogram-bicycle")
    assert велосипед is not None and велосипед.code == "T8"
    assert "class II" in велосипед.en, велосипед.en

    мотоцикл = ref.get("pictogram-motorcycle")
    assert "класса I" in мотоцикл.body, "статья мотоцикла обязана называть класс I"
    assert "класса II" in велосипед.body, "статья велосипеда — класс II"


def test_every_reason_the_code_can_produce_has_a_caption():
    """Служебное слово на странице — та же ошибка, что и «Stretch: here» в самом
    начале обкатки. За два дня она вышла дважды: `wayfinding_sign_permits_nothing`
    и `triage:other_road_sign`.

    Причина одна: `_explain` возвращал сам токен, когда подписи не находилось.
    Теперь он возвращает пустую строку, а страница пустое не печатает, — но тогда
    новая причина исчезнет молча. Ловит это здесь: перечисляются ВСЕ причины,
    которые `grade()` умеет породить, и у каждой обязана быть подпись.
    """
    from parkread import present
    from parkread.completeness import grade

    schema = json.loads((ROOT / "schema/triage.schema.json").read_text(encoding="utf-8"))
    отказы = [c for c in schema["properties"]["category"]["enum"] if c != "parking_sign"]

    причины = set()
    for кат in отказы:
        причины |= set(grade(None, triage_category=кат).reasons)
    причины |= set(grade(None, schema_valid=False).reasons)

    # разбор с каждым мыслимым изъяном сразу
    плохой = {
        "schema_version": 1,
        "main_sign": {"type": "unknown", "background_color": "blue", "form": "regular",
                      "legibility": {"readable": False}},
        "panels": [{"index": 1, "kind": "sign_plate", "lines": [], "parsed": {},
                    "background_color": "yellow", "legibility": {"readable": False}}],
        "panel_count": 1, "boundaries": {"certain": False},
    }
    причины |= set(grade(плохой, flags=["panel_count_disagreement:1!=2",
                                        "uninterpreted_panels:1"],
                         repairs=["что-то починили"], image_pixels=10).reasons)

    без_подписи = sorted(
        t for t in причины
        if not present._explain(t, present.REASON_TEXT)["text"])
    assert not без_подписи, без_подписи


def test_an_unknown_token_never_reaches_the_screen_as_itself():
    """Запасной выход закрыт: подписи нет — текста нет. Токен при этом остаётся
    в ответе, он нужен замеру."""
    from parkread import present

    пара = present._explain("совершенно_новый_повод", present.REASON_TEXT)
    assert пара["token"] == "совершенно_новый_повод"
    assert пара["text"] == ""


def _fake_stages(ответы):
    """Подменить обе стадии: отсев всегда пропускает, извлечение отдаёт ответы
    по списку. Нужно, чтобы проверить переспрос без единого обращения к модели."""
    from parkread import pipeline
    from parkread.validation import Validator
    from parkread.vision import ExtractOutcome, TriageOutcome

    звонки = []
    val = Validator(ROOT / "schema")

    def извлечение(image, cfg, validator, panels_seen=None):
        doc = ответы[min(len(звонки), len(ответы) - 1)]
        звонки.append(doc)
        res = validator.sign(json.loads(json.dumps(doc)), panels_seen)
        return ExtractOutcome(res.data, res, from_demo=False)

    def отсев(image, cfg, validator):
        return TriageOutcome("parking_sign", "", None, from_demo=False,
                             validation=val.triage({"category": "parking_sign",
                                                    "what_i_see": ""}))

    было = (pipeline.extract_sign_data, pipeline.classify_image)
    pipeline.extract_sign_data, pipeline.classify_image = извлечение, отсев
    return звонки, было


_ПЛОХОЙ = {"schema_version": 1,
           "main_sign": {"type": "unknown", "background_color": "blue",
                         "form": "regular", "legibility": {"readable": True}},
           "panels": [], "panel_count": 0, "boundaries": {"certain": False}}
_ХОРОШИЙ = {"schema_version": 1,
            "main_sign": {"type": "parking", "background_color": "blue",
                          "form": "regular", "legibility": {"readable": True}},
            "panels": [{"index": 1, "kind": "sign_plate", "lines": ["2 tim"],
                        "background_color": "blue",
                        "legibility": {"readable": True},
                        "parsed": {"duration_limit": {"amount": 2, "unit": "hours"}}}],
            "panel_count": 1, "boundaries": {"certain": True}}


def _run_with(ответы, demo=False):
    from parkread import pipeline
    from parkread.photo import Photo
    from parkread.reference import Reference
    from parkread.validation import Validator

    звонки, было = _fake_stages(ответы)
    try:
        cfg = _cfg(Path("."), demo=demo)
        out = pipeline.run(Photo("тест.png", b"PNG"), cfg,
                           Validator(cfg.schema_path), Reference(cfg.reference_path))
    finally:
        pipeline.extract_sign_data, pipeline.classify_image = было
    return звонки, out


def test_a_reading_that_says_too_little_is_asked_once_more():
    """Найдено разработчиком в браузере: `049` и `056` с первой попытки дали
    «прочитано слишком мало», со второй разобрались целиком.

    Квота тут ни при чём: отказ провайдера повторяется сам, а если всё же
    не удался — возвращается ошибкой и в разбор не превращается. Это разброс
    самой модели: один снимок, один вопрос, разные ответы.
    """
    звонки, out = _run_with([_ПЛОХОЙ, _ХОРОШИЙ])
    assert len(звонки) == 2, "переспросить нужно было один раз"
    assert "extraction_retried" in out.flags
    assert out.extraction.data["main_sign"]["type"] == "parking", "взят лучший ответ"


def test_the_retry_happens_once_and_not_in_a_loop():
    """Оба ответа плохи — второго переспроса нет. Иначе на безнадёжном кадре
    продукт молотил бы вызовы, пока не кончится квота."""
    звонки, out = _run_with([_ПЛОХОЙ, _ПЛОХОЙ])
    assert len(звонки) == 2, звонки
    assert "extraction_retried" in out.flags
    assert out.extraction.data["main_sign"]["type"] == "unknown", "остался первый"


def test_a_good_reading_is_never_asked_twice():
    """Обратная сторона: переспрос стоит вызова, и тратить его на разбор,
    которым продукт доволен, незачем."""
    звонки, out = _run_with([_ХОРОШИЙ, _ПЛОХОЙ])
    assert len(звонки) == 1, звонки
    assert "extraction_retried" not in out.flags


def test_demo_mode_never_asks_again():
    """В демо-режиме ответ лежит в фикстуре и от повтора не изменится:
    переспрос там — лишний обход диска и обманчивый флаг в ответе."""
    звонки, out = _run_with([_ПЛОХОЙ, _ХОРОШИЙ], demo=True)
    assert len(звонки) == 1, звонки
    assert "extraction_retried" not in out.flags
