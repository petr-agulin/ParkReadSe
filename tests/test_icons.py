# -*- coding: utf-8 -*-
"""Иконки приложения — те три картинки, по которым человек найдёт его на телефоне.

Проверять картинку глазами можно один раз; дальше её надо проверять кодом. Здесь
три вопроса: совпадает ли лежащий файл с тем, что рисует `icons.py`; не вылезает ли
содержимое маскируемой иконки за круг, внутри которого не режет ни одна маска;
и прозрачны ли углы обычной — иначе белый угол ляжет заплаткой на тёмный экран.

Файлы не перерисовываются: полный проход по 512×512 занимает секунды, и платить
их за каждый прогон незачем. Вместо этого готовый файл разбирается обратно
в пиксели, и с кодом сверяются выборочные строки.
"""
from pathlib import Path

from parkread import icons

PUBLIC = Path("web/public")


def _decoded(file: str):
    return icons.decode((PUBLIC / file).read_bytes())


def test_the_files_on_disk_are_what_the_code_draws():
    for file, size, maskable in icons.ICONS:
        width, height, rows = _decoded(file)
        assert (width, height) == (size, size), file
        # Девять строк по всей высоте: правка рисунка меняет хоть одну из них.
        for py in [round(size * k / 8) for k in range(9)]:
            py = min(py, size - 1)
            assert rows[py] == icons.row(size, py, maskable=maskable), f"{file}, строка {py}"


def test_the_maskable_icon_keeps_everything_inside_the_safe_circle():
    """Круг радиусом 40% ширины — то, что переживёт любую маску. Уголки рамки
    и есть самые дальние от центра точки рисунка, и обрезать их нельзя: без них
    иконка станет очередным парковочным `P`."""
    size, rows = 512, _decoded("icon-maskable-512.png")[2]
    limit = 0.40 * size
    for y, row in enumerate(rows):
        for x, (r, g, b, a) in enumerate(row):
            assert a == 255, "у маскируемой иконки поле сплошное"
            if r > 200 and g > 200 and b > 200:
                far = ((x + 0.5 - size / 2) ** 2 + (y + 0.5 - size / 2) ** 2) ** 0.5
                assert far <= limit, f"белое в ({x}, {y}) выходит за круг безопасности"


def test_the_ordinary_icons_are_transparent_at_the_corners():
    """Обычная иконка скруглена сама. Непрозрачный угол — это белая заплатка,
    которая видна на всяком экране, кроме белого."""
    for file, size, maskable in icons.ICONS:
        if maskable:
            continue
        rows = _decoded(file)[2]
        assert rows[0][0][3] == 0, f"{file}: угол непрозрачен"
        assert rows[size // 2][size // 2][3] == 255, f"{file}: середина не сплошная"


def test_the_icon_wears_the_blue_of_the_sign():
    """Цвет один и тот же во всём продукте: синий шведского знака."""
    rows = _decoded("icon-512.png")[2]
    assert rows[256][8][:3] == icons.BLUE
