"""Иконки приложения. Рисуются кодом, без библиотеки изображений.

**Что на иконке.** Синий `P` шведского знака — и белые уголки рамки, той самой,
которую человек наводит на знак перед отправкой. Знак говорит, о чём приложение;
уголки — что оно с ним делает: читает. Один голый `P` носят и платёжные парковочные
приложения, и продукт был бы неотличим от них (выбор разработчика, 2026-09-11).

**Почему рисуем сами.** Зависимость ради трёх картинок не нужна, а картинка,
порождённая кодом, ещё и правится кодом: цвет из `design.md` стоит здесь один раз
и не разъезжается с интерфейсом. Тот же приём, что со справочником и схемами:
источник — код, файл — следствие.

Сглаживание — передискретизацией: рисуем вчетверо крупнее и усредняем. Ради ровного
края этого довольно, а шрифт не нужен вовсе: `P` складывается из прямоугольника
стойки, прямоугольника дуги и круга.

**Две иконки из трёх — со скруглением и прозрачностью, третья — под маску.**
Система, которая обрезает иконку под свою форму, получает `icon-maskable-512`:
поле у неё сплошное, а содержимое умещается в круг радиусом 40% ширины — тот,
внутри которого не режет ни одна маска. Обычные иконки, наоборот, скруглены сами
и прозрачны по углам: иначе белый угол лёг бы заплаткой на тёмный экран.
"""
from __future__ import annotations

import struct
import zlib
from pathlib import Path

# Синий шведского знака — он же акцент интерфейса (`design.md`).
BLUE = (0x00, 0x57, 0xA8)
WHITE = (0xFF, 0xFF, 0xFF)

SUPERSAMPLE = 4

# Доля ширины, занятая содержимым. У маскируемой она меньше не для красоты:
# уголки рамки — самые дальние от центра точки рисунка, и при 0.62 они ложатся
# ровно внутрь круга безопасности (0.45 * 0.62 * √2 ≈ 0.395 < 0.40).
SCALE = {False: 0.94, True: 0.62}
CORNER_RADIUS = 0.22        # скругление поля обычной иконки


def _rounded_rect(x: float, y: float, x0: float, y0: float,
                  x1: float, y1: float, r: float) -> bool:
    """Внутри ли точка прямоугольника со скруглением `r`."""
    cx = min(max(x, x0 + r), x1 - r)
    cy = min(max(y, y0 + r), y1 - r)
    if x0 <= x <= x1 and y0 <= y <= y1:
        if (x0 + r <= x <= x1 - r) or (y0 + r <= y <= y1 - r):
            return True
    return (x - cx) ** 2 + (y - cy) ** 2 <= r * r


def _disc(x: float, y: float, cx: float, cy: float, r: float) -> bool:
    return (x - cx) ** 2 + (y - cy) ** 2 <= r * r


def _letter_p(x: float, y: float) -> bool:
    """Буква `P` в единичном квадрате: прямая стойка и круглая дуга.

    Дуга складывается из прямоугольника и круга, а не из скруглённого
    прямоугольника: у последнего скругляются ВСЕ углы, и слева, на стыке
    со стойкой, получалась ступенька.
    """
    s = 0.20                                     # толщина штриха
    stem = (0.0 <= x <= s and 0.0 <= y <= 1.0)
    bowl = ((0.0 <= x <= 0.52 and 0.0 <= y <= 0.56)
            or _disc(x, y, 0.52, 0.28, 0.28))
    hole = ((s <= x <= 0.52 and s <= y <= 0.36)
            or _disc(x, y, 0.52, 0.28, 0.08))
    return (stem or bowl) and not hole


def _corner_marks(x: float, y: float, margin: float, length: float,
                  thick: float) -> bool:
    """Четыре уголка рамки — той самой, что человек наводит на знак.

    Каждый уголок строится от ВНЕШНЕГО угла внутрь: так обе полосы кончаются
    ровно на одной линии. Рисуй их от середины — вертикальная выступала бы
    за горизонтальную язычком.
    """
    for ox, dx in ((margin, 1.0), (1.0 - margin, -1.0)):
        for oy, dy in ((margin, 1.0), (1.0 - margin, -1.0)):
            hx = sorted((ox, ox + dx * length))
            hy = sorted((oy, oy + dy * thick))
            vx = sorted((ox, ox + dx * thick))
            vy = sorted((oy, oy + dy * length))
            horizontal = (hx[0] <= x <= hx[1] and hy[0] <= y <= hy[1])
            vertical = (vx[0] <= x <= vx[1] and vy[0] <= y <= vy[1])
            if horizontal or vertical:
                return True
    return False


