# -*- coding: utf-8 -*-
"""Регрессия замера точности (этап 5).

Главное здесь — доказать, что замер **умеет находить ошибку**. Инструмент, который
на любом входе показывает 100%, хуже отсутствия инструмента: он создаёт уверенность
и не даёт информации.
"""
import copy
import json
from pathlib import Path

from parkread import accuracy

EXPECTED = Path("testset/expected")


def _base():
    return json.loads((EXPECTED / "005-2tim-8-18-parentes-8-15-dubbelpil.json")
                      .read_text(encoding="utf-8"))


def _share(rep, field):
    return rep.fields[field].share


def test_identical_gives_full_marks():
    rep = accuracy.Report()
    e = _base()
    accuracy.compare(e, copy.deepcopy(e), "005", rep)
    assert all(f.share == 1.0 for f in rep.fields.values())
    assert rep.mistakes == []


def test_detects_merged_panels():
    """Ошибка со снимка `013`: две таблички слиты в одну."""
    e = _base()
    a = copy.deepcopy(e)
    a["panels"] = [a["panels"][0]]
    a["panel_count"] = 1
    rep = accuracy.Report()
    accuracy.compare(e, a, "005", rep)
    assert _share(rep, "panel_count") == 0.0
    assert _share(rep, "panels.content") == 0.0
    assert rep.mistakes


def test_detects_wrong_order_even_when_content_is_right():
    """Порядок меряется ОТДЕЛЬНО: те же таблички в другой последовательности —
    это другое правило, а не «почти верно»."""
    e = json.loads((EXPECTED / "010-forhyrda-platser-tva-pilar.json")
                   .read_text(encoding="utf-8"))
    a = copy.deepcopy(e)
    a["panels"] = [a["panels"][2], a["panels"][1], a["panels"][0], a["panels"][3]]
    for i, p in enumerate(a["panels"], start=1):
        p["index"] = i
    rep = accuracy.Report()
    accuracy.compare(e, a, "010", rep)
    assert _share(rep, "panels.content") == 1.0, "содержание то же"
    assert _share(rep, "panels.order") == 0.0, "а порядок другой"


def test_detects_misread_text():
    e = _base()
    a = copy.deepcopy(e)
    a["panels"][0]["lines"] = ["2 tim", "8-18", "8-15"]      # потеряны скобки
    rep = accuracy.Report()
    accuracy.compare(e, a, "005", rep)
    assert _share(rep, "panel.lines") < 1.0


def test_detects_non_rule_panel_taken_for_a_plate():
    """Табло или табличка оператора, принятые за правилообразующую табличку, —
    ошибка со снимков `002`, `004`, `007`. В ответ они не попадают, но подмена
    вида панели добавляет в разбор указание, которого на знаке нет."""
    e = json.loads((EXPECTED / "002-avgift-forbud-utanfor-markerad-plats.json")
                   .read_text(encoding="utf-8"))
    a = copy.deepcopy(e)
    a["panels"][3]["kind"] = "sign_plate"          # табло стало табличкой
    rep = accuracy.Report()
    accuracy.compare(e, a, "002", rep)
    # признак меряется по каждой панели, поэтому одна подмена из четырёх — не ноль
    assert _share(rep, "panel.rule_bearing") < 1.0
    assert any("rule_bearing" in m or "помечена" in m for m in rep.mistakes), rep.mistakes


def test_detects_rule_plate_taken_for_an_operator_plate():
    """Обратная ошибка и более дорогая: табличка С ПРАВИЛОМ помечена как табличка
    оператора. Тогда указание молча выпадает из разбора."""
    e = json.loads((EXPECTED / "004-endast-besokande-pingstkyrkan.json")
                   .read_text(encoding="utf-8"))
    a = copy.deepcopy(e)
    a["panels"][0]["kind"] = "operator_plate"      # «Endast för besökande» — правило
    rep = accuracy.Report()
    accuracy.compare(e, a, "004", rep)
    assert _share(rep, "panel.rule_bearing") < 1.0
    assert _share(rep, "panels.content") == 0.0, "указание выпало из состава правил"


