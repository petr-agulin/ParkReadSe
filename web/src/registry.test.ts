// Реестр питон-тестов — страховка шага 8.
//
// Питон уходит, а с ним 301 тест. Помнить, какой из них перенесён, нельзя, и
// полагаться на это не будем: каждый назван поимённо в `parity/python-tests.json`,
// и против имени стоит одно из трёх — ещё не решено, перенесён, снят с причиной.
//
// Перенесённый тест находится по метке в TypeScript-тесте: строка `py:`, за ней
// имя файла питон-теста, два двоеточия и имя функции. Метка — не комментарий для
// красоты: без неё запись «перенесён» валит этот файл.
//
// **Главное правило стоит последним тестом:** когда папки `tests/` больше нет,
// нерешённых записей быть не должно. Питон нельзя удалить раньше, чем решена
// судьба каждого его теста, — и это проверяет код, а не память.

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const WEB = `${ROOT}web/`;
const PYTHON_TESTS = `${ROOT}tests/`;
const FROZEN_COUNT = 301;

type Entry = { status: string; reason?: string };
type Registry = { frozen: string; count: number; tests: Record<string, Entry> };

const registry: Registry = JSON.parse(
  readFileSync(`${ROOT}parity/python-tests.json`, "utf-8"));
const entries = Object.entries(registry.tests);
const pythonAlive = existsSync(PYTHON_TESTS);

const TAG = /py:\s*(test_[a-z_]+::test_[a-z0-9_]+)/g;

function testFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    if (name === "node_modules" || name === "dist") return [];
    const full = `${dir}${name}`;
    if (statSync(full).isDirectory()) return testFiles(`${full}/`);
    // Сам этот файл не сканируется: его описание меток не должно считаться меткой.
    return name.endsWith(".test.ts") && name !== "registry.test.ts" ? [full] : [];
  });
}

/** Имя питон-теста → файлы, в которых стоит его метка. */
function tags(): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const file of testFiles(WEB)) {
    for (const m of readFileSync(file, "utf-8").matchAll(TAG)) {
      out.set(m[1], [...(out.get(m[1]) ?? []), file.slice(WEB.length)]);
    }
  }
  return out;
}

/** Тесты, которые питон содержит прямо сейчас. */
function livePythonTests(): string[] {
  return readdirSync(PYTHON_TESTS)
    .filter((f) => /^test_.*\.py$/.test(f))
    .sort()
    .flatMap((f) => [...readFileSync(PYTHON_TESTS + f, "utf-8").matchAll(/^def (test_\w+)\(/gm)]
      .map((m) => `${f.slice(0, -".py".length)}::${m[1]}`));
}

describe("реестр питон-тестов", () => {
  it("заморожен целиком: 301 запись, и число в файле то же", () => {
    expect(entries).toHaveLength(FROZEN_COUNT);
    expect(registry.count).toBe(FROZEN_COUNT);
  });

  // Пропуск здесь виден в отчёте, а не молчит: после удаления питона сверять
  // реестр больше не с чем, и это честное состояние, а не дыра.
  it.runIf(pythonAlive)("пока питон цел, реестр называет ровно его тесты", () => {
    const live = livePythonTests();
    const listed = entries.map(([name]) => name);
    expect(live.filter((n) => !registry.tests[n]), "тест появился после заморозки")
      .toEqual([]);
    expect(listed.filter((n) => !live.includes(n)), "тест пропал из питона")
      .toEqual([]);
  });

  it("у каждой записи понятный статус", () => {
    const odd = entries.filter(([, e]) => !["pending", "ported", "dropped"].includes(e.status));
    expect(odd.map(([n, e]) => `${n}: ${e.status}`)).toEqual([]);
  });

  it("снятый тест назван с причиной", () => {
    const silent = entries.filter(([, e]) => e.status === "dropped" && !(e.reason ?? "").trim());
    expect(silent.map(([n]) => n)).toEqual([]);
  });

  it("перенесённый тест находится по метке", () => {
    const found = tags();
    const lost = entries.filter(([n, e]) => e.status === "ported" && !found.has(n));
    expect(lost.map(([n]) => n), "запись «перенесён», а метки нет ни в одном тесте")
      .toEqual([]);
  });

  it("каждая метка ведёт к записи реестра, отмеченной перенесённой", () => {
    const wrong = [...tags()]
      .filter(([n]) => registry.tests[n]?.status !== "ported")
      .map(([n, files]) => `${n} (${files.join(", ")}): ${registry.tests[n]?.status ?? "нет в реестре"}`);
    expect(wrong).toEqual([]);
  });

  it.runIf(!pythonAlive)("питон удалён — нерешённых записей не осталось", () => {
    const pending = entries.filter(([, e]) => e.status === "pending").map(([n]) => n);
    expect(pending, "питон удалён раньше, чем решена судьба его тестов").toEqual([]);
  });
});
