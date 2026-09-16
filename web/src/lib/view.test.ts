// Переходы между экранами и ворота по ключу. Требования 3 и 4 шага 11.
//
// Тесты написаны ДО вёрстки: экран потом только красит то, что здесь решено.

import { describe, expect, it } from "vitest";

import { EMPTY_SETTINGS, type Settings } from "./settings";
import { WITHOUT_KEY, go, reachable, start, type Screen, type View } from "./view";

const READY: Settings = {
  apiKey: "к",
  remember: true,
  provider: { baseUrl: "https://example.invalid/v1", visionModel: "модель" },
};
const EMPTY: Settings = { ...EMPTY_SETTINGS };
// Половина настроек — это всё ещё «нельзя читать»: ключ без адреса бесполезен.
const HALF: Settings = { ...EMPTY_SETTINGS, apiKey: "к" };

const ALL: Screen[] = ["first-launch", "home", "settings", "help", "camera",
                       "frame", "reading"];
const at = (screen: Screen, from?: Screen): View => ({ screen, from });

describe("какой экран первый", () => {
  it("без ключа — первый запуск, с ключом — главный", () => {
    expect(start(EMPTY)).toBe("first-launch");
    expect(start(HALF)).toBe("first-launch");
    expect(start(READY)).toBe("home");
  });
});

describe("ворота по ключу (решение 147)", () => {
  it("без ключа доступны ровно три экрана", () => {
    // Ни камеры, ни галереи, ни рамки: путь, ведущий к «нужен ключ», хуже,
    // чем честная просьба ключа в самом начале.
    expect(ALL.filter((s) => reachable(EMPTY, s))).toEqual([...WITHOUT_KEY]);
  });

  it("неполные настройки — те же три", () => {
    expect(ALL.filter((s) => reachable(HALF, s))).toEqual([...WITHOUT_KEY]);
  });

  it("с ключом доступно всё, кроме первого запуска", () => {
    // `2f` — это состояние «ключа нет», а не экран, куда можно вернуться.
    expect(ALL.filter((s) => reachable(READY, s)))
      .toEqual(["home", "settings", "help", "camera", "frame", "reading"]);
  });

  it("съёмка и выбор снимка без ключа не открываются вовсе", () => {
    const here = at("first-launch");
    expect(go(here, "scan", EMPTY)).toEqual(here);
    expect(go(here, "pick", EMPTY)).toEqual(here);
    expect(go(here, "sent", EMPTY)).toEqual(here);
  });
});

describe("настройки и помощь возвращают туда, откуда пришли", () => {
  it("с первого запуска — на первый запуск", () => {
    const open = go(at("first-launch"), "open-settings", EMPTY);
    expect(open).toEqual({ screen: "settings", from: "first-launch" });
    expect(go(open, "back", EMPTY)).toEqual({ screen: "first-launch" });
  });

  it("с главного — на главный", () => {
    const open = go(at("home"), "open-settings", READY);
    expect(open).toEqual({ screen: "settings", from: "home" });
    expect(go(open, "back", READY)).toEqual({ screen: "home" });
  });

  it("помощь открывается из настроек и туда же возвращает", () => {
    // Вход в помощь один — из настроек: с первого запуска ссылку убрали, чтобы
    // первый экран просил одно и только одно. Сам переход модель по-прежнему
    // допускает откуда угодно, но предлагать его больше некому.
    const fromSettings = go(at("settings", "home"), "open-help", READY);
    expect(fromSettings).toEqual({ screen: "help", from: "settings" });
    expect(go(fromSettings, "back", READY)).toEqual({ screen: "settings" });
  });

  it("дорога, ставшая недостижимой, не возвращает в тупик", () => {
    // Пришли в настройки с главного, ключ забыли — назад ведёт на первый запуск,
    // а не на экран, которого при пустых настройках не существует.
    expect(go(at("settings", "home"), "back", EMPTY))
      .toEqual({ screen: "first-launch" });
  });

  it("без записанной дороги «назад» ведёт в начало", () => {
    expect(go(at("settings"), "back", READY)).toEqual({ screen: "home" });
  });
});

describe("путь от главного до разбора", () => {
  it("снять: главный → камера → рамка → разбор", () => {
    let v = go(at("home"), "scan", READY);
    expect(v).toEqual({ screen: "camera" });
    v = go(v, "captured", READY);
    expect(v).toEqual({ screen: "frame" });
    v = go(v, "sent", READY);
    expect(v).toEqual({ screen: "reading" });
  });

  it("выбрать снимок: главный → сразу рамка", () => {
    expect(go(at("home"), "pick", READY)).toEqual({ screen: "frame" });
  });

  it("«Replace» на рамке ведёт в камеру — она же вход в галерею", () => {
    // Один контрол вместо пары «Take another / Another photo»: на `3d` есть
    // и спуск, и плитка галереи, поэтому оба источника в одном тапе.
    expect(go(at("frame"), "replace", READY)).toEqual({ screen: "camera" });
  });

  it("«Read another sign» возвращает на главный", () => {
    expect(go(at("reading"), "read-another", READY)).toEqual({ screen: "home" });
  });

  it("«назад» с камеры, рамки и разбора ведёт в начало", () => {
    for (const screen of ["camera", "frame", "reading"] as Screen[]) {
      expect(go(at(screen), "back", READY), screen).toEqual({ screen: "home" });
    }
  });

  it("дорогу помнят только настройки и помощь", () => {
    // Иначе «назад» с рамки уводило бы в камеру, из которой человек уже ушёл.
    expect(go(at("home"), "scan", READY).from).toBeUndefined();
    expect(go(at("camera"), "captured", READY).from).toBeUndefined();
    expect(go(at("frame"), "sent", READY).from).toBeUndefined();
  });
});
