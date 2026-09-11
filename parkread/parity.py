"""Двойной прогон: одна и та же задача — двум реализациям, ответ сравнивается.

Порт на TypeScript идёт слоями, и главная его опасность — **молчаливое расхождение**:
правило поправили в питоне, забыли в браузере, и обе реализации живут дальше, каждая
по-своему. Поэтому сверка строится ПЕРВОЙ, до самого порта (решение 123).

**Как устроено.** Питон считает ответы и кладёт их файлами в `parity/`; TypeScript
считает свои и сравнивает с файлами. Ни одна сторона не вызывает другую: обе бегут
в своём привычном прогоне.

    .venv/Scripts/python.exe cli.py parity --write   # переписать эталоны
    .venv/Scripts/python.exe tests/run.py            # эталоны не устарели
    npm test --prefix web                            # TypeScript с ними сходится

Переписывание — **отдельная команда**, а не побочный эффект прогона: изменился ответ
продукта — это видно строкой в `git diff`, а не угадывается. Иначе эталоны однажды
перезапишут, чтобы «стало зелено», и вместе с красным исчезнет расхождение.

**Снимков здесь нет и быть не должно** — только разборы (JSON). Фотографии с номерами
машин в репозиторий не попадают (`AGENTS.md`, §14).
"""
from __future__ import annotations

import json
from dataclasses import replace
from datetime import date, datetime, timedelta
from pathlib import Path

from . import completeness, engine, present
from .calendar_se import SELECTABLE_FROM, SELECTABLE_TO, Calendar, holidays
from . import clock_se as clock
from .pipeline import Analysis, Outcome
from .reference import Reference, recognise
from .validation import Result, Validator
from .vision import ExtractOutcome

ROOT = Path(__file__).resolve().parent.parent
DIR = ROOT / "parity"
CASES = DIR / "cases.json"
PORTED = DIR / "PORTED.json"

# Слои порта, снизу вверх. Порядок здесь — тот же, в котором они переезжают.
LAYERS = ["calendar", "clock", "engine", "reference", "completeness", "present",
          "schema", "validation", "prompts", "measure"]

# Общий момент — тот же понедельник, на котором стоит замер: обычный будний день
# вне праздников, где ничто не наложилось на ничто.
BASE_MOMENT = datetime(2026, 3, 2, 0, 0)

# Особые моменты. Каждый выбран потому, что на нём уже ломалось что-нибудь живое,
# и каждый назван — иначе список превращается в набор чисел без причины.
SPECIAL = [
    {"label": "eve", "moment": "2026-10-30T14:00",
     "why": "канун Alla helgons dag: действуют часы в скобках"},
    {"label": "red", "moment": "2026-12-25T10:00",
     "why": "Juldagen: красный день, и следующий тоже красный"},
    {"label": "dst-back", "moment": "2026-10-24T20:00",
     "why": "ночь перевода назад: сутки длятся 25 часов"},
    {"label": "dst-forward", "moment": "2027-03-27T20:00",
     "why": "ночь перевода вперёд: сутки длятся 23 часа"},
    {"label": "season-edge", "moment": "2026-09-30T23:30",
     "why": "последние полчаса сезона 1/4-30/9"},
    {"label": "midnight", "moment": "2026-06-10T00:00",
     "why": "полночь: край суток, на котором резались отрезки"},
]

# Снимки, на которых особые моменты что-то меняют. Весь набор на каждый момент
# гонять незачем: эталон разбухнет, а нового не скажет.
SPECIAL_DOCS = [
    "005-2tim-8-18-parentes-8-15-dubbelpil",      # окна будней и канунов
    "019-forbud-7-18-avgift-ovrig-tid",           # запрет с окном и «övrig tid»
    "026-zon-e-boende",                           # зональный знак
    "038-scandic-buss-besokande-pil",             # пиктограмма отдельной табличкой
    "049-moped-sasong-avgift-tva-taxor",          # адресат, сезон, «övrig tid»
    "064-motorcykel-tisd-9-17-beskuren",          # адресат и день недели
]


# --- разборы, на которых идёт сверка ---------------------------------------

