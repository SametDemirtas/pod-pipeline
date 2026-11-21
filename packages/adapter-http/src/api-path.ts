/** Values that, even encoded, name no segment of their own or step out of the path. */
const NO_SEGMENT: ReadonlySet<string> = new Set(['', '.', '..']);

/** A value as one encoded path segment; refuses one that is no segment of its own. */
function segment(value: string | number | undefined): string {
  const text = String(value ?? '');
  if (NO_SEGMENT.has(text)) throw new RangeError(`"${text}" cannot be a path segment`);
  return encodeURIComponent(text);
}

/**
 * A URL path with every interpolated value encoded as one segment, so an id
 * holding `/` or `?`, or being `..`, can never point the request somewhere else.
 */
export function apiPath(
  parts: TemplateStringsArray,
  ...values: readonly (string | number)[]
): string {
  return parts.reduce(
    (path, part, index) => (index === 0 ? part : `${path}${segment(values[index - 1])}${part}`),
    '',
  );
}
