const BYTE_UNITS = ['B', 'KB', 'MB', 'GB'] as const;

export function formatBytes(bytes: number, locale: string): string {
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < BYTE_UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const digits = unit === 0 || value >= 100 ? 0 : 1;
  const number = new Intl.NumberFormat(locale, { maximumFractionDigits: digits }).format(value);
  return `${number} ${BYTE_UNITS[unit] ?? 'B'}`;
}

export function formatDate(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(iso));
}

/**
 * A wait rounded up: in whole seconds, in whole minutes from one minute on,
 * and in hours to a tenth from one hour on.
 */
export function formatWait(seconds: number, locale: string): string {
  const whole = Math.ceil(seconds);
  const [amount, unit] =
    whole < 60
      ? [whole, 'second']
      : whole < 3600
        ? [Math.ceil(whole / 60), 'minute']
        : [Math.ceil(whole / 360) / 10, 'hour'];
  return new Intl.NumberFormat(locale, {
    style: 'unit',
    unit,
    unitDisplay: 'long',
    maximumFractionDigits: 1,
  }).format(amount);
}

/** Items joined the way the language lists them, e.g. `A, B, and C`, or `A, B, or C` for a choice. */
export function formatList(
  items: readonly string[],
  locale: string,
  type: 'conjunction' | 'disjunction' = 'conjunction',
): string {
  return new Intl.ListFormat(locale, { type }).format(items);
}

export function formatPixels(width: number, height: number, locale: string): string {
  const number = new Intl.NumberFormat(locale);
  return `${number.format(width)} × ${number.format(height)} px`;
}

/** A share between 0 and 1 as a whole percentage, e.g. `9 %` or `%9` depending on the language. */
function formatPercent(share: number, locale: string): string {
  return new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 0 }).format(
    share,
  );
}

/** Like `formatPercent`, but never rounds a small share to 0 % or a near-total one to 100 %. */
export function formatShare(share: number, locale: string): string {
  if (share > 0 && share < 0.01) return `<${formatPercent(0.01, locale)}`;
  if (share > 0.99 && share < 1) return `>${formatPercent(0.99, locale)}`;
  return formatPercent(share, locale);
}

const CURRENCY_CODES = new Set(Intl.supportedValuesOf('currency'));

/** An amount in its currency; a currency the browser does not know is written after the number. */
export function formatMoney(amount: number, currency: string, locale: string): string {
  if (CURRENCY_CODES.has(currency)) {
    return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(amount);
  }
  const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(amount);
  return `${number} ${currency}`;
}