def documents() -> dict[str, dict]:
    """Все разборы набора: ответы модели из `demo/` и эталоны разработчика.

    Двух родов намеренно: у модели встречаются склейки панелей и странные поля,
    каких в аккуратном эталоне не бывает, и порт обязан вести себя одинаково
    и на тех, и на других.
    """
    out: dict[str, dict] = {}
    for path in sorted((ROOT / "demo").glob("*.extract.json")):
        doc = json.loads(path.read_text(encoding="utf-8")).get("response")
        if isinstance(doc, dict) and doc.get("main_sign"):
            out[f"demo/{path.stem.removesuffix('.extract')}"] = doc
    for path in sorted((ROOT / "testset/expected").glob("*.json")):
        doc = json.loads(path.read_text(encoding="utf-8"))
        if isinstance(doc, dict) and doc.get("main_sign"):
            out[f"expected/{path.stem}"] = doc
    return out


def build_cases() -> list[dict]:
    """Список случаев: каждый разбор на общий момент плюс особые моменты
    на тех снимках, где они что-то меняют."""
    docs = documents()
    cases = [{"id": f"{name}@base", "doc": name,
              "moment": BASE_MOMENT.isoformat(timespec="minutes")}
             for name in docs]
    for special in SPECIAL:
        for stem in SPECIAL_DOCS:
            for name in (f"demo/{stem}", f"expected/{stem}"):
                if name in docs:
                    cases.append({"id": f"{name}@{special['label']}", "doc": name,
                                  "moment": special["moment"]})
    return sorted(cases, key=lambda c: c["id"])


# --- пробы по слоям --------------------------------------------------------

def probe_calendar(cal: Calendar) -> dict:
    """Класс дня на каждый день окна и имена праздников.

    Классы пишутся строкой из букв, по дню на букву: полторы тысячи отдельных
    записей читать невозможно, а строку — видно целиком, и любой сдвиг в ней
    бросается в глаза.
    """
    out: dict[str, dict] = {}
    for year in range(SELECTABLE_FROM.year, SELECTABLE_TO.year + 1):
        d, letters = date(year, 1, 1), []
        while d.year == year:
            letters.append(cal.day_class(d)[0])       # w | e | r
            d += timedelta(days=1)
        out[str(year)] = {
            "classes": "".join(letters),
            "holidays": {k.isoformat(): v for k, v in sorted(holidays(year).items())},
        }
    return out


def probe_clock() -> dict:
    """Смещение, сложение настоящего времени и длина суток вокруг переводов."""
    out = {"switches": {}, "moments": []}
    for year in range(SELECTABLE_FROM.year, SELECTABLE_TO.year + 1):
        out["switches"][str(year)] = {
            "forward": clock.spring_forward(year).isoformat(timespec="minutes"),
            "back": clock.autumn_back(year).isoformat(timespec="minutes"),
        }
    moments = [datetime(2026, 1, 15, 12), datetime(2026, 7, 15, 12),
               datetime(2026, 3, 29, 1, 30), datetime(2026, 3, 29, 2, 30),
               datetime(2026, 3, 29, 3, 30), datetime(2026, 10, 25, 2, 30),
               datetime(2026, 10, 25, 3, 30), datetime(2026, 10, 24, 20, 0),
               datetime(2027, 3, 27, 20, 0)]
    for m in moments:
        out["moments"].append({
            "moment": m.isoformat(timespec="minutes"),
            "offset": clock.offset(m),
            "plus_2h": clock.add(m, timedelta(hours=2)).isoformat(timespec="minutes"),
            "plus_24h": clock.add(m, timedelta(days=1)).isoformat(timespec="minutes"),
            "minutes_to_next_day": clock.real_minutes(m, m + timedelta(days=1)),
            "switch_within_8_days": clock.switch_between(m, m + timedelta(days=8)),
        })
    return out


def _period(p: engine.Period) -> dict:
    return {
        "start": p.start.isoformat(timespec="minutes"),
        "end": p.end.isoformat(timespec="minutes"),
        "state": p.state,
        "conditions": list(p.conditions),
        "max_duration_minutes": p.max_duration_minutes,
        "note": p.note,
    }


