"""Конвейер целиком.

`run` — стадии 0-1: отсев, извлечение, разделение распознанного и нераспознанного.
`analyze` — то же плюс движок правил и категория полноты, то есть весь путь
от снимка до ответа. Именно `analyze` вызывает HTTP-слой (этап 6a): сам он о правилах
парковки ничего не знает и знать не должен.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

from datetime import datetime

from . import completeness, engine
from .calendar_se import Calendar
from .completeness import Assessment
from .config import Config
from .photo import Photo
from .engine import Evaluation
from .reference import Recognised, Reference, recognise
from .validation import Validator
from .vision import ExtractOutcome, TriageOutcome, classify_image, extract_sign_data


@dataclass
class Outcome:
    image: str
    stopped_at: str | None            # "triage" | "extraction" | None
    reason: str | None
    triage: TriageOutcome | None = None
    extraction: ExtractOutcome | None = None
    recognised: Recognised | None = None
    flags: list[str] = field(default_factory=list)

    @property
    def ok(self) -> bool:
        return self.stopped_at is None


def run(image: Photo, cfg: Config, validator: Validator, ref: Reference) -> Outcome:
    """Один снимок через обе стадии.

    Отсев возвращает метку; останавливает конвейер **этот код** по `TRIAGE_ENFORCE`.
    При `TRIAGE_ENFORCE=false` метка записывается, но снимок идёт дальше: так на этапе 5
    меряется доля ложных отсевов, не теряя разборы.
    """
    tri = classify_image(image, cfg, validator)

    if not tri.is_parking_sign and cfg.triage_enforce:
        return Outcome(image.name, stopped_at="triage",
                       reason=tri.what_i_see or tri.category, triage=tri)

    ext = extract_sign_data(image, cfg, validator,
                            panels_seen=tri.panels_below_main_sign)

    # Прочитано слишком мало — спросить ЕЩЁ РАЗ, но ровно один.
    #
    # Найдено разработчиком в браузере: `049` и `056` с первой попытки дали
    # «прочитано слишком мало», со второй разобрались целиком. Квота тут ни при
    # чём — отказ провайдера повторяется сам (`vision.RETRY_STATUS`) и в разбор
    # не превращается, а возвращается ошибкой. Это разброс самой модели: один
    # и тот же снимок, один и тот же вопрос, разные ответы.
    #
    # Цена переспроса близка к нулю: на всех 57 снимках набора `insufficient`
    # не случился ни разу. Зато случается он ровно там, где продукту иначе нечего
    # сказать, — а человек в этот момент стоит перед знаком.
    #
    # Размер снимка условием НЕ является: `032` разбирается целиком на 19 тысячах
    # пикселей, потому что текста на нём нет вовсе. «Мелкий» и «безнадёжный» —
    # разные вещи, и порог по площади отсекал бы не то.
    повторили = False
    if (not cfg.demo_mode and ext.validation.ok and ext.data is not None
            and completeness.too_little(ext.data)):
        ещё = extract_sign_data(image, cfg, validator,
                                panels_seen=tri.panels_below_main_sign)
        повторили = True
        # Второй ответ берётся, только если он лучше: одинаково плохие ответы
        # менять местами незачем.
        if (ещё.validation.ok and ещё.data is not None
                and not completeness.too_little(ещё.data)):
            ext = ещё

    if not ext.validation.ok:
        return Outcome(image.name, stopped_at="extraction",
                       reason="; ".join(ext.validation.schema_errors[:3]),
                       triage=tri, extraction=ext)

    rec = recognise(ext.data, ref)
    flags = list(ext.validation.flags)
    if повторили:
        flags.append("extraction_retried")
    if not tri.is_parking_sign:
        # Не остановились только потому, что TRIAGE_ENFORCE=false.
        flags.append(f"triage_said:{tri.category}")
    if rec.missing_keys:
        flags.append("reference_gap:" + ",".join(rec.missing_keys))
    if rec.uninterpreted:
        flags.append("uninterpreted_panels:" +
                     ",".join(str(i) for i in sorted(rec.uninterpreted)))

    return Outcome(image.name, stopped_at=None, reason=None,
                   triage=tri, extraction=ext, recognised=rec, flags=flags)


@dataclass
class Analysis:
    """Полный ответ по снимку: что извлечено, что действует, и чего не хватает."""
    outcome: Outcome
    assessment: Assessment
    evaluation: Evaluation | None = None

    @property
    def has_answer(self) -> bool:
        return self.assessment.has_answer and self.evaluation is not None


def analyze(image: Photo, cfg: Config, validator: Validator, ref: Reference,
            cal: Calendar, moment: datetime) -> Analysis:
    """Снимок → ответ. Порядок обязательный и обратного хода не имеет.

    Категория полноты считается **после** движка, потому что ей нужны и флаги
    извлечения, и неопределённости движка. Правило асимметрии применяется последним:
    сузить можно, расширить нельзя.
    """
    out = run(image, cfg, validator, ref)

    if out.stopped_at == "triage":
        return Analysis(out, completeness.grade(
            None, triage_category=out.triage.category))

    if out.stopped_at == "extraction":
        return Analysis(out, completeness.grade(None, schema_valid=False))

    ev = engine.evaluate_parking_rules(out.extraction.data, moment, cal)
    assessment = completeness.grade(
        out.extraction.data,
        flags=out.flags,
        repairs=out.extraction.validation.repairs,
        evaluation=ev,
        image_pixels=image.pixels)
    return Analysis(out, assessment, completeness.apply_asymmetry(ev, assessment))
