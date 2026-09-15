import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merge conditional class names and de-duplicate conflicting Tailwind
 * utilities (later wins). The standard shadcn `cn` helper.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/**
 * Shared tactile-press feedback for tappable chips/rows/nav items (anything
 * that isn't already the Button component, which bakes this in itself). A
 * quick scale-down on `:active` is what makes taps register as instant on a
 * touchscreen instead of feeling like the app "ate" the tap — the single
 * cheapest fix for a PWA that otherwise only shows a slow color fade.
 */
export const TAP_SCALE =
  "transition-transform active:scale-[0.97] motion-reduce:transition-none motion-reduce:active:scale-100";

/**
 * Round a number to `decimals` places (default 0) using half-up rounding.
 */
export function roundTo(value: number, decimals = 0): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/**
 * Format a load (or any numeric figure) for display next to its unit.
 * Returns an em dash for null/undefined/NaN so empty readouts stay aligned.
 * Trailing ".0" is dropped so whole numbers read cleanly.
 */
export function formatLoad(
  n: number | null | undefined,
  unit: string = "lb",
): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  const rounded = roundTo(n, 1);
  const text = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  return `${text} ${unit}`;
}
