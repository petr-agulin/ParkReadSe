"""Замер точности извлечения: ответ модели против эталона.

**Порядок панелей меряется отдельно от их содержания.** Это не педантизм: одни и те же
слова при другой группировке дают другое правило, поэтому знак, где всё прочитано,
но порядок перепутан, — не «почти верный», а неверный.

Считается только по фикстурам с `origin: model`. Затравка `hand_marked` — это тот же
эталон, и мерить по ней значило бы сравнивать эталон с самим собой.
"""
from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path


def _plates(doc: dict) -> list[dict]:
    return [p for p in doc.get("panels", []) if p.get("kind") == "sign_plate"]


def _text(panel: dict) -> str:
    """Весь текст таблички одной строкой, без регистра и лишних пробелов.

    **Перенос строк ВНУТРИ таблички последствия не имеет.** Правило композиции
    говорит, что совместно действуют строки одной таблички; как именно эти слова
    разбиты на печатные строки, правила не меняет. Модель возвращает напечатанные
    строки (`Endast` / `laddande` / `elbilar`), эталон писался смысловыми фразами
    (`Endast laddande elbilar`) — верно и то и другое, а разница между ними
    измеряет оформление, а не чтение.

    Границы МЕЖДУ табличками при этом остаются строгими: их меряют `panel_count`,
    `panels.content` и `panels.order`, и там расхождение — настоящая ошибка.
    """
    return " ".join(" ".join(x.split()) for x in panel.get("lines", []) if x.strip()).lower()


def _signature(panel: dict) -> str:
    """Чем панель отличается от соседей. Нужна, чтобы мерить ПОРЯДОК отдельно
    от содержания: если те же панели пришли в другой последовательности,
    содержание совпадёт, а порядок нет."""
    text = _text(panel)
    if text:
        return text
    # панель без текста опознаётся по пиктограмме или стрелке
    parsed = panel.get("parsed") or {}
    return str(parsed.get("arrow") or parsed.get("pictogram") or "?")


def _matched(expected: dict, actual: dict):
    """Пары «та же панель здесь и там», сопоставленные по тексту.

    Панели, которым пары не нашлось, здесь молчат намеренно: их расхождение уже
    посчитано в `panels.content` и `panels.order`, и считать его второй раз значит
    удваивать вес одной ошибки."""
    by_sig: dict[str, list[dict]] = {}
    for p in actual.get("panels", []):
        by_sig.setdefault(_signature(p), []).append(p)
    for e in expected.get("panels", []):
        same = by_sig.get(_signature(e))
        if same:
            yield e, same.pop(0)


_MONTH_LEN = {1: 31, 2: 29, 3: 31, 4: 30, 5: 31, 6: 30,
              7: 31, 8: 31, 9: 30, 10: 31, 11: 30, 12: 31}
_ALL_DAYS = frozenset((m, d) for m in range(1, 13)
                      for d in range(1, _MONTH_LEN[m] + 1))


def _covered_days(dates: dict) -> frozenset:
    """Множество дней, в которые окно действует.

    `Augusti-Juni` можно записать двумя способами — «только с 1 августа по 30 июня»
    и «кроме июля», — и это **одно и то же правило**. Сравнивать записи буквально
    значит мерить форму записи, а не прочитанное: ровно та же ошибка, что была
    с переносом строк внутри таблички.
    """
    hit = set()
    for rng in dates.get("ranges") or []:
        start = tuple(int(x) for x in rng["from"].split("-"))
        end = tuple(int(x) for x in rng["to"].split("-"))
        for day in _ALL_DAYS:
            inside = start <= day <= end if start <= end else (day >= start or day <= end)
            if inside:
                hit.add(day)
    return frozenset(hit) if dates.get("mode") == "only" else _ALL_DAYS - frozenset(hit)


def _normalise_windows(value):
    """Окна к сравнимому виду: даты — множеством дней, остальное как есть."""
    out = []
    for w in value or []:
        w = dict(w)
        if w.get("dates"):
            w["dates"] = sorted(_covered_days(w.pop("dates")))
        out.append(w)
    return out


@dataclass
class Field:
    name: str
    hits: int = 0
    total: int = 0

    def add(self, ok: bool) -> None:
        self.total += 1
        self.hits += 1 if ok else 0

    @property
    def share(self) -> float | None:
        return None if not self.total else self.hits / self.total