def probe_engine(cases: list[dict], docs: dict[str, dict], cal: Calendar) -> dict:
    """Что насчитал движок: режимы и отрезки.

    Сравниваются отрезки, а не состояние на каждый час: отрезок и есть то,
    что движок выдаёт, — так и строже, и файл меньше в разы.
    """
    out = {}
    for case in cases:
        ev = engine.evaluate_parking_rules(
            docs[case["doc"]], datetime.fromisoformat(case["moment"]), cal)
        out[case["id"]] = {
            "permits_parking": ev.permits_parking,
            "uncertainties": list(ev.uncertainties),
            "note": ev.note,
            "regimes": [{
                "extent": r.extent,
                "audience": r.audience,
                "audience_excluded": list(r.audience_excluded),
                "eligibility": list(r.eligibility),
                "place_notes": list(r.place_notes),
                "duration_expires_at": (r.duration_expires_at.isoformat(timespec="minutes")
                                        if r.duration_expires_at else None),
                "duration_source": r.duration_source,
                "periods": [_period(p) for p in r.periods],
            } for r in ev.regimes],
        }
    return out


# Поломки для мутационной проверки схемы. Каждая бьёт по своему ключевому слову,
# и каждая записана РЕЦЕПТОМ, а не готовым документом: обе стороны применяют один
# и тот же рецепт к одному и тому же разбору, поэтому сравнивают именно проверку,
# а не своё умение ломать (решение 124).
MUTATIONS = [
    {"label": "как есть", "op": "keep", "path": []},
    {"label": "нет main_sign", "op": "delete", "path": ["main_sign"]},
    {"label": "тип знака вне перечисления", "op": "set",
     "path": ["main_sign", "type"], "value": "не-такого-знака"},
    {"label": "panel_count строкой", "op": "set", "path": ["panel_count"], "value": "три"},
    {"label": "лишнее поле в корне", "op": "set", "path": ["новое_поле"], "value": 1},
    {"label": "отрицательный panel_count", "op": "set", "path": ["panel_count"], "value": -1},
    {"label": "другая версия схемы", "op": "set", "path": ["schema_version"], "value": 2},
    {"label": "у панели нет kind", "op": "delete", "path": ["panels", "0", "kind"]},
    {"label": "время не по образцу", "op": "set",
     "path": ["panels", "0", "parsed", "time_windows"],
     "value": [{"from": "восемь", "to": "18:00"}]},
    {"label": "лишнее поле в панели", "op": "set",
     "path": ["panels", "0", "странное"], "value": True},
]


def apply_mutation(doc: dict, mutation: dict) -> dict:
    """Рецепт поломки — к копии разбора. Путь по ключам; число в пути — индекс.

    Та же функция написана на другой стороне: она в четыре строки, и сравнивать
    надо ПРОВЕРКУ, а не умение ломать.
    """
    out = json.loads(json.dumps(doc))
    if mutation["op"] == "keep":
        return out
    node = out
    path = mutation["path"]
    for part in path[:-1]:
        node = node[int(part)] if isinstance(node, list) else node[part]
        if node is None:
            return out
    last = path[-1]
    key = int(last) if isinstance(node, list) else last
    if mutation["op"] == "delete":
        if isinstance(node, list):
            del node[key]
        else:
            node.pop(key, None)
    elif mutation["op"] == "append":
        node[key].append(mutation["value"])
    else:
        node[key] = mutation["value"]
    return out


# Порча, будящая починку. Фикстуры лежат УЖЕ починенными — их сохранил конвейер,
# — поэтому на чистом наборе починка не срабатывает ни разу и сверять было бы
# нечего. Каждый рецепт ниже соответствует одной правке из `validation.py`.
DAMAGE = [
    {"label": "как есть", "op": "keep", "path": []},
    {"label": "дубль основного знака", "op": "append", "path": ["panels"],
     "value": {"index": 99, "kind": "sign_plate", "lines": [],
               "background_color": "blue", "legibility": {"readable": True},
               "parsed": {"pictogram": "parking"}}},
    {"label": "пустая строка в панели", "op": "append",
     "path": ["panels", "0", "lines"], "value": "  "},
    {"label": "сбитый индекс панели", "op": "set",
     "path": ["panels", "0", "index"], "value": 7},
    {"label": "panel_count не сходится", "op": "set", "path": ["panel_count"], "value": 99},
    {"label": "значение вне перечисления", "op": "set",
     "path": ["panels", "0", "parsed", "payment_method"], "value": "mobile"},
]


