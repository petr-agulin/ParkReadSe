r"""Командная строка проекта.

Запуск — через интерпретатор виртуального окружения: системный Python зависимостей
не имеет (`PLAN.md`, решение 103). Ниже он для краткости обозначен как `PY`,
на деле это `.venv\Scripts\python.exe`.

    PY cli.py describe                 — что настроено (ключ не печатается)
    PY cli.py run <снимок> [...]       — прогнать снимки через отсев и извлечение
        --refresh                      — переспросить даже то, что уже отвечено
    PY cli.py economics                — таблица экономики отсева по замерам
    PY cli.py explain <снимок> [дата]  — что действует, по движку правил
    PY cli.py accuracy                 — точность извлечения против эталонов
    PY cli.py calibrate                — порог уверенности по расхождениям ОТВЕТА
    PY cli.py parity                   — свежи ли эталоны двойного прогона
        --write                        — переписать их (правка видна в git diff)

При `DEMO_MODE=true` (по умолчанию) ключ не нужен: ответы читаются из фикстур.
Живой вызов делает разработчик — команде нужен секрет (`AGENTS.md`, §12).
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

from datetime import datetime

from parkread import (accuracy, completeness, config, economics, fixtures,
                      parity, pipeline, present, prompts)
from parkread.engine import evaluate_parking_rules
from parkread.photo import Photo
from parkread.calendar_se import Calendar
from parkread.reference import Reference
from parkread.validation import Validator


def _load():
    cfg = config.load()
    return cfg, Validator(cfg.schema_path), Reference(cfg.reference_path)


def cmd_describe() -> int:
    cfg, _, ref = _load()
    for k, v in cfg.describe().items():
        print(f"  {k:16} {v}")
    print(f"  {'reference':16} {len(ref)} записей")
    print(f"  {'fixtures':16} {cfg.demo_fixtures_path}")
    return 0


def _expand(paths: list[str]) -> list[Path]:
    """PowerShell не раскрывает `*.jpg` за внешнюю программу — она получает звёздочку
    как есть. Раскрываем сами, иначе команда из README молча не находит ни одного файла."""
    out: list[Path] = []
    for raw in paths:
        if any(ch in raw for ch in "*?["):
            out.extend(sorted(Path().glob(raw.replace("\\", "/"))))
        else:
            out.append(Path(raw))
    return out


def cmd_run(paths: list[str], refresh: bool = False) -> int:
    cfg, val, ref = _load()
    bad = 0

    # Повторный прогон не должен тратить квоту заново — но пропускать снимок можно
    # только если ответ получен ТЕМ ЖЕ вопросом. Правка промпта делает вопрос другим,
    # и старый ответ на него больше не отвечает: пропустив такой снимок, замер молча
    # смешал бы две версии промпта в одном числе. Поэтому сверяется отпечаток промпта,
    # а не факт существования файла — и по ОБЕИМ стадиям сразу, потому что правка
    # промпта отсева не трогает промпт извлечения.
    stages: list[tuple[str, str]] = []
    if not cfg.demo_mode:
        for stage, schema_name, build in (
                ("triage", "triage.schema.json", prompts.triage),
                ("extract", "sign.schema.json", prompts.extract)):
            schema = json.loads(
                (cfg.schema_path / schema_name).read_text(encoding="utf-8"))
            stages.append((stage, build(schema)))

    for img in _expand(paths):
        print(f"\n=== {img.name} ===")

        # На отказном кадре стадия извлечения не выполнялась, и её фикстуры нет
        # не потому, что ответ устарел, а потому, что вопроса не было.
        refused = bool(stages) and fixtures.refused(cfg.demo_fixtures_path, img)
        needed = [(s, pr) for s, pr in stages if not (refused and s == "extract")]

        if needed and not refresh and not any(
                fixtures.stale(cfg.demo_fixtures_path, img, stage, prompt)
                for stage, prompt in needed):
            print("  отсев уже отказал этому снимку — пропущен" if refused
                  else "  уже есть ответы на те же промпты — пропущен")
            continue

        try:
            # remember=True: это снимки авторского набора, их ответы и есть фикстуры
            out = pipeline.run(Photo.from_path(img, remember=True), cfg, val, ref)
        except FileNotFoundError as e:
            print(f"  пропущен: {e}")
            bad += 1
            continue
        except Exception as e:
            # Одна неудача не должна ронять весь прогон: провайдер может ответить
            # 429 на середине, а уже полученные ответы сохранены в фикстуры.
            print(f"  ОШИБКА вызова: {type(e).__name__}: {str(e)[:200]}")
            bad += 1
            continue

        t = out.triage
        print(f"  отсев:      {t.category}"
              f"{' (из фикстуры)' if t.from_demo else ''}"
              f" | панелей насчитал: {t.panels_below_main_sign}")
        # Молчаливый отказ здесь однажды уже подменил замер: ответ отсева не проходил
        # проверку, не сохранялся, и на диске оставалась старая затравка.
        if t.validation and t.validation.repairs:
            print("  правки отсева: " + "; ".join(t.validation.repairs))
        if t.validation and not t.validation.ok:
            print("  ОТСЕВ ОТБРАКОВАН, ответ не сохранён: "
                  + "; ".join(t.validation.schema_errors[:3]))
        if out.stopped_at == "triage":
            print(f"  ОСТАНОВЛЕН: {out.reason}")
            continue
        if out.stopped_at == "extraction":
            print(f"  ОТБРАКОВАН валидацией: {out.reason}")
            bad += 1
            continue

        d = out.extraction.data
        print(f"  знак:       {d['main_sign']['type']} / {d['main_sign']['form']}"
              f" / {d['main_sign']['background_color']}")
        print(f"  панелей:    {d['panel_count']}")
        for p in d["panels"]:
            keys = out.recognised.panel_keys.get(p["index"], [])
            txt = " | ".join(p["lines"]) or "(без текста)"
            print(f"    {p['index']}. [{p['kind']:10}] {txt}")
            print(f"       справочник: {', '.join(keys) if keys else 'нет совпадений'}")
        for i, lines in sorted(out.recognised.uninterpreted.items()):
            print(f"  не интерпретируется, панель {i}: {'; '.join(lines)}")
        if out.extraction.validation.repairs:
            print("  правки валидации: " + "; ".join(out.extraction.validation.repairs))
        print(f"  сигналы:    {', '.join(out.flags) if out.flags else 'чисто'}")
    return 1 if bad else 0


def cmd_explain(args: list[str]) -> int:
    """Прогон снимка через отсев, извлечение и движок правил.

    Второй аргумент — момент времени вида 2026-03-07T12:00. По умолчанию «сейчас»."""
    cfg, val, ref = _load()
    img = Path(args[0])
    moment = datetime.fromisoformat(args[1]) if len(args) > 1 else datetime.now()
    cal = Calendar()

    res = pipeline.analyze(Photo.from_path(img, remember=True),
                           cfg, val, ref, cal, moment)
    out, a, ev = res.outcome, res.assessment, res.evaluation

    print(f"  полнота:    {a.category}   уверенность: {a.confidence}")
    if a.reasons:
        print(f"  причины:    {', '.join(a.reasons)}")
    if a.category == "not_a_parking_sign":
        print(f"  на снимке не парковочный знак: {out.triage.what_i_see}")
        return 0
    if not res.has_answer:
        print(f"  данных недостаточно, вывода нет: {out.reason or 'см. причины выше'}")
        return 0
    if a.may_hide_prohibition:
        print("  непрочитанная панель может быть запретом — ни один период "
              "не подаётся как разрешающий")
    print(f"\n=== {img.name} | момент: {moment:%Y-%m-%d %H:%M} "
          f"({cal.day_class(moment.date())}) ===")
    if not ev.permits_parking:
        print("  знак стоянки не разрешает вовсе: это указатель направления")
        return 0

    for r in ev.regimes:
        print(f"\n  участок: {r.extent}")
        if r.eligibility:
            names = [ref.get(k).en for k in r.eligibility if ref.get(k)]
            print("  кому отведены места: " + " + ".join(names))
        for k in r.place_notes:
            e = ref.get(k)
            if e:
                print(f"  пометка: {e.en}")
        if r.duration_expires_at:
            src = "с таблички" if r.duration_source == "plate" else "правило 24 часов"
            print(f"  длительность истекает: {r.duration_expires_at:%a %d.%m %H:%M} ({src})")
        print("  шкала:")
        for per in r.periods[:8]:
            conds = ", ".join(ref.get(c).en for c in per.conditions if ref.get(c)) or "—"
            print(f"    {per.start:%a %d.%m %H:%M} → {per.end:%a %d.%m %H:%M}  "
                  f"[{per.state}]  {conds}")
    if ev.uncertainties:
        print(f"\n  неопределённость: {', '.join(ev.uncertainties)}")
    return 0


def _extract_fingerprint(cfg) -> str:
    """Отпечаток промпта, которым СЕЙЧАС спрашивают. Замер считает только ответы
    на этот вопрос — иначе в одном числе смешаются две версии промпта."""
    schema = json.loads(
        (cfg.schema_path / "sign.schema.json").read_text(encoding="utf-8"))
    return fixtures.fingerprint(prompts.extract(schema))


def _report_outdated(cfg, exp_dir: Path) -> None:
    старые = accuracy.answers_from_another_prompt(
        exp_dir, cfg.demo_fixtures_path, _extract_fingerprint(cfg))
    if старые:
        print()
        print(f"В замер НЕ вошли {len(старые)}: ответ получен другим промптом.")
        for n in старые:
            print(f"  {n}")
        print(r"  Переспросить: .venv\Scripts\python.exe cli.py run testset/photos/<снимок>")


def cmd_accuracy() -> int:
    """Замер по эталонам testset/expected против настоящих ответов модели.

    Затравка `hand_marked` в замер не входит: мерить модель по эталону, написанному
    не моделью, значит мерить не то."""
    cfg, _, _ = _load()
    exp_dir = Path("testset/expected")
    pairs = accuracy.load_pairs(exp_dir, cfg.demo_fixtures_path,
                                prompt_fingerprint=_extract_fingerprint(cfg))

    total_exp = len(list(exp_dir.glob("*.json")))
    if not pairs:
        print(f"Нет ни одного настоящего ответа модели. Эталонов: {total_exp}.")
        print("Замер требует живых прогонов — команду с ключом выполняет разработчик:")
        print("  1) в .env: DEMO_MODE=false")
        print(r"  2) .venv\Scripts\python.exe cli.py run testset/photos/*.jpg")
        print("  3) вернуть DEMO_MODE=true и повторить эту команду")
        return 1

    rep = accuracy.Report()
    for label, exp, act in pairs:
        accuracy.compare(exp, act, label, rep)
    print(accuracy.table(rep))
    print(f"\nПокрытие замера: {len(pairs)} из {total_exp} эталонов "
          f"({len(pairs) / total_exp:.0%}). Остальные ждут живого прогона.")
    _report_outdated(cfg, exp_dir)

    if rep.mistakes:
        print("\nТиповые ошибки извлечения:")
        for m in rep.mistakes[:20]:
            print(f"  - {m}")

    # отсев: доля ложных отбраковок и доля пропущенного мусора
    #
    # Парковочный знак снимок или нет, берётся из объявленного списка, а не из наличия
    # эталона: неразмеченный парковочный знак — это не мусор, и считать его мусором
    # значит завышать качество отсева.
    not_parking = accuracy.load_triage_expectations(Path("testset/triage_expected.json"))
    is_parking, triage = {}, {}
    for f in sorted(cfg.demo_fixtures_path.glob("*.triage.json")):
        d = json.loads(f.read_text(encoding="utf-8"))
        if d.get("origin", "model") != "model":
            continue
        stem = f.name[:-len(".triage.json")]
        triage[stem] = d["response"].get("category", "")
        is_parking[stem] = stem not in not_parking
    if triage:
        t = accuracy.triage_report(is_parking, triage)
        print(f"\nОтсев: настоящих знаков {t['real_signs']}, "
              f"ошибочно отсеяно {t['false_rejects']} "
              f"({t['false_reject_share']:.0%}); "
              f"кадров не о парковке {t['junk_frames']}, "
              f"пропущено дальше {t['junk_let_through']}")
    return 0


def cmd_calibrate() -> int:
    """Порог — не мнение, а следствие замера. Команда его пересчитывает.

    Считается не совпадение полей, а совпадение ОТВЕТА: движок пускается дважды,
    по эталону и по ответу модели, и сравнивается то, что прочтёт человек. Разница
    существенна — на наборе из 47 снимков поля разошлись у 19, а ответ у 6.
    """
    cfg, val, ref = _load()
    cal = Calendar()
    moment = datetime(2026, 3, 2, 0, 0)   # обычный понедельник, вне праздников

    rows, seen = [], {}
    for label, expected, actual in accuracy.load_pairs(
            Path("testset/expected"), cfg.demo_fixtures_path,
            prompt_fingerprint=_extract_fingerprint(cfg)):
        a = accuracy.verdict_slice(expected, moment, cal, evaluate_parking_rules)
        b = accuracy.verdict_slice(actual, moment, cal, evaluate_parking_rules)
        diff = accuracy.verdict_differences(a, b)

        photo = next(iter(_expand([f"testset/photos/{label}.*"])), None)
        if photo is None:
            print(f"  снимка нет на диске: {label}")
            continue
        assessment = pipeline.analyze(
            Photo.from_path(photo), cfg, val, ref, cal, moment).assessment
        for k, v in assessment.signals.items():
            seen.setdefault(k, set()).add(round(v, 3))
        rows.append((assessment.confidence, assessment.category, bool(diff), label, diff))

    if not rows:
        print("нечего калибровать: живых ответов модели нет")
        return 1

    rows.sort()
    diverged = [r for r in rows if r[2]]
    print(f"Снимков в калибровке: {len(rows)}")
    print(f"Ответ совпал с эталоном: {len(rows) - len(diverged)}; "
          f"разошёлся: {len(diverged)}")
    print()

    print("Разошедшиеся ответы:")
    for conf, cat, _, label, diff in diverged:
        print(f"  {conf:<6} {cat:<8} {label}")
        for d in diff:
            print(f"           {d}")

    print()
    print(accuracy.threshold_table(rows))
    print()
    print(f"Порог сейчас: {present.GOOD_ENOUGH}")

    _report_outdated(cfg, Path("testset/expected"))

    dead = accuracy.dead_signals(seen)
    if dead:
        вес = sum(completeness.WEIGHTS[k] for k in dead)
        print()
        print(f"Сигналы, ни разу не изменившиеся на наборе (вес {вес:.2f} из 1.00):")
        for k in dead:
            print(f"  {k} (вес {completeness.WEIGHTS[k]:.2f})")
        print("  Это НЕ повод переложить их вес на остальные: постоянны они потому,")
        print("  что в наборе нет снимков, которые их сдвинули бы. Нужны плохие кадры.")
    return 0


def cmd_economics() -> int:
    """Замеры берутся из фикстур: usage сохраняется вместе с ответом."""
    cfg, _, _ = _load()
    tri = ext = None
    for p in sorted(cfg.demo_fixtures_path.glob("*.json")):
        d = json.loads(p.read_text(encoding="utf-8"))
        u = d.get("usage") or {}
        if not u:
            continue
        # OpenAI-совместимый ответ: prompt_tokens / completion_tokens.
        # Разбивку по изображению провайдер отдаёт не всегда — она справочная
        # и на расчёт не влияет: считаются суммы.
        img = ((u.get("prompt_tokens_details") or {}).get("image_tokens")
               or (u.get("prompt_tokens_details") or {}).get("cached_tokens") or 0)
        usage = economics.Usage(u.get("prompt_tokens", 0),
                                u.get("completion_tokens", 0), img)
        if d["stage"] == "triage" and tri is None:
            tri = usage
        if d["stage"] == "extract" and ext is None:
            ext = usage

    if not tri or not ext:
        print("Нет замеров. Нужен хотя бы один живой прогон обеих стадий:")
        print("  1) в .env поставьте DEMO_MODE=false")
        print(r"  2) .venv\Scripts\python.exe cli.py run "
              "testset/photos/005-2tim-8-18-parentes-8-15-dubbelpil.jpg")
        print("  3) верните DEMO_MODE=true и повторите эту команду")
        return 1

    for ratio in (1, 5, 10):
        print(f"\n--- модель извлечения дороже отсева в {ratio} раз(а) ---")
        print(economics.table(economics.Scenario(tri, ext, price_ratio=ratio)))
    return 0


def cmd_parity(write: bool) -> int:
    """Эталоны двойного прогона: показать расхождение или переписать.

    Переписывание — отдельная команда намеренно: изменился ответ продукта, и это
    должно быть видно строкой в `git diff`, а не случиться само во время прогона.
    """
    if write:
        changed = parity.write()
        print("переписано:", ", ".join(changed) if changed else "нечего — всё совпало")
        print(f"случаев: {len(parity.build_cases())}")
        return 0

    остальные = parity.stale()
    if остальные:
        print("Эталоны устарели:")
        for line in остальные:
            print("  ", line)
        print()
        print(r"Переписать: .venv\Scripts\python.exe cli.py parity --write")
        return 1

    переехало = parity.ported()
    print(f"Эталоны свежие. Случаев: {len(parity.build_cases())}.")
    print("Слои на TypeScript:",
          ", ".join(переехало) if переехало else "ни одного — сверять пока нечего")
    осталось = [n for n in parity.LAYERS if n not in переехало]
    if осталось:
        print("Ждут порта:", ", ".join(осталось))
    return 0


def main(argv: list[str]) -> int:
    if len(argv) < 2:
        print(__doc__)
        return 2
    cmd, rest = argv[1], argv[2:]
    if cmd == "describe":
        return cmd_describe()
    if cmd == "run":
        refresh = "--refresh" in rest
        rest = [a for a in rest if a != "--refresh"]
        if not rest:
            print("укажите хотя бы один снимок")
            return 2
        return cmd_run(rest, refresh=refresh)
    if cmd == "explain":
        if not rest:
            print("укажите снимок")
            return 2
        return cmd_explain(rest)
    if cmd == "accuracy":
        return cmd_accuracy()
    if cmd == "calibrate":
        return cmd_calibrate()
    if cmd == "economics":
        return cmd_economics()
    if cmd == "parity":
        return cmd_parity("--write" in rest)
    print(f"неизвестная команда: {cmd}")
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv))