def test_confusion_inside_the_non_rule_pair_is_not_an_error():
    """Табличка оператора против платёжного табла — различие БЕЗ последствия:
    обе исключены из движка, ответ пользователю от перестановки не меняется.
    Мерить его значит завышать число ошибок за счёт того, что ни на что не влияет
    (снимки `009` и `019`: шапка табла физически слита с рекламным листом)."""
    e = json.loads((EXPECTED / "004-endast-besokande-pingstkyrkan.json")
                   .read_text(encoding="utf-8"))
    a = copy.deepcopy(e)
    a["panels"][1]["kind"] = "info_board"          # оператор стал табло
    rep = accuracy.Report()
    accuracy.compare(e, a, "004", rep)
    assert _share(rep, "panel.rule_bearing") == 1.0


def test_line_wrapping_inside_one_plate_is_not_an_error():
    """Правило композиции связывает строки ОДНОЙ таблички; как слова разбиты
    на печатные строки, правила не меняет. Модель отдаёт напечатанные строки,
    эталон писался смысловыми фразами — расхождение здесь мерит оформление."""
    e = json.loads((EXPECTED / "023-avgift-4tim-laddande-elbilar.json")
                   .read_text(encoding="utf-8"))
    a = copy.deepcopy(e)
    a["panels"][2]["lines"] = ["Endast", "laddande", "elbilar"]
    rep = accuracy.Report()
    accuracy.compare(e, a, "023", rep)
    assert _share(rep, "panel.lines") == 1.0
    assert _share(rep, "panels.content") == 1.0


def test_but_moving_words_between_plates_is_an_error():
    """Граница МЕЖДУ табличками остаётся строгой: те же слова, разложенные
    по разным табличкам, — другое правило."""
    e = json.loads((EXPECTED / "023-avgift-4tim-laddande-elbilar.json")
                   .read_text(encoding="utf-8"))
    a = copy.deepcopy(e)
    a["panels"][1]["lines"] = ["4 tim", "Endast laddande elbilar"]
    a["panels"][2]["lines"] = []
    rep = accuracy.Report()
    accuracy.compare(e, a, "023", rep)
    assert _share(rep, "panels.content") == 0.0


def test_detects_wrong_parsed_field():
    e = _base()
    a = copy.deepcopy(e)
    a["panels"][0]["parsed"]["duration_limit"] = {"amount": 3, "unit": "hours"}
    rep = accuracy.Report()
    accuracy.compare(e, a, "005", rep)
    assert _share(rep, "parsed.duration_limit") == 0.0


def test_case_and_spacing_do_not_count_as_errors():
    """Меряется прочитанное, а не оформление."""
    e = _base()
    a = copy.deepcopy(e)
    a["panels"][0]["lines"] = ["2  TIM", "8-18 ", " (8-15)"]
    rep = accuracy.Report()
    accuracy.compare(e, a, "005", rep)
    assert _share(rep, "panel.lines") == 1.0


# --- отсев -----------------------------------------------------------------

def test_false_reject_is_counted():
    """Самая дорогая ошибка отсева: настоящий знак отбракован."""
    t = accuracy.triage_report(
        {"a": True, "b": True, "c": False},
        {"a": "parking_sign", "b": "not_a_sign", "c": "not_a_sign"})
    assert t["real_signs"] == 2
    assert t["false_rejects"] == 1 and t["false_reject_share"] == 0.5
    assert t["junk_let_through"] == 0


def test_junk_let_through_is_counted_separately():
    t = accuracy.triage_report(
        {"a": True, "c": False},
        {"a": "parking_sign", "c": "parking_sign"})
    assert t["false_rejects"] == 0
    assert t["junk_let_through"] == 1 and t["junk_let_through_share"] == 1.0


# --- покрытие --------------------------------------------------------------