def probe_measure(cal: Calendar) -> dict:
    """Числа замера: точность извлечения, расхождения ответов, таблица порогов.

    Замер — единственное место, где числа важнее кода: переедет «почти так же» —
    и сравнивать станет не с чем. Поэтому сверяются сами ЧИСЛА, пока питон жив.

    Отпечаток промпта здесь не применяется намеренно: он зависит от того, каким
    промптом получены фикстуры на диске, и на другой машине список исключённых
    был бы другим. Проверку отпечатка держит отдельный тест.
    """
    from . import accuracy
    from .engine import evaluate_parking_rules

    # Отбор пар — тот же, что у `cli.py calibrate`: ответы, полученные ДРУГИМ
    # промптом, в замер не входят, иначе в одном числе смешаются две версии
    # вопроса. Отпечаток — sha256 текста промпта, а промпты сверены посимвольно.
    from . import fixtures, prompts
    sign_schema = json.loads(
        (ROOT / "schema/sign.schema.json").read_text(encoding="utf-8"))
    mark = fixtures.fingerprint(prompts.extract(sign_schema))

    pairs = accuracy.load_pairs(ROOT / "testset/expected", ROOT / "demo",
                                prompt_fingerprint=mark)
    moment = BASE_MOMENT

    rep = accuracy.Report()
    diverged = {}
    for label, expected, actual in pairs:
        accuracy.compare(expected, actual, label, rep)
        a = accuracy.verdict_slice(expected, moment, cal, evaluate_parking_rules)
        b = accuracy.verdict_slice(actual, moment, cal, evaluate_parking_rules)
        diff = accuracy.verdict_differences(a, b)
        if diff:
            diverged[label] = diff

    # Площадь кадра входит в уверенность, а значит и в таблицу порогов: снимки
    # читаются с диска обеими сторонами, и заголовок разбирается одинаково.
    from .photo import Photo

    # Уверенность считается ТАК ЖЕ, как её считает `cli.py calibrate`: с флагами
    # извлечения и починкой от валидатора и с пробелами справочника от `recognise`.
    # Без них число выходит выше, и таблица порогов описывала бы не тот продукт.
    validator = Validator(ROOT / "schema")
    ref_obj = Reference(ROOT / "reference/signs")

    rows = []
    for label, expected, actual in pairs:
        photo = next((p for p in (ROOT / "testset/photos").glob(f"{label}.*")
                      if p.suffix.lower() in (".jpg", ".png")), None)
        # Число панелей приходит со стадии отсева: независимый взгляд на ту же
        # фотографию, и расхождение роняет уверенность. Без него таблица порогов
        # описывала бы продукт, у которого этой проверки нет.
        triage_file = ROOT / "demo" / f"{label}.triage.json"
        panels_seen = None
        if triage_file.exists():
            answer = json.loads(triage_file.read_text(encoding="utf-8")).get("response") or {}
            seen = answer.get("panels_below_main_sign")
            panels_seen = seen if isinstance(seen, int) else None

        res = validator.sign(json.loads(json.dumps(actual)), panels_seen=panels_seen)
        doc = res.data if res.ok else actual
        rec = recognise(doc, ref_obj)
        flags = list(res.flags)
        if rec.missing_keys:
            flags.append("reference_gap:" + ",".join(rec.missing_keys))
        if rec.uninterpreted:
            flags.append("uninterpreted_panels:"
                         + ",".join(str(i) for i in sorted(rec.uninterpreted)))
        ev = evaluate_parking_rules(doc, moment, cal)
        a = completeness.grade(
            doc, flags=flags, repairs=res.repairs, evaluation=ev,
            image_pixels=Photo.from_path(photo).pixels if photo else None)
        rows.append([round(a.confidence, 6), a.category, label in diverged, label])

    return {
        "photos": rep.photos,
        "fields": {name: [f.hits, f.total]
                   for name, f in sorted(rep.fields.items())},
        "mistakes": sorted(rep.mistakes),
        "diverged": diverged,
        "pixels": {label: (Photo.from_path(photo).pixels if photo else None)
                   for label, photo in (
                       (l, next((p for p in (ROOT / "testset/photos").glob(f"{l}.*")
                                 if p.suffix.lower() in (".jpg", ".png")), None))
                       for l, _, _ in pairs)},
        "fingerprint": mark,
        "excluded": accuracy.answers_from_another_prompt(
            ROOT / "testset/expected", ROOT / "demo", mark),
        "rows": sorted(rows, key=lambda r: (r[0], r[3])),
        "threshold_table": accuracy.threshold_table(
            [tuple(r) for r in sorted(rows, key=lambda r: (r[0], r[3]))]),
    }