@dataclass
class Report:
    fields: dict[str, Field] = field(default_factory=dict)
    photos: int = 0
    mistakes: list[str] = field(default_factory=list)

    def add(self, name: str, ok: bool, note: str = "") -> None:
        self.fields.setdefault(name, Field(name)).add(ok)
        if not ok and note:
            self.mistakes.append(note)


def compare(expected: dict, actual: dict, label: str, rep: Report) -> None:
    rep.photos += 1

    m_exp, m_act = expected["main_sign"], actual["main_sign"]
    rep.add("main_sign.type", m_exp["type"] == m_act["type"],
            f"{label}: основной знак {m_act['type']} вместо {m_exp['type']}")
    rep.add("main_sign.background_color",
            m_exp["background_color"] == m_act["background_color"],
            f"{label}: цвет знака {m_act['background_color']} вместо {m_exp['background_color']}")
    rep.add("main_sign.form", m_exp["form"] == m_act["form"],
            f"{label}: вид знака {m_act['form']} вместо {m_exp['form']}")

    pe, pa = _plates(expected), _plates(actual)
    rep.add("panel_count", len(pe) == len(pa),
            f"{label}: табличек {len(pa)} вместо {len(pe)}")

    # содержание: те же панели, безотносительно последовательности
    sig_e, sig_a = [_signature(p) for p in pe], [_signature(p) for p in pa]
    rep.add("panels.content", sorted(sig_e) == sorted(sig_a),
            f"{label}: содержание табличек разошлось")
    # порядок: та же последовательность. Меряется ОТДЕЛЬНО — от порядка зависит правило
    rep.add("panels.order", sig_e == sig_a,
            f"{label}: порядок табличек {sig_a} вместо {sig_e}")

    # Несёт панель правило или нет — единственное, что здесь имеет последствие.
    # Панель сопоставляется с панелью по тексту, и сравнивается ровно один признак.
    #
    # Различать МЕЖДУ СОБОЙ табличку оператора и платёжное табло смысла нет: обе
    # исключены из движка, и путаница внутри этой пары ничего не меняет в ответе.
    # На снимках 009 и 019 шапка табло с кодом участка физически слита с рекламным
    # листом, и где именно провести границу — вопрос без последствия.
    # А вот принять табличку с правилом за нерулевую (или наоборот) — настоящая
    # ошибка: из разбора пропадает или в него добавляется указание.
    for e, a in _matched(expected, actual):
        e_rule, a_rule = e.get("kind") == "sign_plate", a.get("kind") == "sign_plate"
        rep.add("panel.rule_bearing", e_rule == a_rule,
                f"{label}: панель {a.get('index')} помечена {a.get('kind')} "
                f"вместо {e.get('kind')} — это меняет состав правил")

    # пофразовое сравнение только там, где длины совпали
    for e, a in zip(pe, pa):
        rep.add("panel.lines", _text(e) == _text(a),
                f"{label}: панель {a.get('index')} прочитана как {a['lines']} "
                f"вместо {e['lines']}")
        rep.add("panel.background_color",
                e["background_color"] == a["background_color"])
        ep, ap = e.get("parsed") or {}, a.get("parsed") or {}
        for key in ("duration_limit", "time_windows", "fee", "permit_required",
                    "scope_shift", "eligibility", "vehicle_class", "arrow",
                    "place_count", "stretch_metres", "placement", "prohibition",
                    "payment_method", "permits_parking"):
            if key in ep or key in ap:
                want, got = ep.get(key), ap.get(key)
                if key == "time_windows":
                    want, got = _normalise_windows(want), _normalise_windows(got)
                rep.add(f"parsed.{key}", want == got,
                        f"{label}: панель {a.get('index')} поле {key} = "
                        f"{ap.get(key)!r} вместо {ep.get(key)!r}")


def load_triage_expectations(path: Path) -> dict[str, str]:
    """Снимки, которые парковочными знаками НЕ являются, и чем именно они должны
    оказаться на стадии отсева.

    Держится отдельным файлом, а не выводится из отсутствия эталона: «эталон ещё
    не написан» и «эталона не будет» — разные вещи, и путать их значит считать
    неразмеченный парковочный знак мусором.
    """
    if not path.exists():
        return {}
    return json.loads(path.read_text(encoding="utf-8")).get("photos", {})