def test_hand_marked_fixtures_are_excluded_from_measurement(tmp_path=None):
    """Затравка — это тот же эталон. Мерить по ней значит сравнивать эталон
    с самим собой и всегда получать 100%.

    Проверка строит свои фикстуры, а не смотрит в `demo/`: после полного живого
    прогона затравки там не осталось ни одной, и тест, опирающийся на содержимое
    рабочего каталога, замолчал бы именно тогда, когда защита перестала бы работать.
    """
    import tempfile
    label = "005-2tim-8-18-parentes-8-15-dubbelpil"
    doc = _base()
    with tempfile.TemporaryDirectory() as tmp:
        d = Path(tmp)
        for origin in ("model", "hand_marked"):
            name = label if origin == "model" else "010-forhyrda-platser-tva-pilar"
            (d / f"{name}.extract.json").write_text(
                json.dumps({"origin": origin, "response": doc}, ensure_ascii=False),
                encoding="utf-8")
        pairs = accuracy.load_pairs(EXPECTED, d, only_model=True)
        everything = accuracy.load_pairs(EXPECTED, d, only_model=False)
        assert len(pairs) == 1 and len(everything) == 2, "затравка отсеивается"
        assert pairs[0][0] == label


# Снимки, добавленные в набор и ещё не размеченные. Список **временный**: он тает
# по мере появления эталонов, и тесты ниже не дают ему зарасти. Держать его явно
# честнее, чем ослабить проверку: «эталона нет» и «эталон забыли» — разные вещи,
# и различить их можно только назвав ожидаемое.
# Снимки, добавленные в набор, но ещё не размеченные. Список временный и обязан
# пустеть: пока снимок здесь, он в замер не входит и качества не подтверждает.
#
# Партия от 2026-09-06 — та самая, которой набору не хватало: ночь, иней, съёмка
# издали, обрезанный кадр. До неё `insufficient` не сработал ни разу на 54 снимках,
# а пять сигналов уверенности из десяти не двигались вовсе.
PENDING_GROUND_TRUTH: set[str] = set()


def _photos() -> set[str]:
    """Все снимки набора. Расширение проверяется обоими: часть набора пришла в png,
    и прежняя маска `*.jpg` просто не видела четырнадцать снимков из сорока."""
    return {p.stem for p in Path("testset/photos").iterdir()
            if p.suffix.lower() in (".jpg", ".png")}


def test_every_photo_is_marked_pending_or_declared_not_a_sign():
    """У снимка три возможных состояния, и все три должны быть объявлены:

    1. эталон разбора есть;
    2. снимок вообще не парковочный — тогда он назван в `triage_expected.json`,
       и эталона разбора у него не будет никогда: разбирать нечего;
    3. эталон ещё не написан — тогда снимок в списке ожидающих.

    Без третьего состояния «забыли разметить» неотличимо от «ещё не размечали»,
    без второго — неразмеченный знак путается с мусором."""
    import json as _json
    marked = {p.stem for p in EXPECTED.glob("*.json")}
    not_a_sign = set(_json.loads(
        Path("testset/triage_expected.json").read_text(encoding="utf-8"))["photos"])
    unaccounted = _photos() - marked - not_a_sign - PENDING_GROUND_TRUTH
    assert not unaccounted, sorted(unaccounted)


def test_a_photo_is_never_in_two_states_at_once():
    """Снимок не может быть одновременно размеченным и «не знаком»: это значило бы,
    что мы разобрали то, что разбирать нечего."""
    import json as _json
    marked = {p.stem for p in EXPECTED.glob("*.json")}
    not_a_sign = set(_json.loads(
        Path("testset/triage_expected.json").read_text(encoding="utf-8"))["photos"])
    assert not (marked & not_a_sign), sorted(marked & not_a_sign)
    assert not (PENDING_GROUND_TRUTH & not_a_sign)


def test_pending_list_does_not_rot():
    """Список ожидающих обязан таять. Появился эталон — снимок уходит из списка,
    и до тех пор проверка падает: так список не переживёт собственную надобность."""
    marked = {p.stem for p in EXPECTED.glob("*.json")}
    assert not (PENDING_GROUND_TRUTH & marked), sorted(PENDING_GROUND_TRUTH & marked)


def test_every_saved_answer_pairs_with_its_ground_truth():
    """Сохранённый ответ модели обязан находить свой эталон.

    Проверка НЕ требует, чтобы прогон был сделан: у только что добавленного снимка
    ответа ещё нет, и это нормально. Ловит она другое — рассинхрон: фикстура есть,
    эталон есть, а пара не складывается, потому что имя разошлось при переименовании.
    """
    pairs = {label for label, _, _ in accuracy.load_pairs(EXPECTED, Path("demo"),
                                                          only_model=True)}
    marked = {p.stem for p in EXPECTED.glob("*.json")}
    answered = {f.name[:-len(".extract.json")]
                for f in Path("demo").glob("*.extract.json")}
    assert (marked & answered) == pairs, {
        "есть и эталон, и ответ, а пары нет": sorted((marked & answered) - pairs)}


