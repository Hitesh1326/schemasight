import type { ChatMessage } from "../../shared/types";

/** Fraction of context limit (0–1) above which we consider summarizing conversation history. */
export const CONTEXT_THRESHOLD = 0.9;
/** Number of most recent messages to keep when creating the first conversation summary. */
export const FIRST_SUMMARY_LAST_N = 10;
/** Number of most recent messages to keep when re-summarizing (merging with existing summary). */
export const RE_SUMMARY_LAST_N = 5;

/**
 * Rough token count for a string (chars/4). Used for context budget checks.
 * @param text - Input text.
 * @returns Estimated token count.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Sum of estimated tokens for all message contents in a chat history.
 * @param messages - Chat messages (role + content).
 * @returns Total estimated tokens.
 */
export function estimateHistoryTokens(messages: ChatMessage[]): number {
  return messages.reduce((acc, m) => acc + estimateTokens(m.content), 0);
}
