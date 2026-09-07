"""Запуск локального сервиса: один процесс отдаёт и API, и страницу.

    python server.py            — http://127.0.0.1:5000

Ключ не нужен при `DEMO_MODE=true`: ответы читаются из фикстур авторского набора.
"""
from __future__ import annotations

from parkread import config
from parkread.api import create_app

if __name__ == "__main__":
    cfg = config.load()
    print(f"DEMO_MODE={cfg.demo_mode}  модель={cfg.vision_model or '—'}")
    create_app(cfg).run(host="127.0.0.1", port=5000, debug=False)