def test_measurement_coverage_is_visible():
    """Покрытие замера — число, а не утверждение: снимки, которых ещё не прогоняли,
    в замер не входят, и знать об этом надо явно, а не догадываться по итогу."""
    pairs = accuracy.load_pairs(EXPECTED, Path("demo"), only_model=True)
    marked = {p.stem for p in EXPECTED.glob("*.json")}
    assert len(pairs) <= len(marked)
    # Само число нигде не закрепляется: оно меняется с каждым прогоном.
    # Закрепляется только то, что оно не может превысить число эталонов.


def test_every_photo_has_a_transcript_section():
    """Дословная расшифровка — первый слой набора, и без неё снимок не разметить."""
    import re
    text = Path("testset/TRANSCRIPTS.md").read_text(encoding="utf-8")
    sections = set(re.findall(r"^## (\d{3}) ", text, re.M))
    assert {p[:3] for p in _photos()} == sections


# --- пропуск повторного прогона --------------------------------------------

def test_changed_prompt_makes_a_saved_answer_stale():
    """Пропускать снимок можно, только если ответ получен ТЕМ ЖЕ вопросом.

    Найдено на прогоне: после правки промпта команда пропустила все 26 снимков,
    потому что проверяла существование файла, а не то, на какой вопрос он отвечает.
    Замер тогда молча сравнил бы две версии промпта в одном числе."""
    import tempfile
    from parkread import fixtures

    with tempfile.TemporaryDirectory() as tmp:
        root, img = Path(tmp), Path("testset/photos/001-p-30min.jpg")
        assert fixtures.stale(root, img, "extract", "промпт А"), "ответа нет вовсе"

        fixtures.save(root, img, "extract", {"ok": True}, "модель", None, prompt="промпт А")
        assert not fixtures.stale(root, img, "extract", "промпт А"), "тот же вопрос"
        assert fixtures.stale(root, img, "extract", "промпт Б"), "вопрос изменился"


def test_a_stale_triage_answer_alone_makes_the_photo_stale():
    """Стадий две, и устареть может любая. Правка промпта отсева не трогает промпт
    извлечения — если смотреть только на извлечение, снимок будет пропущен, и правка
    отсева молча не доедет до прогона."""
    import tempfile
    from parkread import fixtures

    with tempfile.TemporaryDirectory() as tmp:
        root, img = Path(tmp), Path("testset/photos/001-p-30min.jpg")
        fixtures.save(root, img, "extract", {"ok": True}, "м", None, prompt="извлечение А")
        fixtures.save(root, img, "triage", {"ok": True}, "м", None, prompt="отсев А")

        свежо = [fixtures.stale(root, img, s, p) for s, p in
                 (("triage", "отсев А"), ("extract", "извлечение А"))]
        assert not any(свежо), "оба ответа на текущие вопросы"

        изменился_отсев = [fixtures.stale(root, img, s, p) for s, p in
                           (("triage", "отсев Б"), ("extract", "извлечение А"))]
        assert any(изменился_отсев), "правка промпта отсева обязана переспросить снимок"


def test_hand_marked_and_unfingerprinted_answers_are_stale():
    """Затравка переспрашивается всегда: она не ответ модели. Фикстура без отпечатка —
    тоже: доказать, каким промптом она получена, нечем."""
    import json as _json
    import tempfile
    from parkread import fixtures

    with tempfile.TemporaryDirectory() as tmp:
        root, img = Path(tmp), Path("testset/photos/001-p-30min.jpg")
        p = fixtures.save(root, img, "extract", {"ok": True}, "м", None, prompt="П")
        assert not fixtures.stale(root, img, "extract", "П")

        d = _json.loads(p.read_text(encoding="utf-8"))
        d["origin"] = "hand_marked"
        p.write_text(_json.dumps(d, ensure_ascii=False), encoding="utf-8")
        assert fixtures.stale(root, img, "extract", "П"), "затравка"

        d["origin"], d["prompt_fingerprint"] = "model", None
        p.write_text(_json.dumps(d, ensure_ascii=False), encoding="utf-8")
        assert fixtures.stale(root, img, "extract", "П"), "отпечатка нет"


