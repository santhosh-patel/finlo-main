export type ExpenseReaction = { user_id: string; emoji: string };

/** Normalize reactions from JSONB (array or legacy object) to a stable array. */
export function normalizeReactions(raw: unknown): ExpenseReaction[] {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw.filter(
      (r): r is ExpenseReaction =>
        !!r &&
        typeof r === "object" &&
        typeof (r as ExpenseReaction).user_id === "string" &&
        typeof (r as ExpenseReaction).emoji === "string",
    );
  }
  return [];
}
