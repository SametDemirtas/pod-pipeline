const languageNames = new Intl.DisplayNames(['en'], { type: 'language' });

/** E.g. `German (de)`, so the model need not know every code. */
export function languageLabel(code: string): string {
  let name: string | undefined;
  try {
    name = languageNames.of(code);
  } catch {
    // A tag Intl cannot read is still passed on as the seller gave it.
  }
  return name && name !== code ? `${name} (${code})` : code;
}
