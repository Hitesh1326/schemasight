import type { SchemaChunk } from "../../shared/types";

/**
 * Returns the fully qualified name for a chunk (Schema.ObjectName).
 * @param c - Schema chunk.
 * @returns Qualified name (e.g. "dbo.MyTable").
 */
export const FULL_NAME = (c: SchemaChunk): string =>
  c.objectName.includes(".") ? c.objectName : `${c.schema}.${c.objectName}`;

const MAX_REFERRED_OBJECTS = 3;

/**
 * Extracts a database object name from the user message (qualified or bare, e.g. "dbo.MyTable" or "MyTable").
 * Used with findByName when no referred chunk was found in context.
 * @param message - User message text.
 * @returns First matching object name or undefined.
 */
export function extractObjectNameFromMessage(message: string): string | undefined {
  const qualified = /[a-zA-Z_][a-zA-Z0-9_]*\.[a-zA-Z_][a-zA-Z0-9_]*/g.exec(message);
  if (qualified) return qualified[0];
  const tableOrView =
    /(?:^|\s)([a-zA-Z_][a-zA-Z0-9_]*)\s+table\b/i.exec(message) ||
    /\btable\s+([a-zA-Z_][a-zA-Z0-9_]*)/i.exec(message) ||
    /(?:^|\s)([a-zA-Z_][a-zA-Z0-9_]*)\s+view\b/i.exec(message) ||
    /\bview\s+([a-zA-Z_][a-zA-Z0-9_]*)/i.exec(message);
  if (tableOrView) return tableOrView[1];
  const bare = /\b([a-zA-Z_][a-zA-Z0-9_]{2,})\b/g.exec(message);
  return bare ? bare[1] : undefined;
}

/**
 * Extracts qualified object names (SchemaName.ObjectName) from text (e.g. assistant reply), last occurrence first, deduplicated.
 * Used when the user asks for "the code" of "that" but the object was not in the retrieved chunks.
 * @param text - Text to scan (e.g. last assistant message).
 * @returns Array of unique qualified names, order by last occurrence.
 */
export function extractObjectNamesFromText(text: string): string[] {
  const qualified = text.match(/[a-zA-Z_][a-zA-Z0-9_]*\.[a-zA-Z_][a-zA-Z0-9_]*/g) ?? [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (let i = qualified.length - 1; i >= 0; i--) {
    const n = qualified[i]!;
    if (!seen.has(n)) {
      seen.add(n);
      out.push(n);
    }
  }
  return out.reverse();
}

/**
 * Finds chunks mentioned in the text, ordered by last occurrence (most recently discussed first).
 * @param chunks - Candidate chunks.
 * @param text - Text to search for chunk names (e.g. assistant reply).
 * @returns At most MAX_REFERRED_OBJECTS chunks, ordered by last mention.
 */
export function findReferredChunks(chunks: SchemaChunk[], text: string): SchemaChunk[] {
  const withPosition = (c: SchemaChunk): { chunk: SchemaChunk; pos: number } => {
    const full = FULL_NAME(c);
    const posFull = text.includes(full) ? text.lastIndexOf(full) : -1;
    const posObj = text.includes(c.objectName) ? text.lastIndexOf(c.objectName) : -1;
    const bare = c.objectName.split(".").slice(-1)[0] ?? "";
    const posBare = bare.length > 4 && text.includes(bare) ? text.lastIndexOf(bare) : -1;
    const pos = Math.max(posFull, posObj, posBare);
    return { chunk: c, pos };
  };
  const matched = chunks
    .map(withPosition)
    .filter((p) => p.pos >= 0)
    .sort((a, b) => b.pos - a.pos);
  const seen = new Set<string>();
  const out: SchemaChunk[] = [];
  for (const { chunk } of matched) {
    if (seen.has(chunk.id)) continue;
    seen.add(chunk.id);
    out.push(chunk);
    if (out.length >= MAX_REFERRED_OBJECTS) break;
  }
  return out;
}

/** Words ignored when matching user message to chunk (noise for "explain X" queries). */
const DETAIL_REQUEST_STOP_WORDS = new Set([
  "a", "an", "the", "can", "you", "explain", "it", "that", "this", "in", "more", "detail",
  "store", "stored", "proc", "procedure", "please", "me", "to", "for", "and", "or",
]);

/**
 * Finds the chunk that best matches the user message (by object name and summary token overlap).
 * @param chunks - Candidate chunks.
 * @param userMessage - User message (stop words removed, tokenized).
 * @returns Best-matching chunk or undefined.
 */
export function findChunkMatchingUserMessage(
  chunks: SchemaChunk[],
  userMessage: string
): SchemaChunk | undefined {
  const tokens = userMessage
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1 && !DETAIL_REQUEST_STOP_WORDS.has(w));
  if (tokens.length === 0) return undefined;
  const searchText = (c: SchemaChunk) => `${c.schema}.${c.objectName} ${c.summary}`.toLowerCase();
  let best: SchemaChunk | undefined;
  let bestScore = 0;
  for (const c of chunks) {
    const text = searchText(c);
    const score = tokens.filter((t) => text.includes(t)).length;
    if (score > bestScore && score >= Math.min(2, tokens.length)) {
      bestScore = score;
      best = c;
    }
  }
  return best;
}
