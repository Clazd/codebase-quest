const CENTS_PER_UNIT = 100;
const FRACTION_DIGITS = 2;
const ZERO = "0";
const NEGATIVE_SIGN = "-";
const NO_SIGN = "";
const LOCALE = "en-US";

/** Formats cents as money, e.g. 123456 and "$" give "$1,234.56". */
export function formatMoney(cents: number, currency: string): string {
  const sign = cents < 0 ? NEGATIVE_SIGN : NO_SIGN;
  const absolute = Math.abs(cents);
  const whole = Math.floor(absolute / CENTS_PER_UNIT);
  const fraction = String(absolute % CENTS_PER_UNIT).padStart(FRACTION_DIGITS, ZERO);
  const grouped = whole.toLocaleString(LOCALE);
  return `${sign}${currency}${grouped}.${fraction}`;
}
