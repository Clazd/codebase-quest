const CENTS_PER_UNIT = 100;
const FRACTION_DIGITS = 2;
const ZERO = "0";
const NEGATIVE_SIGN = "-";
const NO_SIGN = "";
const LOCALE = "en-US";

/** Formats a price in cents for product pages. */
export function formatPrice(cents: number, currency: string): string {
  const sign = cents < 0 ? NEGATIVE_SIGN : NO_SIGN;
  const absolute = Math.abs(cents);
  const whole = Math.round(absolute / CENTS_PER_UNIT);
  const fraction = String(absolute % CENTS_PER_UNIT).padStart(FRACTION_DIGITS, ZERO);
  const grouped = whole.toLocaleString(LOCALE);
  return `${sign}${currency}${grouped}.${fraction}`;
}