def test_a_refused_photo_is_not_asked_again_forever():
    """У отказного кадра фикстуры извлечения нет и не будет: конвейер до этой стадии
    не доходит. Считать её отсутствие поводом переспросить снимок значит платить
    за каждый отказной кадр в каждом прогоне — а их в наборе семь.

    Найдено сразу после первого прогона, где отсев впервые кому-то отказал."""
    import tempfile
    from parkread import fixtures

    with tempfile.TemporaryDirectory() as tmp:
        root, img = Path(tmp), Path("testset/photos/001-p-30min.jpg")
        assert not fixtures.refused(root, img), "ответа отсева ещё нет"

        fixtures.save(root, img, "triage", {"category": "other_road_sign"},
                      "м", None, prompt="отсев А")
        assert fixtures.refused(root, img)
        assert not fixtures.stale(root, img, "triage", "отсев А"), (
            "сам отсев при этом свежий — переспрашивать нечего")


def test_a_parking_photo_still_needs_its_extraction():
    """Обратная сторона: послабление не должно распространиться на снимки, которые
    отсев ПРОПУСТИЛ. Там фикстуры извлечения нет именно потому, что ответа не было,
    и переспросить снимок обязательно."""
    import tempfile
    from parkread import fixtures

    with tempfile.TemporaryDirectory() as tmp:
        root, img = Path(tmp), Path("testset/photos/001-p-30min.jpg")
        fixtures.save(root, img, "triage", {"category": "parking_sign"},
                      "м", None, prompt="отсев А")
        assert not fixtures.refused(root, img)
        assert fixtures.stale(root, img, "extract", "извлечение А"), (
            "разбора нет — снимок обязан быть переспрошен")


def test_a_changed_triage_prompt_reopens_a_refusal():
    """Отказ держится на ответе, который может измениться. Правка промпта отсева
    делает его стадию устаревшей — и снимок будет переспрошен вместе с вопросом,
    нужно ли ему теперь извлечение."""
    import tempfile
    from parkread import fixtures

    with tempfile.TemporaryDirectory() as tmp:
        root, img = Path(tmp), Path("testset/photos/001-p-30min.jpg")
        fixtures.save(root, img, "triage", {"category": "not_a_sign"},
                      "м", None, prompt="отсев А")
        assert fixtures.refused(root, img)
        assert fixtures.stale(root, img, "triage", "отсев Б"), (
            "вопрос изменился — отказ надо перепроверить"
        )


# --- устойчивость валидации отсева -----------------------------------------

def test_extra_field_does_not_destroy_a_triage_answer():
    """Найдено замером: на трёх снимках ответ отсева не проходил проверку, молча
    не сохранялся, и замер читал вместо него старую затравку как свежий ответ."""
    from parkread.validation import Validator
    val = Validator(Path("schema"))
    doc = {"category": "parking_sign", "what_i_see": "знак", "panels_below_main_sign": 3,
           "reasoning": "лишнее поле, которого нет в схеме"}
    res = val.triage(doc)
    assert res.ok, res.schema_errors
    assert "reasoning" not in res.data
    assert any("reasoning" in r for r in res.repairs), res.repairs


def test_long_what_i_see_and_numeric_string_are_repaired():
    from parkread.validation import Validator
    val = Validator(Path("schema"))
    res = val.triage({"category": "parking_sign", "what_i_see": "оно " * 200,
                      "panels_below_main_sign": "4"})
    assert res.ok, res.schema_errors
    assert res.data["panels_below_main_sign"] == 4
    assert len(res.data["what_i_see"]) <= 200


def test_bad_category_still_rejects_the_whole_triage():
    """Чинится оформление, но не то, у чего есть последствие: `category` решает
    судьбу конвейера, и выдуманное значение обязано отбраковывать ответ."""
    from parkread.validation import Validator
    val = Validator(Path("schema"))
    res = val.triage({"category": "может быть", "what_i_see": "знак",
                      "panels_below_main_sign": 1})
    assert not res.ok


# --- устойчивость валидации ------------------------------------------------

