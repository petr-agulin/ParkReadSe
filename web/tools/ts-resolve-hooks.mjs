// Крючок разрешения: относительный импорт без расширения сначала пробуется как
// `.ts`, и только потом — как есть. Больше ничего: ни поиска по каталогам,
// ни подстановки `index`, ни своих правил.

const RELATIVE = /^\.{1,2}\//;
const HAS_EXTENSION = /\.[cm]?[jt]sx?$/;

export async function resolve(specifier, context, next) {
  if (RELATIVE.test(specifier) && !HAS_EXTENSION.test(specifier)) {
    try {
      return await next(specifier + ".ts", context);
    } catch {
      // Не нашлось — пусть решает Node и говорит своими словами.
    }
  }
  return next(specifier, context);
}
