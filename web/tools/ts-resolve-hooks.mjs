// The resolution hook: a relative import without an extension is tried first as
// `.ts`, and only then as it is. Nothing more: no directory search, no `index`
// substitution, no rules of its own.

const RELATIVE = /^\.{1,2}\//;
const HAS_EXTENSION = /\.[cm]?[jt]sx?$/;

export async function resolve(specifier, context, next) {
  if (RELATIVE.test(specifier) && !HAS_EXTENSION.test(specifier)) {
    try {
      return await next(specifier + ".ts", context);
    } catch {
      // Not found — let Node decide, and say so in its own words.
    }
  }
  return next(specifier, context);
}
