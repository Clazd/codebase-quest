import type { Address, Order } from "../types";

const SEPARATOR = "\n";
const EXPRESS_PREFIX = "[EXPRESS] ";
const EMPTY = "";

/** Builds the text printed on a shipping label. */
export function shippingLabel(order: Order, address: Address): string {
  let label = address.name;
  if (address.country) {
    if (address.region) {
      for (const line of address.lines) {
        if (line.trim() !== EMPTY) {
          if (order.express) {
            label += `${SEPARATOR}${EXPRESS_PREFIX}${line}`;
          } else {
            label += `${SEPARATOR}${line}`;
          }
        }
      }
    }
  }
  return label;
}