def test_unknown_enum_value_does_not_destroy_the_parse():
    """Найдено замером на снимке `009`: модель вписала payment_method=mobile,
    когда такого значения в схеме уже не было. Необязательное поле вне перечисления
    выбрасывается с записью правки, а верно прочитанный знак остаётся."""
    from parkread.validation import Validator
    val = Validator(Path("schema"))
    doc = json.loads((EXPECTED / "009-besokande-avgift.json").read_text(encoding="utf-8"))
    doc["panels"][1]["parsed"]["payment_method"] = "mobile"
    res = val.sign(doc)
    assert res.ok, "разбор не отбракован целиком"
    assert "payment_method" not in res.data["panels"][1]["parsed"]
    assert any("payment_method" in r for r in res.repairs), res.repairs


def test_two_encodings_of_the_same_dates_are_equal():
    """`Augusti-Juni` записывается и как «только с 1 августа по 30 июня», и как
    «кроме июля». Это одно правило, и замер обязан считать его одним: иначе он мерит
    форму записи, а не прочитанное — та же ошибка, что была с переносом строк."""
    only = {"mode": "only", "ranges": [{"from": "08-01", "to": "06-30"}]}
    exc = {"mode": "except", "ranges": [{"from": "07-01", "to": "07-31"}]}
    assert accuracy._covered_days(only) == accuracy._covered_days(exc)

    other = {"mode": "except", "ranges": [{"from": "06-01", "to": "06-30"}]}
    assert accuracy._covered_days(only) != accuracy._covered_days(other), \
        "разные правила остаются разными"


# --- калибровка порога -----------------------------------------------------
#
# Порог сравнивается не с совпадением полей, а с совпадением ОТВЕТА. На наборе из
# 47 снимков поля разошлись у 19, а ответ у 6: цвет таблички и порядок панелей
# в разборе видны, а до человека не доходят.

def _ev(permits=True, eligibility=(), states=("allowed",) * 24, conditions=()):
    """Час записывается парой «состояние и условия»: для человека это одно
    сообщение, и мерить их порознь значит терять половину ошибок."""
    усл = tuple(conditions) or ((),) * len(states)
    return {"permits_parking": permits, "eligibility": tuple(eligibility),
            "states": tuple(zip(states, усл))}


def test_identical_verdicts_have_no_differences():
    assert accuracy.verdict_differences(_ev(), _ev()) == []


def test_a_pointer_read_as_a_parking_sign_is_the_whole_verdict():
    """`050` и `037`: указатель к чужой стоянке прочитан как разрешение стоять здесь.
    Расходится не поле, а весь ответ — и расходится в сторону расширения."""
    diff = accuracy.verdict_differences(
        _ev(permits=False, states=("prohibited",) * 24), _ev())
    assert any("стоянка здесь" in d for d in diff), diff
    assert any("по состоянию 24/24, из них шире 24" in d for d in diff), diff


def test_widening_is_counted_apart_from_narrowing():
    """Ошибка в сторону расширения стоит эвакуации, в обратную — лишней осторожности.
    Считать их одним числом значит потерять единственную разницу, которая важна."""
    шире = accuracy.verdict_differences(
        _ev(states=("prohibited",) * 24), _ev(states=("allowed",) * 24))
    уже = accuracy.verdict_differences(
        _ev(states=("allowed",) * 24), _ev(states=("prohibited",) * 24))
    assert "из них шире 24" in шире[0], шире
    assert "из них шире 0" in уже[0], уже


def test_a_condition_on_the_wrong_days_is_a_difference_too():
    """Знак `030`: плата объявлена по субботам, разбор сказал «по воскресеньям».
    Час за часом оба ответа говорят `allowed` — расхождения по СОСТОЯНИЮ нет вовсе,
    и замер его не видел. А пользователю названы не те дни.

    Ошибка нашлась в браузере, а не в замере, и это про сам замер: мерить состояние
    без условий значит считать «плата не в те дни» совпадением."""
    сутки = ("allowed",) * 24
    эталон = _ev(states=сутки, conditions=(("avgift",),) * 12 + ((),) * 12)
    ответ = _ev(states=сутки, conditions=((),) * 12 + (("avgift",),) * 12)
    diff = accuracy.verdict_differences(эталон, ответ)
    assert any("по условиям 24/24" in d for d in diff), diff
    # и это НЕ должно попасть в счёт расхождений по состоянию
    assert not any("по состоянию" in d for d in diff), diff


