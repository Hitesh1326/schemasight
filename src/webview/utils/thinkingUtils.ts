import type { ChatThinking, ChatThinkingStep } from "../../shared/types";

/** Order of steps shown in the thinking block. */
export const STEPS_ORDER: ChatThinkingStep[] = ["embedding", "searching", "context", "generating"];

/** Human-readable label per thinking step (short, outcome-focused). */
export const STEP_LABELS: Record<ChatThinkingStep, string> = {
  embedding: "Understanding your question",
  searching: "Searching schema",
  context: "Preparing context",
  generating: "Writing answer",
};

/** Singular/plural labels for object types (used in context summary). */
const TYPE_LABELS: Record<string, { singular: string; plural: string }> = {
  table: { singular: "table", plural: "tables" },
  view: { singular: "view", plural: "views" },
  stored_procedure: { singular: "stored procedure", plural: "stored procedures" },
  function: { singular: "function", plural: "functions" },
  column: { singular: "column", plural: "columns" },
};

/** Formats a count with the correct singular/plural (e.g. "1 table", "2 views"). */
export function formatTypeCount(type: string, n: number): string {
  const labels = TYPE_LABELS[type];
  const label = labels ? (n === 1 ? labels.singular : labels.plural) : type;
  return `${n} ${label}`;
}

/** Format token count for display (e.g. 4300 → "4.3k"). */
export function formatTokenCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

/** Returns the detail line for a step given the thinking payload and optional streamed chunk count. */
export function stepDetailText(
  step: ChatThinkingStep,
  thinking: ChatThinking,
  streamedChunkCount = 0
): string | null {
  const ctx = thinking.context;
  const typeBreakdown =
    ctx && Object.keys(ctx.byType).length > 0
      ? Object.entries(ctx.byType)
          .map(([type, n]) => formatTypeCount(type, n))
          .join(", ")
      : null;

  switch (step) {
    case "embedding":
      return "Turned your question into a search query.";
    case "searching": {
      if (!ctx) return null;
      const time = ctx.searchMs != null ? ` in ${(ctx.searchMs / 1000).toFixed(2)}s` : "";
      return `Retrieved ${ctx.chunksUsed} relevant objects${time}.`;
    }
    case "context": {
      if (!ctx) return null;
      const typeList = typeBreakdown ? ` (${typeBreakdown})` : "";
      const tokens =
        ctx.contextTokens != null
          ? ` ~${(ctx.contextTokens / 1000).toFixed(1)}k tokens in context.`
          : ".";
      const inIndex = ctx.totalInIndex != null ? ` (${ctx.totalInIndex} in index)` : "";
      return `Using ${ctx.chunksUsed} relevant schema objects for this answer${inIndex}${typeList}.${tokens}`;
    }
    case "generating":
      if (streamedChunkCount > 0) {
        return `… ${streamedChunkCount} tokens so far.`;
      }
      return null;
    default:
      return null;
  }
}
