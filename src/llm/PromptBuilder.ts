import { SchemaChunk, ChatMessage } from "../shared/types";

export const SUMMARIZE_SYSTEM = `Summarize the following database schema or stored procedure text in 1-3 concise sentences suitable for semantic search. Output only the summary, no preamble.`;

export const QUERY_REWRITE_SYSTEM = `You are a query rewriter for semantic search over database schema (object names and summaries). Given a conversation and the latest user message, output a single standalone search query: short natural language or keywords that describe what to look for in the schema. Resolve references like "it", "that", "the procedure" using the conversation. The query is used to find relevant tables, views, procedures, and functions—do NOT output SQL or code. Output only the search query, one line, no preamble or explanation.`;

export const CONVERSATION_SUMMARY_SYSTEM = `Summarize this conversation in 1-2 short paragraphs. Preserve database object names (tables, procedures, functions, views), key facts the user asked about, and any references the assistant made. The summary will be used as context so later messages can still refer to earlier topics. Output only the summary, no preamble.`;

/**
 * Builds structured prompts for summarization, query rewriting, and RAG chat.
 */
export class PromptBuilder {
  /**
   * Formats schema object content for the summarization model.
   * Prefixes with type and name so the model knows what it is summarizing.
   * @param objectType E.g. "table", "view", "stored_procedure", "function".
   * @param objectName Schema-qualified or simple object name.
   * @param content Raw schema or procedure text.
   * @returns A single string prompt for the summarizer.
   */
  buildSummarizationPrompt(objectType: string, objectName: string, content: string): string {
    return `[${objectType}] ${objectName}\n\n${content}`;
  }

  /**
   * Builds the prompt for summarizing older conversation turns. Preserves entity names and references.
   */
  buildConversationSummaryPrompt(messages: ChatMessage[]): string {
    const lines = messages.map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`);
    return lines.join("\n\n");
  }

  /**
   * Builds the prompt for rewriting a follow-up message into a standalone search query
   * so retrieval stays focused on what the user is asking about (e.g. "it" → GetSupplierUpdates).
   * @param history Previous chat messages (user and assistant).
   * @param currentMessage Latest user message.
   * @returns A single string prompt for the query-rewrite model.
   */
  buildQueryRewritePrompt(history: ChatMessage[], currentMessage: string): string {
    const lines: string[] = [];
    for (const m of history) {
      lines.push(`${m.role === "user" ? "User" : "Assistant"}: ${m.content}`);
    }
    lines.push(`User: ${currentMessage}`);
    lines.push("");
    lines.push(
      "Output a single standalone search query (natural language or keywords) that captures what the user is asking, including what \"it\" or \"that\" refers to. This query will search schema object names and summaries—do not output SQL or code. Output only the search query, one line, no explanation."
    );
    return lines.join("\n");
  }

  /**
   * Builds the system prompt for RAG chat: instructs the model to answer using only
   * the provided schema context (object type, name, and summary per chunk).
   * When the user asked for more detail about a specific object, pass referredObjectFullContent
   * to include that object's full definition so the model can explain it accurately.
   * @param chunks Retrieved schema chunks (tables, views, procedures, functions).
   * @param databaseName Display name of the database (e.g. for the intro line).
   * @param referredObjectFullContent Optional: when user asked for detail, the full definition for the referred object (heading + content).
   * @returns The full system prompt string to pass to the chat API.
   */
  buildRagSystemPrompt(
    chunks: SchemaChunk[],
    databaseName: string,
    referredObjectFullContent?: { heading: string; content: string }[],
    userMessage?: string
  ): string {
    if (referredObjectFullContent && referredObjectFullContent.length > 0) {
      return this.buildDetailPrompt(databaseName, referredObjectFullContent, userMessage ?? "");
    }
    return this.buildContextPrompt(databaseName, chunks);
  }

  private buildDetailPrompt(
    databaseName: string,
    objects: { heading: string; content: string }[],
    userQuestion: string
  ): string {
    const closing =
      userQuestion.trim().length > 0
        ? `The user's question: ${userQuestion.trim()}\n\nAnswer the user's question above based only on the code for each object.`
        : objects.length === 1
          ? "Explain the object above in detail. Base every part of your answer on the code only."
          : "Explain each object above based only on its code.";
    const intro = [
      `You are a helpful assistant for the database "${databaseName}". The user asked about ${objects.length === 1 ? "a database object" : "database objects"}.`,
      ``,
      `Your answer must be based ONLY on the exact code below. Do not use general knowledge about SQL Server, in-memory, or similar features. If the code does not mention something (e.g. parameters, a step, or a command), do not mention it. Describe only what the code actually does.`,
    ].join("\n\n");
    const blocks = objects.map(
      (obj, i) =>
        `## Object ${i + 1}\n\n${obj.heading}\n\n${obj.content.trim()}`
    );
    return `${intro}\n\n${blocks.join("\n\n---\n\n")}\n\n${closing}`;
  }

  private buildContextPrompt(databaseName: string, chunks: SchemaChunk[]): string {
    const intro = [
      `You are a helpful assistant for the database "${databaseName}".`,
      `Answer questions about the schema and business logic using only the retrieved context below.`,
      `The index contains tables, views, stored procedures, and functions.`,
      `For high-level questions (e.g. "what is this database about?"), infer the domain or purpose from the object names and summaries in the context and give a short summary.`,
      `Only state that a procedure, table, view, or function exists if it appears as a heading in the context (e.g. [stored_procedure] Schema.Name). Do not infer existence just because a name is mentioned inside another object's code.`,
      `If the answer is not in the context, say so. Be concise.`,
    ].join(" ");

    if (chunks.length === 0) {
      return `${intro}\n\nNo schema context was retrieved for this query. You have NO schema information. Do not invent or guess columns, tables, or schema. Reply only that you do not have that information and suggest the user rephrase or specify the object name (e.g. Application.Cities).`;
    }

    const fullSchemaThreshold = 40;
    if (chunks.length >= fullSchemaThreshold) {
      const byType: Record<string, string[]> = {};
      const typeLabels: Record<SchemaChunk["objectType"], string> = {
        table: "Tables",
        view: "Views",
        stored_procedure: "Stored procedures",
        function: "Functions",
        column: "Columns",
      };
      for (const c of chunks) {
        const label = typeLabels[c.objectType] ?? c.objectType;
        if (!byType[label]) byType[label] = [];
        byType[label].push(c.objectName);
      }
      const sections = Object.entries(byType)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([label, names]) => `**${label}:** ${names.join(", ")}`);
      return `${intro}\n\n## Retrieved context\n\n${sections.join("\n\n")}`;
    }

    const blocks = chunks.map((c) => {
      const heading = `[${c.objectType}] ${c.objectName}`;
      const body = c.summary?.trim() || c.content.slice(0, 300).trim() + (c.content.length > 300 ? "…" : "");
      return `${heading}\n${body}`;
    });

    return `${intro}\n\n## Retrieved context\n\n${blocks.join("\n\n---\n\n")}`;
  }
}
