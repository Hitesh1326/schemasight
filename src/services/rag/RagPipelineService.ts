import type { SchemaChunk, ChatMessage, ChatThinking, DbConnectionConfig } from "../../shared/types";
import type { OllamaRepository } from "../../repositories/OllamaRepository";
import type { PromptBuilder } from "../../llm/PromptBuilder";
import type { EmbeddingRepository } from "../../repositories/EmbeddingRepository";
import type { ChunkRepository } from "../../repositories/ChunkRepository";
import { logger } from "../../utils/logger";
import {
  isBroadSchemaQuery,
  isDetailRequest,
  looksLikeSql,
} from "./QueryClassifier";
import {
  FULL_NAME,
  extractObjectNameFromMessage,
  extractObjectNamesFromText,
  findReferredChunks,
  findChunkMatchingUserMessage,
} from "./QueryParser";
import {
  CONTEXT_THRESHOLD,
  FIRST_SUMMARY_LAST_N,
  RE_SUMMARY_LAST_N,
  estimateTokens,
  estimateHistoryTokens,
} from "./ContextBudget";

/** Default number of chunks to retrieve for semantic search (before/after rerank). */
export const TOP_K = 30;
const MAX_NAMES_FROM_ASSISTANT = 10;

/** Payload for a single chat request from the webview. */
export interface ChatPayload {
  connectionId: string;
  message: string;
  history: ChatMessage[];
  summary?: string;
}

/** Resolved chat context (connection, message, history, config, context limit). */
export interface ChatSetup {
  connectionId: string;
  userMessage: string;
  history: ChatMessage[];
  existingSummary: string | undefined;
  config: DbConnectionConfig;
  contextLimit: number;
}

/** Result of optional conversation summarization; null means over context limit. */
export interface SummarizationResult {
  historyForApi: ChatMessage[];
  donePayload?: { summary: string; truncatedHistory: ChatMessage[] };
}

/** Context metadata sent with CHAT_THINKING (chunks used, by type, object names, timings). */
export interface ChatContextPayload {
  chunksUsed: number;
  byType: Record<string, number>;
  objectNames: string[];
  searchMs: number | undefined;
  contextTokens: number;
  totalInIndex?: number;
}

/**
 * Orchestrates the RAG chat pipeline: query rewriting, retrieval (full schema or semantic search),
 * context building, conversation summarization when near context limit, and streaming response.
 */
export class RagPipelineService {
  /**
   * @param ollamaRepository - For rewrite, summarize, chat, context length.
   * @param promptBuilder - For rewrite prompt, conversation summary prompt, RAG system prompt.
   * @param embeddingRepository - For query embedding when not using full schema.
   * @param chunkRepository - For getAllChunks, search, findByName, getIndexStats.
   */
  constructor(
    private readonly ollamaRepository: OllamaRepository,
    private readonly promptBuilder: PromptBuilder,
    private readonly embeddingRepository: EmbeddingRepository,
    private readonly chunkRepository: ChunkRepository
  ) {}

  /**
   * Resolves chunks for chat: broad queries get full schema; others get query rewrite + vector search.
   * @param connectionId - Connection to search.
   * @param userMessage - Current user message.
   * @param history - Previous chat messages (for rewrite).
   * @param postThinking - Callback for thinking steps (embedding, searching).
   * @returns Chunks to use as context, search duration, and the query used (rewritten or original).
   */
  async getChunksForChat(
    connectionId: string,
    userMessage: string,
    history: ChatMessage[],
    postThinking: (p: ChatThinking) => void
  ): Promise<{ chunks: SchemaChunk[]; searchMs: number | undefined; searchQuery: string }> {
    const useFullSchema = isBroadSchemaQuery(userMessage);
    let searchQuery = userMessage;

    try {
      const rewritePrompt = this.promptBuilder.buildQueryRewritePrompt(history, userMessage);
      const rewritten = await this.ollamaRepository.rewriteQueryForSearch(rewritePrompt);
      if (rewritten.length > 0) {
        if (looksLikeSql(rewritten)) {
          logger.warn(
            `[RAG] Query rewrite produced SQL, using original message instead. Rewritten was: "${rewritten.slice(0, 60)}${rewritten.length > 60 ? "…" : ""}"`
          );
        } else {
          searchQuery = rewritten;
          logger.info(
            `[RAG] Query rewrite: original (${userMessage.length} chars) -> searchQuery (${searchQuery.length} chars) "${searchQuery}"`
          );
        }
      } else {
        logger.info(`[RAG] Query rewrite: empty result, using original message`);
      }
    } catch (e) {
      logger.warn(
        `[RAG] Query rewrite failed, using original message: ${e instanceof Error ? e.message : e}`
      );
    }

    if (useFullSchema) {
      postThinking({ step: "searching" });
      const t0 = Date.now();
      const chunks = await this.chunkRepository.getAllChunks(connectionId);
      logger.info(
        `[RAG] Retrieval: broad query -> full schema, ${chunks.length} chunks in ${Date.now() - t0}ms`
      );
      return { chunks, searchMs: Date.now() - t0, searchQuery };
    }

    postThinking({ step: "embedding" });
    const queryEmbedding = await this.embeddingRepository.embed(searchQuery);
    postThinking({ step: "searching" });
    const t0 = Date.now();
    const chunks = await this.chunkRepository.search(connectionId, queryEmbedding, {
      topK: TOP_K,
      queryText: searchQuery,
    });
    const searchMs = Date.now() - t0;
    logger.info(
      `[RAG] Retrieval: semantic search, query="${searchQuery.slice(0, 60)}${searchQuery.length > 60 ? "…" : ""}" (topK=${TOP_K}) -> ${chunks.length} chunks in ${searchMs}ms`
    );
    return { chunks, searchMs, searchQuery };
  }

