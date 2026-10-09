/** A single interactive budget, carried across import and product retrieval. */
export const INTERACTIVE_DEADLINE_MS = 30_000;
export const SHOPPING_RESERVE_MS = 9_000;
export function deadlineFromInput(value: unknown, now: number): number | null {
  if (value === undefined) return now + INTERACTIVE_DEADLINE_MS;
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) return null;
  return Math.min(value, now + INTERACTIVE_DEADLINE_MS);
}
export function remainingBudgetFromInput(value: unknown): number | null {
  if (value === undefined) return INTERACTIVE_DEADLINE_MS;
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= INTERACTIVE_DEADLINE_MS ? value : null;
}