def triage_report(expected_is_parking: dict[str, bool],
                  triage: dict[str, str]) -> dict[str, float | int]:
    """Доля ложных отсевов — самая дорогая ошибка стадии 0: пользователь стоит перед
    знаком и не получает ничего."""
    real = [k for k, v in expected_is_parking.items() if v and k in triage]
    junk = [k for k, v in expected_is_parking.items() if not v and k in triage]
    false_reject = [k for k in real if triage[k] != "parking_sign"]
    let_through = [k for k in junk if triage[k] == "parking_sign"]
    return {
        "real_signs": len(real),
        "false_rejects": len(false_reject),
        "false_reject_share": (len(false_reject) / len(real)) if real else 0.0,
        "junk_frames": len(junk),
        "junk_let_through": len(let_through),
        "junk_let_through_share": (len(let_through) / len(junk)) if junk else 0.0,
    }


def load_pairs(expected_dir: Path, fixtures_dir: Path,
               only_model: bool = True,
               prompt_fingerprint: str | None = None) -> list[tuple[str, dict, dict]]:
    """Пары «эталон — ответ модели». `only_model` отсекает затравку `hand_marked`:
    мерить модель по эталону, написанному не моделью, значит мерить не то.

    `prompt_fingerprint` отсекает ответы, полученные ДРУГИМ промптом. Прогон это
    и так проверяет, а замер — нет, и разница вылезла на снимке `038`: его новый
    ответ не прошёл схему, сохранён не был, и на диске остался ответ от прежнего
    промпта. Посчитать его вместе с остальными значило бы смешать две версии
    промпта в одном числе — ровно то, от чего отпечаток и заводился.
    """
    out = []
    for exp_file in sorted(expected_dir.glob("*.json")):
        fx = fixtures_dir / f"{exp_file.stem}.extract.json"
        if not fx.exists():
            continue
        fixture = json.loads(fx.read_text(encoding="utf-8"))
        if only_model and fixture.get("origin", "model") != "model":
            continue
        if (prompt_fingerprint is not None
                and fixture.get("prompt_fingerprint") != prompt_fingerprint):
            continue
        out.append((exp_file.stem,
                    json.loads(exp_file.read_text(encoding="utf-8")),
                    fixture["response"]))
    return out


def answers_from_another_prompt(expected_dir: Path, fixtures_dir: Path,
                                prompt_fingerprint: str) -> list[str]:
    """Снимки, чей сохранённый ответ получен другим промптом.

    Их нельзя ни считать, ни молча забыть: молчаливый пропуск выглядит как «такого
    снимка нет», а на деле снимок есть и ответ на него устарел. Замер обязан назвать
    их вслух, иначе покрытие будет казаться полным.
    """
    out = []
    for exp_file in sorted(expected_dir.glob("*.json")):
        fx = fixtures_dir / f"{exp_file.stem}.extract.json"
        if not fx.exists():
            continue
        fixture = json.loads(fx.read_text(encoding="utf-8"))
        if fixture.get("origin", "model") != "model":
            continue
        if fixture.get("prompt_fingerprint") != prompt_fingerprint:
            out.append(exp_file.stem)
    return out


def table(rep: Report) -> str:
    rows = ["| Поле | Совпало | Всего | Точность |", "|---|---|---|---|"]
    for name in sorted(rep.fields):
        f = rep.fields[name]
        rows.append(f"| `{name}` | {f.hits} | {f.total} | {f.share:.0%} |")
    return f"Снимков в замере: {rep.photos}\n\n" + "\n".join(rows)


# --- калибровка порога -----------------------------------------------------
#
# Точность по полям и верность ОТВЕТА — разные вещи, и мерить порог надо по второй.
# Замер на 47 снимках: расхождение хотя бы в одном поле нашлось у 19 из них, а ответ
# при этом разошёлся всего у 6. Цвет таблички, лишний перенос строки и порядок панелей
# в разборе видны, а до человека не доходят — калибровать порог по ним значило бы
# настраивать оговорку на то, чего пользователь не увидит.
#
# Поэтому движок пускается ДВАЖДЫ: по эталону и по ответу модели, — и сравнивается
# то, что человек прочтёт на экране.

HORIZON_HOURS = 24 * 7