def probe_prompts() -> dict:
    """Промпты целиком, оба. Сверяется СТРОКА, а не её куски: отпечаток промпта
    держит все сохранённые ответы, и расхождение в одном пробеле означало бы,
    что браузер задаёт модели другой вопрос."""
    from . import prompts
    from json import loads

    sign = loads((ROOT / "schema/sign.schema.json").read_text(encoding="utf-8"))
    triage = loads((ROOT / "schema/triage.schema.json").read_text(encoding="utf-8"))
    return {"triage": prompts.triage(triage), "extract": prompts.extract(sign)}


def probe_validation(docs: dict[str, dict], validator) -> dict:
    """Починка ответа модели: что поправлено, что замечено, прошёл ли схему.

    Сверяются РЕЗУЛЬТАТЫ починки, включая сами записи о ней: правка, о которой
    не сказано, — второй источник ошибок, и списки этих записей обязаны совпасть
    слово в слово. Число панелей от отсева здесь не передаётся: оно приходит
    от модели, а сверка должна быть воспроизводимой.
    """
    out = {}
    for name in sorted(docs)[:20]:
        for damage in DAMAGE:
            res = validator.sign(apply_mutation(docs[name], damage))
            out[f"{name}::{damage['label']}"] = {
                # Тексты ошибок схемы не сравниваются: на экран они не выходят,
                # а формулировки у `jsonschema` и у своей проверки разные. Сравнивается
                # ПОСЛЕДСТВИЕ: годен документ или нет, и что с ним сделали.
                "ok": res.ok,
                "repairs": res.repairs,
                "flags": res.flags,
                "data": res.data,
            }
    return out


def probe_schema(docs: dict[str, dict], validator) -> dict:
    """Годен ли разбор по мнению `jsonschema` — на каждом рецепте поломки.

    Это и есть условие, на котором стоит решение 124: пока питон жив, своей
    проверке в браузере есть с чем сверяться. Тексты ошибок не сравниваются —
    на экран они не выходят, а решение принимается одно: годен или нет.
    """
    out = {}
    for name in sorted(docs)[:20]:
        for mutation in MUTATIONS:
            broken = apply_mutation(docs[name], mutation)
            out[f"{name}::{mutation['label']}"] = validator.is_valid(broken)
    return out


def probe_reference(cases: list[dict], docs: dict[str, dict], ref: Reference) -> dict:
    """Сопоставление разбора со справочником: какие ключи вышли у каждой панели.

    Момент здесь ни при чём — справочник времени не знает, — поэтому случаи
    сводятся к разборам: по одному на документ.
    """
    out = {}
    for name in sorted({c["doc"] for c in cases}):
        rec = recognise(docs[name], ref)
        out[name] = {
            "main_sign_key": rec.main_sign_key,
            "panel_keys": {str(k): v for k, v in sorted(rec.panel_keys.items())},
            "uninterpreted": {str(k): v for k, v in sorted(rec.uninterpreted.items())},
            "missing_keys": rec.missing_keys,
        }
    return out


def _assess(doc: dict, moment: datetime, cal: Calendar):
    ev = engine.evaluate_parking_rules(doc, moment, cal)
    assessment = completeness.grade(doc, evaluation=ev)
    return ev, assessment


