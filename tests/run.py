# -*- coding: utf-8 -*-
"""Запуск регрессии без внешних зависимостей: python tests/run.py"""
import importlib, sys, traceback
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
import os
os.chdir(ROOT)

failed = []
for mod_name in sorted(p.stem for p in Path("tests").glob("test_*.py")):
    mod = importlib.import_module(f"tests.{mod_name}")
    for name in sorted(n for n in dir(mod) if n.startswith("test_")):
        try:
            getattr(mod, name)()
            print(f"  OK    {mod_name}.{name}")
        except Exception:
            failed.append(f"{mod_name}.{name}")
            print(f"  ПЛОХО {mod_name}.{name}")
            traceback.print_exc(limit=3)

print()
print("ИТОГ:", "всё сошлось" if not failed else f"{len(failed)} упало: {failed}")
sys.exit(1 if failed else 0)
