/**
 * Query classification utilities for RAG: broad schema queries, detail requests, and SQL-like strings.
 * Used to decide retrieval strategy (full schema vs semantic search) and to reject rewritten queries that look like SQL.
 */

/**
 * Whether the user is asking for a full list or count of schema objects (requires full schema, not top-k).
 * @param message - User message.
 * @returns True if the message matches patterns like "list all tables", "how many procedures", etc.
 */
export function isBroadSchemaQuery(message: string): boolean {
  const lower = message.toLowerCase().trim();
  return (
    /\b(list|count|how\s+many|what\s+are|every|all)\s+(the\s+)?(tables?|views?|stored\s+procedures?|procedures?|functions?)/i.test(
      lower
    ) ||
    /(tables?|views?|stored\s+procedures?|procedures?|functions?)\s+(in\s+(the\s+)?database|in\s+total)/i.test(
      lower
    ) ||
    /^(tables?|views?|list|count)\s*[?.]?$/i.test(lower) ||
    /\b(show|give|display|get)\s+(me\s+)?(all\s+)?(the\s+)?(tables?|views?|stored\s+procedures?|functions?)/i.test(
      lower
    ) ||
    /\bwhat\s+(tables?|views?|stored\s+procedures?|functions?)\s+(do\s+we\s+have|exist|are\s+there)/i.test(
      lower
    ) ||
    /\bwhat\s+schemas?\s+(exist|are\s+(there|in|available)|does\s+this\s+database\s+have)/i.test(lower) ||
    /\blist\s+(all\s+)?schemas?\b/i.test(lower)
  );
}

/**
 * Whether the user is asking for more detail about a specific schema object (e.g. "explain that", "show the definition").
 * @param message - User message.
 * @returns True if the message matches detail-request patterns.
 */
export function isDetailRequest(message: string): boolean {
  const lower = message.toLowerCase().trim();
  return (
    /\bexplain\s+(it|that|this)\s+(in\s+)?detail\b/i.test(lower) ||
    /\bexplain\s+(in\s+)?detail\b/i.test(lower) ||
    /\bcan you explain\b/i.test(lower) ||
    /\bhow does it work\b/i.test(lower) ||
    /\btell me more\b/i.test(lower) ||
    /\bshow\s+(me\s+)?(the\s+)?(full\s+)?(schema|columns?|definition|code)\b/i.test(lower) ||
    /\bwhat\s+columns?\s+(does|do)\b/i.test(lower) ||
    /\bfull\s+definition\b/i.test(lower)
  );
}

/**
 * Whether the text looks like SQL (e.g. rewriter hallucination); such output must not be used as a search query.
 * @param text - Candidate search query string.
 * @returns True if the text appears to be SQL (e.g. starts with SELECT, has FROM/WHERE).
 */
export function looksLikeSql(text: string): boolean {
  const t = text.trim();
  if (t.length < 10) return false;
  const upper = t.toUpperCase();
  if (/^(SELECT|INSERT|UPDATE|DELETE|WITH|CREATE|ALTER|DROP|EXEC|EXECUTE)\b/.test(upper)) return true;
  if (/\bFROM\s+\w/.test(upper) && /\bWHERE\b/.test(upper)) return true;
  return false;
}
