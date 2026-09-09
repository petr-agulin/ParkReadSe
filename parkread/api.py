"""HTTP-слой над готовым конвейером.

**Слой тонкий намеренно.** О правилах парковки он не знает ничего: принять снимок,
позвать `pipeline.analyze`, разложить ответ через `present.to_json`. Вся логика —
в движке и в оценке полноты, и другого пути к ней нет. Если однажды правило захочется
поправить «только для веба», это признак, что оно лежит не там.

**Фотография на диск не пишется.** Она приходит в теле запроса, живёт в памяти
как `Photo` и уходит только в vision-API. `remember=False` стоит умолчанием
у самого `Photo`, так что забыть про это нельзя.

Ключ наружу не отдаётся ни одной ручкой: `/api/health` сообщает лишь признак
«задан» и длину (`AGENTS.md`, §3).
"""
from __future__ import annotations

from datetime import datetime
from pathlib import Path

from flask import Flask, jsonify, request, send_from_directory

from . import pipeline, present
from .calendar_se import (SELECTABLE_FROM, SELECTABLE_TO, Calendar,
                          selectable)
from .config import Config
from .history import History
from .photo import Photo
from .reference import Reference
from .validation import Validator
from .vision import VisionCallFailed

MAX_UPLOAD_BYTES = 12 * 1024 * 1024

WEB_DIST = Path(__file__).resolve().parent.parent / "web" / "dist"

NOT_BUILT = """<!doctype html>
<meta charset="utf-8"><title>ParkRead — фронтенд не собран</title>
<body style="font:15px/1.6 system-ui;max-width:40rem;margin:3rem auto;padding:0 1rem">
<h1>Фронтенд не собран</h1>
<p>API уже работает — например, <code>GET /api/health</code>. Страницу нужно собрать:</p>
<pre style="background:#f4f4f5;padding:1rem;border-radius:.5rem">cd web
npm ci
npm run build</pre>
<p>После сборки обновите страницу.</p>
"""


def create_app(cfg: Config, *, history: History | None = None) -> Flask:
    app = Flask(__name__)
    app.config["MAX_CONTENT_LENGTH"] = MAX_UPLOAD_BYTES

    validator = Validator(cfg.schema_path)
    ref = Reference(cfg.reference_path)
    # Общие правила живут ОТДЕЛЬНОЙ ручкой, а не полем внутри разбора. Это не про
    # экономию байтов: их нет на знаке, и в вычисления они не входят никогда
    # (`PROJECT_BRIEF.md`). Не путешествуя вместе с ответом, они и не могут случайно
    # оказаться его частью — обещание держится устройством, а не дисциплиной.
    general = Reference(cfg.general_rules_path)
    cal = Calendar()
    hist = history if history is not None else History(cfg.db_path)

    @app.get("/api/health")
    def health():
        """Что настроено. Значения ключа здесь нет и быть не может."""
        return jsonify({
            "ok": True,
            "demo_mode": cfg.demo_mode,
            "vision_model": cfg.vision_model,
            "triage_model": cfg.triage_model,
            "triage_enforce": cfg.triage_enforce,
            "api_key": cfg.describe().get("api_key"),
            "reference_entries": len(ref),
        })

    @app.get("/api/general-rules")
    def general_rules():
        """Справка о том, чего на знаке нет. Показывается отдельно помеченным блоком
        и в расчёт не идёт: пометка `advisory` стоит в самом ответе, чтобы интерфейс
        не мог подать её как вывод по знаку."""
        return jsonify({"advisory": True, "rules": [
            {"key": e.key, "text": e.en, "source": e.source, "body": e.body}
            for e in general.all()
        ]})

    @app.get("/api/reference/<key>")
    def reference(key: str):
        entry = ref.get(key)
        if entry is None:
            return jsonify({"error": "not_found", "key": key}), 404
        return jsonify({
            "key": entry.key, "category": entry.category, "schema": entry.schema,
            "text": entry.en, "source": entry.source, "body": entry.body,
        })

    @app.post("/api/analyze")
    def analyze():
        file = request.files.get("photo")
        if file is None or not file.filename:
            return jsonify({"error": "no_photo",
                            "message": "приложите файл в поле photo"}), 400

        raw = file.read()
        if not raw:
            return jsonify({"error": "empty_photo",
                            "message": "файл пустой"}), 400

        try:
            moment = (datetime.fromisoformat(request.form["moment"])
                      if request.form.get("moment") else datetime.now())
        except ValueError:
            return jsonify({"error": "bad_moment",
                            "message": "момент указывается как 2026-03-07T12:00"}), 400

        # Окно продукта. Календарь считается кодом и умеет шире, но отвечать
        # за годы, которых никто не сверял, он не должен: набор праздников
        # со временем меняется. Поле на экране ограничено теми же краями —
        # эта проверка стоит на случай запроса мимо экрана.
        if not selectable(moment.date()):
            return jsonify({
                "error": "moment_out_of_range",
                "message": (f"The app reads signs for moments from "
                            f"{SELECTABLE_FROM.isoformat()} to "
                            f"{SELECTABLE_TO.isoformat()}"),
            }), 400

        # remember опущен намеренно: снимок пользователя в фикстуры не попадает.
        photo = Photo(name=file.filename, data=raw)

        try:
            result = pipeline.analyze(photo, cfg, validator, ref, cal, moment)
        except FileNotFoundError as e:
            # DEMO_MODE=true и фикстуры на этот снимок нет: штатный исход демо-режима,
            # а не поломка. Демо работает на авторском наборе.
            return jsonify({"error": "no_fixture", "message": str(e)}), 422
        except VisionCallFailed as e:
            return jsonify({"error": "vision_failed", "message": str(e)}), 502

        body = present.to_json(result, ref, moment, cal)
        body["id"] = hist.record(
            demo_mode=cfg.demo_mode,
            category=result.assessment.category,
            confidence=result.assessment.confidence,
            reasons=result.assessment.reasons,
            triage=result.outcome.triage.category if result.outcome.triage else None,
            panel_count=len(body["what_we_saw"]["panels"]) or None)
        return jsonify(body)

    # --- собранная страница -------------------------------------------------
    #
    # Тот же процесс отдаёт и API, и страницу (`AGENTS.md`, §8), поэтому у фронтенда
    # нет переменной с адресом бэкенда: `/api/...` всегда свой. Несобранный фронт —
    # не ошибка сервера, а состояние репозитория, и объясняется словами: ревьюер
    # ставит Node и собирает сам.

    @app.get("/")
    def index():
        if not (WEB_DIST / "index.html").exists():
            return NOT_BUILT, 200, {"Content-Type": "text/html; charset=utf-8"}
        return send_from_directory(WEB_DIST, "index.html")

    @app.get("/assets/<path:name>")
    def assets(name: str):
        return send_from_directory(WEB_DIST / "assets", name)

    @app.errorhandler(413)
    def too_large(_):
        return jsonify({"error": "photo_too_large",
                        "message": f"снимок больше {MAX_UPLOAD_BYTES // (1024 * 1024)} МБ"}), 413

    return app