  /**
   * Resolves which chunks to inject as full definitions for a "detail" request (e.g. "explain that").
   * Tries: explicit match in chunks, referred chunks from last assistant message, name from user message, then names from assistant.
   * @param connectionId - Connection id for findByName lookups.
   * @param chunks - Currently retrieved chunks.
   * @param userMessage - Current user message.
   * @param lastAssistant - Last assistant message (for referred object names).
   * @returns Chunks to include as full content (0 to a few).
   */
  async resolveReferredChunksForDetail(
    connectionId: string,
    chunks: SchemaChunk[],
    userMessage: string,
    lastAssistant: ChatMessage | undefined
  ): Promise<SchemaChunk[]> {
    const explicitMatch =
      chunks.length > 0 ? findChunkMatchingUserMessage(chunks, userMessage) : undefined;
    if (explicitMatch) return [explicitMatch];

    if (lastAssistant) {
      const fromReferred = findReferredChunks(chunks, lastAssistant.content);
      if (fromReferred.length > 0) return fromReferred;
    }

    const nameFromUser = extractObjectNameFromMessage(userMessage);
    if (nameFromUser) {
      const byName = await this.chunkRepository.findByName(connectionId, nameFromUser);
      if (byName) return [byName];
    }

    if (lastAssistant) {
      const namesFromAssistant = extractObjectNamesFromText(lastAssistant.content).slice(
        0,
        MAX_NAMES_FROM_ASSISTANT
      );
      for (const n of namesFromAssistant) {
        const byName = await this.chunkRepository.findByName(connectionId, n);
        if (byName) return [byName];
      }
    }

    return [];
  }

  /**
   * Builds the history array for the API: prepends "Previous conversation summary" message when existingSummary is set.
   * @param history - Full conversation history.
   * @param existingSummary - Optional prior summary to prepend as synthetic assistant message.
   * @returns Messages to send to the chat API.
   */
  buildInitialHistoryForApi(
    history: ChatMessage[],
    existingSummary: string | undefined
  ): ChatMessage[] {
    if (existingSummary != null && existingSummary.length > 0) {
      return [
        {
          role: "assistant",
          content: `Previous conversation summary:\n\n${existingSummary}`,
          timestamp: "",
        },
        ...history,
      ];
    }
    return history;
  }

  /**
   * If total tokens >= context limit, returns null (caller should post CHAT_ERROR). If below threshold, returns current history.
   * If at or above CONTEXT_THRESHOLD of limit, summarizes older messages and returns new history + donePayload for persistence.
   * @param params - historyForApi, history, existingSummary, systemTokens, userTokens, contextLimit.
   * @returns SummarizationResult or null when over limit.
   */
  async applySummarizationIfNeeded(params: {
    historyForApi: ChatMessage[];
    history: ChatMessage[];
    existingSummary: string | undefined;
    systemTokens: number;
    userTokens: number;
    contextLimit: number;
  }): Promise<SummarizationResult | null> {
    const { historyForApi, history, existingSummary, systemTokens, userTokens, contextLimit } = params;
    const historyTokens = estimateHistoryTokens(historyForApi);
    const totalEstimated = systemTokens + historyTokens + userTokens;

    if (totalEstimated >= contextLimit) {
      return null;
    }

    if (totalEstimated < CONTEXT_THRESHOLD * contextLimit) {
      return { historyForApi, donePayload: undefined };
    }

    if (existingSummary == null || existingSummary.length === 0) {
      const toSummarize = history.slice(0, -FIRST_SUMMARY_LAST_N);
      const lastN = history.slice(-FIRST_SUMMARY_LAST_N);
      if (toSummarize.length === 0) {
        return { historyForApi, donePayload: undefined };
      }
      const summaryPrompt = this.promptBuilder.buildConversationSummaryPrompt(toSummarize);
      const summaryText = await this.ollamaRepository.summarizeConversation(summaryPrompt);
      return {
        historyForApi: [
          {
            role: "assistant",
            content: `Previous conversation summary:\n\n${summaryText}`,
            timestamp: "",
          },
          ...lastN,
        ],
        donePayload: { summary: summaryText, truncatedHistory: lastN },
      };
    }

    const toMerge = history.slice(0, -RE_SUMMARY_LAST_N);
    const newLastN = history.slice(-RE_SUMMARY_LAST_N);
    const mergePrompt =
      existingSummary +
      "\n\n---\n\n" +
      this.promptBuilder.buildConversationSummaryPrompt(toMerge);
    const newSummary = await this.ollamaRepository.summarizeConversation(mergePrompt);
    return {
      historyForApi: [
        {
          role: "assistant",
          content: `Previous conversation summary:\n\n${newSummary}`,
          timestamp: "",
        },
        ...newLastN,
      ],
      donePayload: { summary: newSummary, truncatedHistory: newLastN },
    };
  }

