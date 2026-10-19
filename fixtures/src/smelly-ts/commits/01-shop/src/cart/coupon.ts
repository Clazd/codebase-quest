const PERCENT = 100;

/** Takes `percentOff` percent off `total` (in cents), rounding the discount down. */
export function applyCoupon(total: number, percentOff: number): number {
  const cut = Math.floor((total * percentOff) / PERCENT);
  return total - cut;
}
