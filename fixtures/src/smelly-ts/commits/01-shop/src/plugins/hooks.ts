import type { Order } from "../types";

type Hook = (order: Order) => void;

const LEGACY_NOTE = "checked out with the legacy flow";
const registry: Record<string, Hook> = {};

/** Hooks can be enabled by name from the shop's config file. */
export const BUILT_IN_HOOKS = ["onLegacyCheckout"];

export function registerHook(name: string, hook: Hook): void {
  registry[name] = hook;
}

/** Runs the hook registered under `name`, if any. */
export function runHook(name: string, order: Order): void {
  const hook = registry[name];
  if (hook) hook(order);
}

function onLegacyCheckout(order: Order): void {
  order.notes.push(LEGACY_NOTE);
}
