/** An array of strings, as models send lists in their answers. */
export function isTextList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}