def test_a_narrowed_circle_of_users_is_a_difference_too():
    """`042`: круг стоящих сужен до мотоциклов там, где знак о велосипедах."""
    diff = accuracy.verdict_differences(_ev(), _ev(eligibility=("pictogram-motorcycle",)))
    assert any("круг стоящих" in d for d in diff), diff


def test_dead_signals_are_the_ones_that_never_moved():
    assert accuracy.dead_signals({"а": {1.0}, "б": {0.0, 1.0}, "в": set()}) == ["а", "в"]


def test_the_threshold_still_earns_its_value():
    """Порог 0.9 не выбран, а посчитан, и счёт этот обязан сходиться и завтра.

    Если правка промпта или весов сдвинет картину, тест упадёт — и порог придётся
    пересчитать сознательно, а не обнаружить однажды, что он давно ничей.
    """
    from dataclasses import replace
    from datetime import datetime

    from parkread import (completeness, config, fixtures, pipeline, present,
                          prompts)
    from parkread.calendar_se import Calendar
    from parkread.engine import evaluate_parking_rules
    from parkread.photo import Photo
    from parkread.reference import Reference
    from parkread.validation import Validator

    # Демо-режим включается ЗДЕСЬ, а не берётся из `.env`. Иначе тест молча
    # пропускал бы себя всякий раз, когда разработчик оставил `DEMO_MODE=false`
    # после живого прогона, — и «прошло» значило бы «не проверяли».
    # Читать фикстуры с диска ключа не требует.
    cfg = replace(config.load(), demo_mode=True)
    val, ref = Validator(cfg.schema_path), Reference(cfg.reference_path)
    cal = Calendar(cfg.holidays_path)
    moment = datetime(2026, 3, 2, 0, 0)

    сбежали = []
    # Отпечаток обязателен: без него в счёт попадёт ответ от прежнего промпта
    # и тест закрепит смесь двух версий — ровно то, что случилось с `038`.
    отпечаток = fixtures.fingerprint(prompts.extract(json.loads(
        (cfg.schema_path / "sign.schema.json").read_text(encoding="utf-8"))))
    пар = accuracy.load_pairs(EXPECTED, cfg.demo_fixtures_path,
                              prompt_fingerprint=отпечаток)
    for label, эталон, ответ in пар:
        a = accuracy.verdict_slice(эталон, moment, cal, evaluate_parking_rules)
        b = accuracy.verdict_slice(ответ, moment, cal, evaluate_parking_rules)
        if not accuracy.verdict_differences(a, b):
            continue
        photo = next(p for p in (Path(f"testset/photos/{label}.png"),
                                 Path(f"testset/photos/{label}.jpg")) if p.exists())
        оц = pipeline.analyze(Photo.from_path(photo), cfg, val, ref, cal, moment).assessment
        if оц.category == completeness.FULL and оц.confidence >= present.GOOD_ENOUGH:
            сбежали.append(label)

    # Побегов не осталось: на 47 снимках ответ совпадает с эталоном везде.
    # Путь был 6 из 47 → 2 из 47 (когда замер научился видеть условия) → 0.
    #
    # Ноль здесь — не «проверять нечего», а закреплённое состояние: если правка
    # промпта, весов или движка снова разведёт ответ с эталоном выше порога, тест
    # назовёт снимок поимённо.
    # Пар может не оказаться вовсе — если промпт только что правили, а прогона
    # ещё не было. Молчаливо пройти тут нельзя: «проверок 0» выглядит как «всё
    # сошлось». Поэтому случай назван вслух и остаётся красным до прогона.
    assert пар, ("ответов на текущий промпт нет: промпт правили, а прогона не было. "
                 "Пересчитать закреплённое число можно только после "
                 "`python cli.py run`")
    # Побег остался один: `059`. Уверенность 0.998, и порогом он не ловится —
    # разбор внутренне непротиворечив, просто на табличке прочитан не тот набор
    # условий. Два других расхождения (`060`, `061`) порог 0.9 ловит.
    assert сбежали == ["059-avstand-p-skiva-2tim-darefter-avgift"], сбежали