  /**
   * Streams the chat response via postChunk, posts final thinking with elapsed time, then postDone(donePayload).
   * @param params - connectionId, systemPrompt, historyForApi, userMessage, chunks, searchMs, contextLimit, chatStartMs, donePayload, postThinking, postChunk, postDone.
   */
  async streamChatAndFinish(params: {
    connectionId: string;
    systemPrompt: string;
    historyForApi: ChatMessage[];
    userMessage: string;
    chunks: SchemaChunk[];
    searchMs: number | undefined;
    contextLimit: number;
    chatStartMs: number;
    donePayload: { summary: string; truncatedHistory: ChatMessage[] } | undefined;
    postThinking: (p: ChatThinking) => void;
    postChunk: (token: string) => void;
    postDone: (payload?: { summary: string; truncatedHistory: ChatMessage[] }) => void;
  }): Promise<void> {
    const {
      connectionId,
      systemPrompt,
      historyForApi,
      userMessage,
      chunks,
      searchMs,
      contextLimit,
      chatStartMs,
      donePayload,
      postThinking,
      postChunk,
      postDone,
    } = params;

    const contextTokens =
      estimateTokens(systemPrompt) +
      estimateHistoryTokens(historyForApi) +
      estimateTokens(userMessage);
    const stats = await this.chunkRepository.getIndexStats(connectionId);
    const totalInIndex = stats?.totalChunks;
    const contextPayload = this.buildChatContextPayload(chunks, searchMs, contextTokens, totalInIndex);

    postThinking({ step: "context", context: contextPayload });
    postThinking({
      step: "generating",
      model: this.ollamaRepository.getModelName(),
      context: contextPayload,
    });

    await this.ollamaRepository.chat(systemPrompt, historyForApi, userMessage, postChunk);

    const totalElapsedMs = Date.now() - chatStartMs;
    logger.info(`[RAG] Response stream finished, totalElapsedMs=${totalElapsedMs}`);
    postThinking({
      step: "generating",
      model: this.ollamaRepository.getModelName(),
      context: { ...contextPayload, totalElapsedMs, contextLimit },
    });

    postDone(donePayload);
  }

  /**
   * Builds the context payload for CHAT_THINKING (chunksUsed, byType, objectNames, searchMs, contextTokens, totalInIndex).
   * @param chunks - Chunks used in the system prompt.
   * @param searchMs - Search duration (if applicable).
   * @param contextTokens - Estimated tokens in system + history + user message.
   * @param totalInIndex - Optional total chunks in index (from getIndexStats).
   * @returns ChatContextPayload for thinking UI.
   */
  buildChatContextPayload(
    chunks: SchemaChunk[],
    searchMs: number | undefined,
    contextTokens: number,
    totalInIndex?: number
  ): ChatContextPayload {
    const byType: Record<string, number> = {};
    for (const c of chunks) {
      byType[c.objectType] = (byType[c.objectType] ?? 0) + 1;
    }
    const objectNames = chunks.slice(0, 8).map(FULL_NAME);
    return {
      chunksUsed: chunks.length,
      byType,
      objectNames,
      searchMs,
      contextTokens,
      totalInIndex,
    };
  }

  /**
   * Whether the user message is asking for detail about a specific object (e.g. "explain that", "show the definition").
   * @param userMessage - Current user message.
   * @returns True if classified as a detail request.
   */
  getIsDetailRequest(userMessage: string): boolean {
    return isDetailRequest(userMessage);
  }
}
