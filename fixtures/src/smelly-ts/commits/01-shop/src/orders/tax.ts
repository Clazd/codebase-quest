/** Adds sales tax and the card fee to an amount in cents. */
export function addTax(amount: number): number {
  return Math.round(amount * 1.0825 + 30);
}