def _ink(u: float, v: float) -> bool:
    """Белое ли в точке поля: буква или уголок рамки."""
    lu = (u - 0.34) / 0.32
    lv = (v - 0.27) / 0.46
    if 0.0 <= lu <= 1.0 and 0.0 <= lv <= 1.0 and _letter_p(lu, lv):
        return True
    return 0.0 <= u <= 1.0 and 0.0 <= v <= 1.0 and _corner_marks(u, v, 0.05, 0.22, 0.06)


Pixel = tuple[int, int, int, int]


def row(size: int, py: int, *, maskable: bool) -> list[Pixel]:
    """Одна строка иконки, RGBA. Отдельной функцией — чтобы тест мог сверить
    выборочные строки готового файла с кодом, не перерисовывая всю картинку."""
    big = size * SUPERSAMPLE
    scale = SCALE[maskable]
    per_pixel = SUPERSAMPLE * SUPERSAMPLE
    out: list[Pixel] = []
    for px in range(size):
        ground = 0
        white = 0
        for sy in range(SUPERSAMPLE):
            y = (py * SUPERSAMPLE + sy + 0.5) / big
            for sx in range(SUPERSAMPLE):
                x = (px * SUPERSAMPLE + sx + 0.5) / big
                if not maskable and not _rounded_rect(x, y, 0, 0, 1, 1, CORNER_RADIUS):
                    continue
                ground += 1
                if _ink((x - 0.5) / scale + 0.5, (y - 0.5) / scale + 0.5):
                    white += 1
        share = white / ground if ground else 0.0          # доля белого в поле
        pixel = tuple(round(BLUE[i] + (WHITE[i] - BLUE[i]) * share) for i in range(3))
        out.append((*pixel, round(255 * ground / per_pixel)))
    return out


def _paint(size: int, *, maskable: bool) -> list[list[Pixel]]:
    return [row(size, py, maskable=maskable) for py in range(size)]


def _png(rows: list[list[Pixel]]) -> bytes:
    """PNG из пикселей. Формат простой: заголовок, данные, конец."""
    height = len(rows)
    width = len(rows[0])
    raw = b"".join(b"\x00" + bytes(v for px in row for v in px) for row in rows)

    def chunk(tag: bytes, data: bytes) -> bytes:
        body = tag + data
        return (struct.pack(">I", len(data)) + body
                + struct.pack(">I", zlib.crc32(body) & 0xFFFFFFFF))

    header = struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)   # 8 бит, RGBA
    return (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", header)
            + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b""))


ICONS = (("icon-192.png", 192, False),
         ("icon-512.png", 512, False),
         ("icon-maskable-512.png", 512, True))


def render(name: str) -> bytes:
    for file, size, maskable in ICONS:
        if file == name:
            return _png(_paint(size, maskable=maskable))
    raise KeyError(name)


def write(out_dir: Path) -> list[str]:
    """Нарисовать все иконки. Возвращает имена изменившихся файлов."""
    out_dir.mkdir(parents=True, exist_ok=True)
    changed = []
    for file, size, maskable in ICONS:
        data = _png(_paint(size, maskable=maskable))
        path = out_dir / file
        if not path.exists() or path.read_bytes() != data:
            path.write_bytes(data)
            changed.append(file)
    return changed


def decode(data: bytes) -> tuple[int, int, list[list[Pixel]]]:
    """Обратно в пиксели — для проверки. Разбор узкий: только то, что пишем сами,
    RGBA без чересстрочности и с нулевым фильтром строк."""
    if data[:8] != b"\x89PNG\r\n\x1a\n":
        raise ValueError("не PNG")
    at = 8
    header: tuple[int, ...] | None = None
    body = b""
    while at < len(data):
        length = struct.unpack(">I", data[at:at + 4])[0]
        tag = data[at + 4:at + 8]
        payload = data[at + 8:at + 8 + length]
        if tag == b"IHDR":
            header = struct.unpack(">IIBBBBB", payload)
        elif tag == b"IDAT":
            body += payload
        at += 12 + length
    if header is None:
        raise ValueError("нет заголовка")
    width, height, depth, colour = header[0], header[1], header[2], header[3]
    if (depth, colour) != (8, 6):
        raise ValueError(f"ожидалось 8 бит RGBA, а не {depth}/{colour}")
    raw = zlib.decompress(body)
    stride = 1 + width * 4
    rows = []
    for y in range(height):
        line = raw[y * stride:(y + 1) * stride]
        if line[0] != 0:
            raise ValueError("строка с фильтром: такие мы не пишем")
        rows.append([tuple(line[1 + x * 4:5 + x * 4]) for x in range(width)])
    return width, height, rows