def probe_completeness(cases: list[dict], docs: dict[str, dict], cal: Calendar) -> dict:
    """Оценка полноты: категория, уверенность и сигналы, из которых она сложена."""
    out = {}
    for case in cases:
        _, a = _assess(docs[case["doc"]], datetime.fromisoformat(case["moment"]), cal)
        out[case["id"]] = {
            "category": a.category,
            "confidence": round(a.confidence, 6),
            "signals": {k: round(v, 6) for k, v in sorted(a.signals.items())},
            "reasons": list(a.reasons),
            "unread_panels": list(a.unread_panels),
            "may_hide_prohibition": a.may_hide_prohibition,
            "uninterpreted_plates": list(a.uninterpreted_plates),
        }
    return out


def _analysis(doc: dict, moment: datetime, cal: Calendar, ref: Reference) -> Analysis:
    """Разбор, собранный из документа: стадии модели здесь не нужны — сверяется
    то, что считает КОД, а снимок и вызовы модели к делу не относятся."""
    ev, assessment = _assess(doc, moment, cal)
    outcome = Outcome(
        image="parity", stopped_at=None, reason=None,
        extraction=ExtractOutcome(data=doc, validation=Result(data=doc), from_demo=True),
        recognised=recognise(doc, ref), flags=[])
    return Analysis(outcome, assessment, completeness.apply_asymmetry(ev, assessment))


def probe_present(cases: list[dict], docs: dict[str, dict], cal: Calendar,
                  ref: Reference) -> dict:
    """Готовый ответ целиком — то, что человек прочтёт на экране."""
    out = {}
    for case in cases:
        moment = datetime.fromisoformat(case["moment"])
        out[case["id"]] = present.to_json(
            _analysis(docs[case["doc"]], moment, cal, ref), ref, moment, cal)
    return out


# --- запись и сверка -------------------------------------------------------

def _schema_validator():
    """Тот же `jsonschema`, которым проверяет продукт: сверять надо с ним,
    а не с отдельной трактовкой схемы."""
    from jsonschema import Draft202012Validator
    return Draft202012Validator(
        json.loads((ROOT / "schema/sign.schema.json").read_text(encoding="utf-8")))


def golden() -> dict[str, object]:
    """Все эталоны разом. Считается из репозитория и ничего никуда не пишет."""
    cal, ref = Calendar(), Reference(ROOT / "reference/signs")
    docs = documents()
    cases = build_cases()
    return {
        "cases": cases,
        "calendar": probe_calendar(cal),
        "clock": probe_clock(),
        "engine": probe_engine(cases, docs, cal),
        "reference": probe_reference(cases, docs, ref),
        "schema": probe_schema(docs, _schema_validator()),
        "validation": probe_validation(docs, Validator(ROOT / "schema")),
        "prompts": probe_prompts(),
        "measure": probe_measure(cal),
        "completeness": probe_completeness(cases, docs, cal),
        "present": probe_present(cases, docs, cal, ref),
    }


def _dump(value: object) -> str:
    return json.dumps(value, ensure_ascii=False, indent=1, sort_keys=False) + "\n"


def write() -> list[str]:
    """Переписать эталоны. Возвращает список изменившихся файлов."""
    DIR.mkdir(exist_ok=True)
    fresh = golden()
    changed = []
    for name in ["cases"] + LAYERS:
        path = DIR / f"{name}.json"
        text = _dump(fresh[name])
        if not path.exists() or path.read_text(encoding="utf-8") != text:
            path.write_text(text, encoding="utf-8", newline="")
            changed.append(path.name)
    if not PORTED.exists():
        PORTED.write_text(_dump({"layers": []}), encoding="utf-8", newline="")
        changed.append(PORTED.name)
    return changed


def stale() -> list[str]:
    """Какие эталоны разошлись с тем, что считает код сейчас. Пусто — всё свежее."""
    fresh = golden()
    out = []
    for name in ["cases"] + LAYERS:
        path = DIR / f"{name}.json"
        if not path.exists():
            out.append(f"{path.name}: файла нет")
        elif path.read_text(encoding="utf-8") != _dump(fresh[name]):
            out.append(f"{path.name}: ответ продукта изменился")
    return out


def ported() -> list[str]:
    """Слои, у которых есть половина на TypeScript. Пока список не пуст,
    сверять есть что; пока не полон — порт не закончен."""
    if not PORTED.exists():
        return []
    return list(json.loads(PORTED.read_text(encoding="utf-8")).get("layers", []))
