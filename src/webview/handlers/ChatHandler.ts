import type { ConnectionRepository } from "../../repositories/ConnectionRepository";
import type { OllamaRepository } from "../../repositories/OllamaRepository";
import type { PromptBuilder } from "../../llm/PromptBuilder";
import type { RagPipelineService } from "../../services/rag/RagPipelineService";
import type { ChatMessage, ChatThinking, DbConnectionConfig, ExtensionToWebviewMessage, SchemaChunk } from "../../shared/types";
import { logger } from "../../utils/logger";
import { estimateTokens, estimateHistoryTokens } from "../../services/rag/ContextBudget";
import { FULL_NAME } from "../../services/rag/QueryParser";

type PostMessage = (message: ExtensionToWebviewMessage) => void;

export interface ChatPayload {
  connectionId: string;
  message: string;
  history: ChatMessage[];
  summary?: string;
}

export class ChatHandler {
  constructor(
    private readonly connectionRepository: ConnectionRepository,
    private readonly ollamaRepository: OllamaRepository,
    private readonly promptBuilder: PromptBuilder,
    private readonly ragPipelineService: RagPipelineService
  ) {}

  async handleChat(payload: ChatPayload, post: PostMessage): Promise<void> {
    const chatStartMs = Date.now();
    const setup = await this.getChatSetup(payload, post);
    if (!setup) return;

    const { connectionId, userMessage, history, existingSummary, config, contextLimit } = setup;
    const postThinking = (p: ChatThinking) => post({ type: "CHAT_THINKING", payload: p });

    const trunc = (s: string, max: number) => (s.length <= max ? s : s.slice(0, max) + "…");
    logger.info(
      `[RAG] Chat started: db="${config.database}", userMessage="${trunc(userMessage, 60)}", historyLength=${history.length}, contextLimit=${contextLimit}`
    );

    try {
      const { chunks, searchMs } = await this.ragPipelineService.getChunksForChat(
        connectionId,
        userMessage,
        history,
        postThinking
      );

      const firstNames = chunks.slice(0, 8).map(FULL_NAME).join(", ");
      logger.info(
        `[RAG] Retrieved ${chunks.length} chunks: ${firstNames}${chunks.length > 8 ? " …" : ""}`
      );

      const lastAssistant = getLastAssistantMessage(history);
      const isDetail = this.ragPipelineService.getIsDetailRequest(userMessage);
      const referredChunks = isDetail
        ? await this.ragPipelineService.resolveReferredChunksForDetail(
            connectionId,
            chunks,
            userMessage,
            lastAssistant
          )
        : [];

      const referredObjectFullContent =
        referredChunks.length > 0
          ? referredChunks.map((c) => ({
              heading: `[${c.objectType}] ${c.objectName}`,
              content: c.content,
            }))
          : undefined;

      if (referredObjectFullContent) {
        logger.info(
          `[RAG] Detail request: injecting full definition for ${referredChunks.length} object(s): ${referredChunks.map(FULL_NAME).join(", ")}`
        );
      } else if (isDetail) {
        logger.info(`[RAG] Detail request: no referred chunks resolved, using search context only`);
      }

      const systemPrompt = this.buildSystemPrompt(
        chunks,
        config,
        referredObjectFullContent,
        userMessage
      );
      const systemTokens = estimateTokens(systemPrompt);
      const userTokens = estimateTokens(userMessage);
      const contextMode = referredObjectFullContent ? "detail" : "search";
      logger.info(
        `[RAG] Context built: systemTokens=${systemTokens}, mode=${contextMode}, chunksInContext=${chunks.length}`
      );

      const historyForApi = this.ragPipelineService.buildInitialHistoryForApi(
        history,
        existingSummary
      );
      const summarizationResult = await this.ragPipelineService.applySummarizationIfNeeded({
        historyForApi,
        history,
        existingSummary,
        systemTokens,
        userTokens,
        contextLimit,
      });

      if (summarizationResult === null) {
        post({
          type: "CHAT_ERROR",
          payload: { error: "Conversation is too long. Clear the conversation to continue." },
        });
        return;
      }

      const { historyForApi: finalHistory, donePayload } = summarizationResult;
      const historyTokens = estimateHistoryTokens(finalHistory);
      const totalRequestTokens = systemTokens + historyTokens + userTokens;
      logger.info(
        `[RAG] Summarization: ${donePayload ? `applied (summary + ${finalHistory.length} messages)` : "skipped"}`
      );
      logger.info(
        `[RAG] Sending to LLM: model=${this.ollamaRepository.getModelName()}, systemTokens=${systemTokens}, historyTokens=${historyTokens} (${finalHistory.length} msgs), userTokens=${userTokens}, totalRequestTokens=${totalRequestTokens}`
      );

      await this.ragPipelineService.streamChatAndFinish({
        connectionId,
        systemPrompt,
        historyForApi: finalHistory,
        userMessage,
        chunks,
        searchMs,
        contextLimit,
        chatStartMs,
        donePayload,
        postThinking,
        postChunk: (token) => post({ type: "CHAT_CHUNK", payload: { token } }),
        postDone: (payload) => {
          if (payload) {
            post({ type: "CHAT_DONE", payload });
          } else {
            post({ type: "CHAT_DONE" });
          }
        },
      });
      logger.info(`[RAG] Chat finished: totalElapsedMs=${Date.now() - chatStartMs}`);
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      logger.error("Chat RAG failed", err);
      post({ type: "CHAT_ERROR", payload: { error } });
    }
  }

  private buildSystemPrompt(
    chunks: SchemaChunk[],
    config: DbConnectionConfig,
    referredObjectFullContent: { heading: string; content: string }[] | undefined,
    userMessage: string
  ): string {
    return this.promptBuilder.buildRagSystemPrompt(
      chunks,
      config.database,
      referredObjectFullContent,
      userMessage
    );
  }

  private async getChatSetup(
    payload: ChatPayload,
    post: PostMessage
  ): Promise<{
    connectionId: string;
    userMessage: string;
    history: ChatMessage[];
    existingSummary: string | undefined;
    config: DbConnectionConfig;
    contextLimit: number;
  } | null> {
    const { connectionId, message: userMessage, history, summary: existingSummary } = payload;
    const config = await this.connectionRepository.getById(connectionId);
    if (!config) {
      post({ type: "CHAT_ERROR", payload: { error: "Connection not found" } });
      return null;
    }
    const contextLimit = await this.ollamaRepository.getContextLength();
    return { connectionId, userMessage, history, existingSummary, config, contextLimit };
  }
}

function getLastAssistantMessage(history: ChatMessage[]): ChatMessage | undefined {
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i]!.role === "assistant") return history[i];
  }
  return undefined;
}