def _state_at(evaluation, moment) -> tuple[str, tuple[str, ...]]:
    """Состояние И условия в этот час.

    Условия считаются наравне с состоянием, потому что для человека это одно
    и то же сообщение. Знак `030` объявляет плату по субботам, разбор сказал
    «по воскресеньям и праздникам» — час за часом оба ответа говорят `allowed`,
    и расхождения по состоянию нет вовсе. А пользователю названы не те дни.
    """
    for regime in evaluation.regimes:
        for period in regime.periods:
            if period.start <= moment < period.end:
                return period.state, tuple(period.conditions)
    return "unknown", ()


def verdict_slice(doc: dict, moment, cal, evaluate) -> dict:
    """Ответ по знаку в сравнимом виде: можно ли тут стоять вообще, кому отведены
    места и что происходит в каждый час недели вперёд."""
    from datetime import timedelta

    ev = evaluate(doc, moment, cal)
    hours = [moment + timedelta(hours=h) for h in range(HORIZON_HOURS)]
    return {
        "permits_parking": ev.permits_parking,
        "eligibility": tuple(sorted(k for r in ev.regimes for k in r.eligibility)),
        "states": tuple(_state_at(ev, t) for t in hours),
    }


def verdict_differences(expected: dict, actual: dict) -> list[str]:
    """Чем ответ по разбору отличается от ответа по эталону.

    Отдельно считаются часы, в которые разбор **шире** эталона: это те часы, когда
    продукт говорит «стоянка разрешена» там, где знак её не разрешает. Ошибка
    в эту сторону стоит пользователю эвакуации, в обратную — лишней осторожности.
    """
    out = []
    if expected["permits_parking"] != actual["permits_parking"]:
        out.append("стоянка здесь: {} вместо {}".format(
            actual["permits_parking"], expected["permits_parking"]))
    if expected["eligibility"] != actual["eligibility"]:
        out.append("круг стоящих: {} вместо {}".format(
            list(actual["eligibility"]) or "—", list(expected["eligibility"]) or "—"))
    pairs = list(zip(expected["states"], actual["states"]))
    # Состояние и условия разводятся намеренно: «стоять нельзя вместо можно» и
    # «плата не в те дни» — ошибки разной цены, и одним числом их не описать.
    by_state = [(e, a) for e, a in pairs if e[0] != a[0]]
    if by_state:
        wider = sum(1 for _, a in by_state if a[0] == "allowed")
        out.append("часов расходится по состоянию {}/{}, из них шире {}".format(
            len(by_state), len(pairs), wider))
    by_cond = [(e, a) for e, a in pairs if e[0] == a[0] and e[1] != a[1]]
    if by_cond:
        примеры = sorted({(", ".join(a[1]) or "—") + " вместо " + (", ".join(e[1]) or "—")
                          for e, a in by_cond})
        out.append("часов расходится по условиям {}/{}: {}".format(
            len(by_cond), len(pairs), "; ".join(примеры[:2])))
    return out


def threshold_table(rows: list[tuple[float, str, bool, str]],
                    thresholds=(0.85, 0.875, 0.9, 0.92, 0.95)) -> str:
    """Сколько разошедшихся ответов ловит каждый порог и какой ценой.

    Цена — верные разборы, которым порог навесил оговорку. Она не равна нулю
    и не должна: оговорка стоит дёшево, молчание дорого.
    """
    lines = ["| Порог | Помечено | Из них разошлись | Пропущено как «полный» | Из них разошлись |",
             "|---|---|---|---|---|"]
    for t in thresholds:
        flagged = [r for r in rows if r[0] < t or r[1] != "full"]
        passed = [r for r in rows if r[0] >= t and r[1] == "full"]
        lines.append("| {:.3f} | {} | {} | {} | {} |".format(
            t, len(flagged), sum(1 for r in flagged if r[2]),
            len(passed), sum(1 for r in passed if r[2])))
    return "\n".join(lines)


def dead_signals(seen: dict[str, set]) -> list[str]:
    """Сигналы, ни разу не менявшиеся на наборе.

    Их вес в формуле ничего не различает. Но вывод отсюда — НЕ «убрать вес»:
    сигнал может быть постоянным потому, что в наборе нет снимков, которые его
    сдвинули бы. Переложить его вес на сигналы, которые шевелятся, значит сделать
    продукт увереннее ровно на тех кадрах, которых в наборе не хватает.
    """
    return sorted(k for k, v in seen.items() if len(v) <= 1)
