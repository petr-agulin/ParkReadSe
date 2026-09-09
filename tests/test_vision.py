# -*- coding: utf-8 -*-
"""Обращение к провайдеру: что считать отказом, а что — просьбой подождать.

Прогон стоит квоты и времени, и обрывается он не там, где ошибка в нашем коде,
а там, где чужая служба занята. Поэтому граница между «повторить» и «сдаться»
проверяется отдельно: ошибиться в любую сторону дорого. Повторить неповторимое —
вторая трата квоты на заведомо тот же отказ; не повторить повторимое — потерянный
снимок, как и вышло на прогоне 041-054.
"""
from pathlib import Path

from parkread import vision
from parkread.config import Config
from parkread.photo import Photo
from parkread.vision import VisionCallFailed


class _Ответ:
    def __init__(self, code, body=None):
        self.status_code = code
        self.text = "тело ошибки"
        self._body = body or {"choices": [{"message": {"content": "{}"}}]}

    def json(self):
        return self._body


def _конфиг():
    return Config(demo_mode=False, demo_fixtures_path=Path("demo"),
                  vision_model="м", triage_model="м", triage_enforce=True,
                  max_rpm=0, api_base_url="https://пример/v1",
                  schema_path=Path("schema"), reference_path=Path("reference"),
                  general_rules_path=Path("reference"),
                  db_path=Path("нет.db"), log_level="INFO", _api_key="ключ")


def _снимок():
    return Photo("тест.png", b"\x89PNG")


def _стенд(monkey_ответы):
    """Подменяет и запрос, и сон: ждать по-настоящему тест не должен."""
    сделано = []

    def post(*a, **kw):
        исход = monkey_ответы[len(сделано)]
        сделано.append(исход)
        if isinstance(исход, Exception):
            raise исход
        return исход

    vision.requests.post = post
    vision.time.sleep = lambda _: None
    return сделано


def test_a_busy_provider_is_retried_not_reported_as_failure():
    """`503` — не отказ, а «сейчас занято, попробуйте позже».

    Найдено прогоном: одиннадцать снимков из четырнадцати упали на `503 high demand`,
    и повтор их бы вытянул — но повторялся только `429`.
    """
    было_post, было_sleep = vision.requests.post, vision.time.sleep
    try:
        сделано = _стенд([_Ответ(503), _Ответ(503), _Ответ(200)])
        текст, _ = vision._call(_конфиг(), "м", "промпт", _снимок())
        assert текст == "{}"
        assert len(сделано) == 3, "повторов не хватило"
    finally:
        vision.requests.post, vision.time.sleep = было_post, было_sleep


def test_a_timeout_is_retried_too():
    """Таймаут не говорит вообще ничего: ответа нет. Это не «провайдер отказал»."""
    было_post, было_sleep = vision.requests.post, vision.time.sleep
    try:
        сделано = _стенд([vision.requests.ReadTimeout("молчит"), _Ответ(200)])
        vision._call(_конфиг(), "м", "промпт", _снимок())
        assert len(сделано) == 2
    finally:
        vision.requests.post, vision.time.sleep = было_post, было_sleep


def test_a_rejected_request_is_not_retried():
    """Обратная сторона: `400` и `401` повторять нельзя. Перегрузки там нет — есть
    неверный запрос или ключ, и второй такой же запрос лишь потратит квоту второй раз.

    Этот тест держит послабление на месте: без него достаточно расширить список кодов
    до «любая ошибка» — и повтор начнёт молотить по заведомо безнадёжному запросу.
    """
    было_post, было_sleep = vision.requests.post, vision.time.sleep
    try:
        for код in (400, 401, 403, 404):
            сделано = _стенд([_Ответ(код), _Ответ(200)])
            try:
                vision._call(_конфиг(), "м", "промпт", _снимок())
            except VisionCallFailed as e:
                assert str(код) in str(e)
            else:
                raise AssertionError(f"{код} обязан был стать отказом")
            assert len(сделано) == 1, f"{код} повторять нельзя"
    finally:
        vision.requests.post, vision.time.sleep = было_post, было_sleep


def test_giving_up_says_why_and_how_many_tries():
    """Когда повторы кончились, ошибка обязана назвать причину и число попыток:
    иначе по журналу прогона не отличить «провайдер занят» от «мы сломали запрос»."""
    было_post, было_sleep = vision.requests.post, vision.time.sleep
    try:
        сделано = _стенд([_Ответ(503)] * 9)
        try:
            vision._call(_конфиг(), "м", "промпт", _снимок())
        except VisionCallFailed as e:
            assert "503" in str(e) and "попыток" in str(e), str(e)
        else:
            raise AssertionError("должен был сдаться")
        assert len(сделано) == len(vision.RETRY_PAUSE_S) + 1
    finally:
        vision.requests.post, vision.time.sleep = было_post, было_sleep
