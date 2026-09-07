"""Снимок как значение, а не как файл на диске.

Раньше конвейер принимал `Path` и сам читал файл. Для HTTP это не годится: фотография
пользователя приходит в теле запроса и **на диск не пишется** — ни во временный файл,
ни в кеш (`PROJECT_BRIEF.md`, границы ответственности). Поэтому снимок передаётся
по конвейеру как пара «имя и байты».

**`remember` по умолчанию `False`.** Фикстуры — рабочий артефакт авторского тестового
набора, а не хранилище чужих снимков. Безопасное значение стоит умолчанием намеренно:
если о флаге забыть, ответ модели о пользовательской фотографии никуда не запишется.
Включает его только `cli.py`, работающий по своим файлам.
"""
from __future__ import annotations

import struct

# Сигнатуры форматов заданы числами, а не байтовыми литералами: так их
# не искажает ни одна правка файла через оболочку.
PNG_MAGIC = bytes([137, 80, 78, 71, 13, 10, 26, 10])
JPEG_MAGIC = bytes([255, 216])
from dataclasses import dataclass
from pathlib import Path


def _pixel_size(data: bytes) -> tuple[int, int] | None:
    """Размер снимка в пикселях, прочитанный из заголовка.

    Разбор ручной и намеренно: тянуть ради двух чисел библиотеку изображений
    значит добавить зависимость, которой больше нигде не нужно. Формата два,
    оба фиксированы в первых байтах.

    `None` означает «формат не опознан» — и это НЕ повод для тревоги: неизвестный
    размер не должен наказывать разбор, иначе продукт станет придирчив к формату
    вместо того, чтобы судить о снимке.
    """
    if data[:8] == PNG_MAGIC and len(data) >= 24:
        w, h = struct.unpack(">II", data[16:24])
        return (w, h) if w and h else None
    if data[:2] != JPEG_MAGIC:
        return None
    i = 2
    while i < len(data) - 9:
        if data[i] != 0xFF:
            i += 1
            continue
        marker = data[i + 1]
        # SOF-маркеры несут размер; C4/C8/CC — таблицы, не начало кадра
        if 0xC0 <= marker <= 0xCF and marker not in (0xC4, 0xC8, 0xCC):
            h, w = struct.unpack(">HH", data[i + 5:i + 9])
            return (w, h) if w and h else None
        if marker in (0xD8, 0x01) or 0xD0 <= marker <= 0xD7:
            i += 2
            continue
        i += 2 + struct.unpack(">H", data[i + 2:i + 4])[0]
    return None


@dataclass(frozen=True)
class Photo:
    name: str
    data: bytes
    remember: bool = False

    @classmethod
    def from_path(cls, path: Path, *, remember: bool = True) -> "Photo":
        """Снимок из тестового набора: его ответы и складываются в фикстуры."""
        return cls(name=path.name, data=path.read_bytes(), remember=remember)

    @property
    def pixels(self) -> int | None:
        """Площадь снимка в пикселях. Нужна, чтобы судить о правдоподобии
        прочитанного: текст, которому не хватает пикселей, прочитан быть не мог."""
        size = _pixel_size(self.data)
        return None if size is None else size[0] * size[1]

    @property
    def stem(self) -> str:
        """Имя без расширения — по нему называются фикстуры."""
        return Path(self.name).stem
