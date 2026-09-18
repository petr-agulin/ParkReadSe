// The checking of the schema — our own, and not by a library (decision 124).
//
// The product's schema uses a closed set of keywords and not one combinator: `type`,
// `required`, `properties`, `additionalProperties`, `enum`, `const`, `minimum`,
// `maximum`, `pattern`, `maxLength`, `minItems`, and `$ref` into `$defs`. A hundred
// lines here replace a dependency of thirty kilobytes that would have covered eight
// lines of joining.
//
// **The condition this decision stands on:** the mutation test. Every fixture is
// broken on purpose — a required field taken away, an `enum` spoiled, a type changed
// — and the rejection must agree with an independent judge. That judge is `ajv`, kept
// to the tests alone (decision 138), so the page never carries it.
//
// **When to move to a library:** as soon as a combinator appears in the schema
// (`oneOf`, `if/then`, `patternProperties`) — take `ajv`, compiled at build time. Our
// own check begins to lie on combinators, and mending that is not worth the kilobytes
// it saves.

export type Schema = Record<string, any>;

/** An error of the check: the path to the place, and what is wrong with it. The form
 *  (`path: message`) is the one the Python side used, so the saved reference answers
 *  still read the same way. */
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
  // References only into the `$defs` of the file itself — the schema has no others.
  const path = schema.$ref.replace(/^#\//, "").split("/");
  let node: any = root;
  for (const part of path) node = node?.[part];
  return node ?? {};
}

function where(path: string[]): string {
  return path.length ? path.join("/") : "<root>";
}

/** Every error of a document against the schema, in order of path — the order the
 *  saved reference answers were written in. */
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

/** Whether a document passes the schema. The errors are for the post-mortem, while
 *  the decision is a single one: fit or not. */
export function valid(doc: unknown, schema: Schema): boolean {
  return validate(doc, schema).length === 0;
}
