"""Справочник — он же белый список.

Чего в `reference/signs/` нет, продукт не интерпретирует: показывает дословно
и помечает. Здесь только чтение справочника и разделение распознанного
и нераспознанного; арифметика правил — этап 3.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path

_HEAD = re.compile(r"^---\n(.*?)\n---\n(.*)$", re.S)


@dataclass(frozen=True)
class Entry:
    key: str
    tokens: str
    category: str      # main_sign | rule | info | not_interpreted
    schema: str        # какому полю схемы соответствует
    en: str            # готовая строка для интерфейса
    source: str
    body: str
    short: str = ""   # короткая подпись под текстом панели
    label: str = ""    # как называется этот вид знака или таблички
    code: str = ""     # официальный код: E19, C35, T1... Пусто там, где кода нет

    @property
    def counts_towards_rules(self) -> bool:
        return self.category in {"main_sign", "rule"}

    @property
    def lowers_confidence_when_absent(self) -> bool:
        """Информационные таблички и неинтерпретируемые коды уверенность не роняют."""
        return self.category in {"main_sign", "rule"}


class Reference:
    def __init__(self, signs_dir: Path):
        self._e: dict[str, Entry] = {}
        for p in sorted(signs_dir.glob("*.md")):
            m = _HEAD.match(p.read_text(encoding="utf-8"))
            if not m:
                raise ValueError(f"{p}: нет заголовка между --- ---")
            head = dict(
                line.split(": ", 1)
                for line in m.group(1).split("\n") if ": " in line
            )
            key = head.get("key", "")
            if key != p.stem:
                raise ValueError(f"{p}: key={key!r} не совпадает с именем файла")
            self._e[key] = Entry(
                key=key,
                tokens=head.get("tokens", ""),
                category=head.get("category", ""),
                schema=head.get("schema", ""),
                en=head.get("en", ""),
                source=head.get("source", ""),
                body=m.group(2).strip(),
                short=head.get("short", ""),
                label=head.get("label", ""),
                code=head.get("code", ""),
            )

    def __len__(self) -> int:
        return len(self._e)

    def __contains__(self, key: str) -> bool:
        return key in self._e

    def get(self, key: str) -> Entry | None:
        return self._e.get(key)

    def keys(self) -> list[str]:
        return sorted(self._e)

    def all(self) -> list[Entry]:
        """Все записи в порядке ключа. Нужно тем, кто показывает справочник целиком,
        а не ищет в нём по ключу, — например справку об общих правилах."""
        return [self._e[k] for k in sorted(self._e)]


# --- сопоставление извлечённой панели со справочником ----------------------
#
# Ключи берутся из полей схемы, а не из текста: текст муниципальный и разный,
# а поля закрыты списком. Поэтому сопоставление детерминированное.

_MAIN = {
    "parking": "main-parking",
    "prohibition_parking": "main-prohibition-parking",
    "prohibition_stopping": "main-prohibition-stopping",
    "wayfinding_parking_house": "main-wayfinding-parking-house",
    "wayfinding_park_and_ride": "main-wayfinding-park-and-ride",
}
_ZONE = {"parking": "main-zone-parking", "prohibition_parking": "main-zone-prohibition"}

_DAY = {"weekday": "window-weekday", "eve": "window-eve", "red": "window-red",
        "named_weekday": "named-weekday", "all_days": "alla-dagar"}

_SIMPLE = [
    ("duration_limit", "duration-limit"),
    ("place_count", "place-count"),
    ("stretch_metres", "stretch-metres"),
    ("permit_required", "sarskilt-p-tillstand"),
    ("operator", "operator-plate"),
    ("tariff_code", "taxa"),
    ("area_code", "omradeskod"),
]
# Единственные таблицы соответствия «значение схемы -> запись справочника».
#
# Раньше их было ДВЕ: такая же пара жила в движке, и значения приходилось добавлять
# в оба места. `vehicle_class: bus` и `truck` попали в схему, а сюда нет — модель
# читала автобус верно, а ключа под него не находилось, и указание молча исчезало
# из разбора (снимок `038`). Поэтому таблица теперь одна, а движок её импортирует.
ELIGIBILITY_KEYS = {"visitors": "besokande", "rented": "forhyrda-platser",
                    "permit_holders": "sarskilt-p-tillstand",
                    "disabled_permit": "pictogram-wheelchair",
                    "residents": "boende"}
VEHICLE_KEYS = {"motorcycle": "pictogram-motorcycle", "car_only": "bil-personbil",
                "electric": "pictogram-electric-car", "bus": "pictogram-bus",
                "truck": "pictogram-truck",
                # `T8-8`: велосипеды и мопеды класса II. Мопед класса I идёт
                # с мотоциклами — единственный вид транспорта, поделённый
                # между двумя пиктограммами.
                "bicycle": "pictogram-bicycle"}
_PAYMENT = {"ticket": "p-biljett", "parking_disc": "p-skiva"}
_PLACEMENT = {"marked_bay_only": "utanfor-markerad-plats", "as_shown": "placement-as-shown"}


@dataclass
class Recognised:
    """Результат сопоставления: что понято, что показано дословно."""
    main_sign_key: str | None
    panel_keys: dict[int, list[str]]        # индекс панели -> ключи справочника
    uninterpreted: dict[int, list[str]]     # индекс панели -> строки как есть
    missing_keys: list[str]                 # поля есть, а записи в справочнике нет

    @property
    def interpreted_panels(self) -> int:
        return sum(1 for v in self.panel_keys.values() if v)


PRIVATE_LAND_PHRASE = "privat parkering"


def recognise(doc: dict, ref: Reference) -> Recognised:
    main = doc["main_sign"]
    wayfinding = main["type"].startswith("wayfinding")
    zone = main.get("form") == "zone"
    mk = (_ZONE if zone else _MAIN).get(main["type"]) or _MAIN.get(main["type"])
    missing: list[str] = []
    if mk and mk not in ref:
        missing.append(mk)
        mk = None

    panel_keys: dict[int, list[str]] = {}
    uninterpreted: dict[int, list[str]] = {}

    for p in doc.get("panels", []):
        i = p["index"]
        keys: list[str] = []
        if p.get("kind") == "info_board":
            keys.append("info-board")
        if p.get("kind") == "operator_plate":
            keys.append("operator-plate")
        # `Privat parkering` — единственная запись, которую опознаём ПО ТЕКСТУ.
        #
        # Схема под неё поля не имеет и не должна: свободный текст на табличке
        # регламентом не предусмотрен, и заводить значение под каждый оборот
        # значило бы гнаться за бесконечным списком. Но следствие у этой надписи
        # есть, и важное: земля частная, стоянка — договор с владельцем, а условий
        # владельца на столбе нет. Модель кладёт такую табличку в `operator_plate`,
        # и без этой строки запись справочника не доходила до экрана ни разу.
        #
        # Сверяется тот самый оборот, который объявлен в `tokens` записи.
        if PRIVATE_LAND_PHRASE in " ".join(p.get("lines") or []).casefold():
            keys.append("privat-parkering")
        parsed = p.get("parsed") or {}

        for field_name, key in _SIMPLE:
            if parsed.get(field_name):
                keys.append(key)
        if parsed.get("fee"):
            keys.append("avgift")
        if parsed.get("prohibition"):
            keys.append("utanfor-markerad-plats" if parsed.get("placement") == "marked_bay_only"
                        else "main-prohibition-parking")
        if parsed.get("scope_shift") == "remaining_time":
            keys.append("ovrig-tid")
        for src, table in ((parsed.get("eligibility"), ELIGIBILITY_KEYS),
                           (parsed.get("vehicle_class"), VEHICLE_KEYS),
                           (parsed.get("payment_method"), _PAYMENT),
                           (parsed.get("placement"), _PLACEMENT)):
            if src and src in table:
                keys.append(table[src])
        if parsed.get("arrow"):
            # Стрелка под УКАЗАТЕЛЕМ значит «туда», а не «дотуда».
            #
            # Найдено на обкатке, снимок `037`: под знаком `F28` стоит стрелка
            # поворота, и продукт называл её протяжённостью участка (`T11`) —
            # «действует справа от знака». Но указатель стоянки не разрешает,
            # и протягивать разрешение вправо не по чему: стрелка показывает
            # дорогу. Разница не косметическая: `T11` описывает МЕСТО, где можно
            # стоять, а тут места нет вовсе.
            keys.append("wayfinding-direction" if wayfinding
                        else "arrow-" + parsed["arrow"].replace("_", "-"))
        for w in parsed.get("time_windows") or []:
            k = _DAY.get(w.get("day_class"))
            if k:
                keys.append(k)
            # Чётность недели и сезон сужают окно и обязаны быть НАЗВАНЫ:
            # правило, которое молча применяется, пользователь проверить не может.
            parity = w.get("week_parity")
            if parity:
                keys.append("jamna-veckor" if parity == "even" else "udda-veckor")
            if w.get("dates"):
                keys.append("datumintervall")

        seen, unique = set(), []
        for k in keys:
            if k in seen:
                continue
            seen.add(k)
            if k in ref:
                unique.append(k)
            else:
                missing.append(k)
        panel_keys[i] = unique

        # Нераспознанное. Табличка с правилом, из которой не вышло НИ ОДНОГО ключа,
        # не понята — есть на ней текст или нет.
        #
        # Найдено на обкатке, снимок `042` (велосипеды и мопеды): пиктограмма
        # неизвестного класса приезжала как `pictogram: other` без единой строки
        # текста. Непрочитанной такая панель не считалась — поле-то разобрано;
        # непонятой тоже — текста нет, а проверка смотрела на текст. Табличка
        # проваливалась между двумя сетями, и знак читался как «стоянка для всех
        # транспортных средств» там, где на нём нарисован велосипед.
        #
        # Это нарушение правила асимметрии в самом дорогом направлении: непонятое
        # ограничение обязано СУЖАТЬ ответ, а не расширять его.
        не_понята = not unique and p.get("kind") == "sign_plate"
        leftovers = list(parsed.get("uninterpreted") or [])
        if не_понята:
            leftovers.extend(p.get("lines") or [])
        if leftovers or не_понята:
            uninterpreted[i] = leftovers

    return Recognised(main_sign_key=mk, panel_keys=panel_keys,
                      uninterpreted=uninterpreted,
                      missing_keys=sorted(set(missing)))
