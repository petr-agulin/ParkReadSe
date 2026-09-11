// Проверка схемы — своя, а не библиотекой (решение 124).
//
// Схема продукта использует десять ключевых слов и ни одного комбинатора: `type`,
// `required`, `properties`, `additionalProperties`, `enum`, `const`, `minimum`,
// `maximum`, `pattern`, `maxLength`, `minItems` и `$ref` внутрь `$defs`. Это
// закрытый набор, и сотня строк здесь заменяет зависимость в тридцать килобайт,
// которая закрыла бы восемь строк склейки.
//
// **Условие, на котором это решение стоит:** мутационный тест. Каждая фикстура
// ломается нарочно — убирается обязательное поле, портится `enum`, меняется тип, —
// и отбраковка обязана совпасть с `jsonschema` питона, пока тот жив.
//
// **Когда переходить на библиотеку:** появится в схеме комбинатор (`oneOf`,
// `if/then`, `patternProperties`) — брать `ajv`, скомпилированный на сборке.
// Своя проверка на комбинаторах начинает врать, и чинить это не стоит
// сэкономленных килобайтов.

export type Schema = Record<string, any>;

/** Ошибка проверки: путь до места и что с ним не так. Форма та же, что у питона
 *  (`path: message`), чтобы одно и то же место читалось одинаково с обеих сторон. */
export type SchemaError = string;

const typeOf = (value: unknown): string => {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (Number.isInteger(value)) return "integer";
  return typeof value;                    // string | number | boolean | object
};

function matchesType(value: unknown, want: string | string[]): boolean {
  const wants = Array.isArray(want) ? want : [want];
  const actual = typeOf(value);
  return wants.some((w) => {
    if (w === "number") return actual === "number" || actual === "integer";
    if (w === "integer") return actual === "integer";
    return actual === w;
  });
}

function resolve(schema: Schema, root: Schema): Schema {
  if (!schema || typeof schema.$ref !== "string") return schema;
  // Ссылки только внутрь `$defs` собственного файла — других в схеме нет.
  const path = schema.$ref.replace(/^#\//, "").split("/");
  let node: any = root;
  for (const part of path) node = node?.[part];
  return node ?? {};
}

function where(path: string[]): string {
  return path.length ? path.join("/") : "<корень>";
}

/** Все ошибки документа против схемы, в порядке пути — как их сортирует питон. */
export function validate(doc: unknown, schema: Schema, root: Schema = schema,
                         path: string[] = []): SchemaError[] {
  const node = resolve(schema, root);
  const out: SchemaError[] = [];
  if (!node || typeof node !== "object") return out;

  if (node.type && !matchesType(doc, node.type)) {
    const want = Array.isArray(node.type) ? node.type.join(" or ") : node.type;
    return [`${where(path)}: ${JSON.stringify(doc)} is not of type '${want}'`];
  }

  if (node.enum && !node.enum.some((v: unknown) => deepEqual(v, doc))) {
    out.push(`${where(path)}: ${JSON.stringify(doc)} is not one of ${JSON.stringify(node.enum)}`);
  }
  if ("const" in node && !deepEqual(node.const, doc)) {
    out.push(`${where(path)}: ${JSON.stringify(doc)} was expected to be ${JSON.stringify(node.const)}`);
  }

  if (typeof doc === "number") {
    if (typeof node.minimum === "number" && doc < node.minimum) {
      out.push(`${where(path)}: ${doc} is less than the minimum of ${node.minimum}`);
    }
    if (typeof node.maximum === "number" && doc > node.maximum) {
      out.push(`${where(path)}: ${doc} is greater than the maximum of ${node.maximum}`);
    }
  }

  if (typeof doc === "string") {
    if (typeof node.maxLength === "number" && doc.length > node.maxLength) {
      out.push(`${where(path)}: ${JSON.stringify(doc)} is longer than ${node.maxLength}`);
    }
    if (typeof node.pattern === "string" && !new RegExp(node.pattern).test(doc)) {
      out.push(`${where(path)}: ${JSON.stringify(doc)} does not match '${node.pattern}'`);
    }
  }

  if (Array.isArray(doc)) {
    if (typeof node.minItems === "number" && doc.length < node.minItems) {
      out.push(`${where(path)}: ${JSON.stringify(doc)} is too short`);
    }
    if (node.items) {
      doc.forEach((item, i) => {
        out.push(...validate(item, node.items, root, [...path, String(i)]));
      });
    }
  }

  if (doc && typeof doc === "object" && !Array.isArray(doc)) {
    const obj = doc as Record<string, unknown>;
    for (const key of node.required ?? []) {
      if (!(key in obj)) out.push(`${where(path)}: '${key}' is a required property`);
    }
    const props: Record<string, Schema> = node.properties ?? {};
    for (const [key, value] of Object.entries(obj)) {
      if (key in props) {
        out.push(...validate(value, props[key], root, [...path, key]));
      } else if (node.additionalProperties === false) {
        out.push(`${where(path)}: additional property '${key}' is not allowed`);
      }
    }
  }

  return out;
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((x, i) => deepEqual(x, b[i]));
  }
  if (typeof a === "object" && typeof b === "object") {
    const ka = Object.keys(a as object);
    const kb = Object.keys(b as object);
    return ka.length === kb.length
      && ka.every((k) => deepEqual((a as any)[k], (b as any)[k]));
  }
  return false;
}

/** Проходит ли документ схему. Ошибки нужны для разбора полётов, а решение —
 *  одно: годен или нет. */
export function valid(doc: unknown, schema: Schema): boolean {
  return validate(doc, schema).length === 0;
}
