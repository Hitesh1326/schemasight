import * as vscode from "vscode";
import type { ChatMessage } from "../shared/types";
import { logger } from "../utils/logger";
import {
  SUMMARIZE_SYSTEM,
  QUERY_REWRITE_SYSTEM,
  CONVERSATION_SUMMARY_SYSTEM,
} from "../llm/PromptBuilder";

type StreamCallback = (token: string) => void;

const DEFAULT_BASE_URL = "http://localhost:11434";
const DEFAULT_MODEL = "llama3.1:8b";

interface OllamaTagsResponse {
  models?: { name?: string }[];
}

interface OllamaShowResponse {
  parameters?: string;
  model_info?: Record<string, number>;
}

/**
 * Repository for the Ollama HTTP API (local LLM).
 * Reads base URL and model from VS Code config (`schemasight.ollamaBaseUrl`, `schemasight.ollamaModel`).
 * Supports chat (streaming), non-streaming generate (summarize, query rewrite, conversation summary), pull, tags, and context length.
 */
export class OllamaRepository {
  private get baseUrl(): string {
    return vscode.workspace.getConfiguration("schemasight").get("ollamaBaseUrl", DEFAULT_BASE_URL);
  }

  private get model(): string {
    return vscode.workspace.getConfiguration("schemasight").get("ollamaModel", DEFAULT_MODEL);
  }

  /**
   * Returns the configured model name (for display and context).
   * @returns Current Ollama model name from settings.
   */
  getModelName(): string {
    return this.model;
  }

  /**
   * Checks if Ollama is reachable (GET /api/tags).
   * @returns True if tags endpoint returns valid response; false on network/parse error.
   */
  async isAvailable(): Promise<boolean> {
    try {
      const data = await this.getTags();
      return Array.isArray(data?.models);
    } catch {
      return false;
    }
  }

  /**
   * Checks if the configured model is present in Ollama (already pulled).
   * @returns True if the model appears in /api/tags.
   */
  async isModelPulled(): Promise<boolean> {
    try {
      const data = await this.getTags();
      const models = data?.models ?? [];
      const want = this.model;
      return models.some((m) => typeof m.name === "string" && m.name === want);
    } catch {
      return false;
    }
  }

  /**
   * Pulls a model via POST /api/pull (non-streaming). Resolves when pull completes.
   * @param modelName - Model name to pull (e.g. llama3.2:3b).
   * @param signal - Optional AbortSignal to cancel the pull.
   * @throws {Error} On non-OK response or network failure.
   */
  async pullModel(modelName: string, signal?: AbortSignal): Promise<void> {
    const url = `${this.baseUrl}/api/pull`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: modelName, stream: false }),
      signal,
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Ollama pull failed (${res.status}): ${text || res.statusText}`);
    }
    await res.json();
  }

  /**
   * Summarizes content for indexing (POST /api/generate with SUMMARIZE_SYSTEM).
   * @param content - Raw schema or procedure text to summarize.
   * @param signal - Optional AbortSignal (e.g. user cancelled re-index).
   * @returns Short summary (1–3 sentences).
   * @throws {Error} On API error or missing/invalid response.
   */
  async summarize(content: string, signal?: AbortSignal): Promise<string> {
    const raw = await this.generate(content, SUMMARIZE_SYSTEM, signal);
    if (typeof raw !== "string") {
      throw new Error("Ollama response missing or invalid 'response' field");
    }
    return raw.trim();
  }

  /**
   * Summarizes a conversation segment (CONVERSATION_SUMMARY_SYSTEM) for context compression.
   * @param prompt - Formatted conversation (e.g. from PromptBuilder.buildConversationSummaryPrompt).
   * @returns Summary string.
   * @throws {Error} On API error or invalid response.
   */
  async summarizeConversation(prompt: string): Promise<string> {
    const raw = await this.generate(prompt, CONVERSATION_SUMMARY_SYSTEM);
    if (typeof raw !== "string") {
      throw new Error("Ollama conversation summary missing or invalid");
    }
    return raw.trim();
  }

  /**
   * Rewrites a follow-up message into a standalone search query (QUERY_REWRITE_SYSTEM).
   * @param prompt - Full prompt (conversation + latest message).
   * @returns Standalone search query or empty string if response missing/invalid.
   */
  async rewriteQueryForSearch(prompt: string): Promise<string> {
    const raw = await this.generate(prompt, QUERY_REWRITE_SYSTEM);
    return typeof raw === "string" ? raw.trim() : "";
  }

  /**
   * Chat with history; streams tokens via onToken (POST /api/chat, stream: true).
   * @param systemPrompt - System prompt (e.g. RAG context).
   * @param history - Previous messages (role + content).
   * @param userMessage - Latest user message.
   * @param onToken - Callback invoked for each streamed token.
   * @throws {Error} On non-OK response or missing body.
   */
  async chat(
    systemPrompt: string,
    history: ChatMessage[],
    userMessage: string,
    onToken: StreamCallback
  ): Promise<void> {
    const messages: { role: "system" | "user" | "assistant"; content: string }[] = [
      { role: "system", content: systemPrompt },
      ...history.map((m) => ({ role: m.role, content: m.content })),
      { role: "user", content: userMessage },
    ];
    logger.info(
      `[RAG] Ollama request: POST /api/chat, model=${this.model}, messages=${messages.length} (1 system + ${history.length} history + 1 user)`
    );

    const url = `${this.baseUrl}/api/chat`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: this.model,
        messages,
        stream: true,
        think: false,
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Ollama chat failed (${res.status}): ${text || res.statusText}`);
    }

    const reader = res.body?.getReader();
    if (!reader) {
      throw new Error("Ollama chat response has no body");
    }

    try {
      await this.streamChatResponse(reader, onToken);
    } finally {
      reader.releaseLock();
    }
  }

  /**
   * Returns the model's context length (tokens) from POST /api/show.
   * Parses `parameters` for "num_ctx N" or `model_info` for "*context_length".
   * @returns Context length in tokens, or 8192 if unavailable.
   */
  async getContextLength(): Promise<number> {
    const DEFAULT_CTX = 8192;
    try {
      const res = await fetch(`${this.baseUrl}/api/show`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: this.model }),
      });
      if (!res.ok) {
        logger.info(`Context limit: ${DEFAULT_CTX} (fallback: Ollama /api/show returned ${res.status})`);
        return DEFAULT_CTX;
      }
      const data = (await res.json()) as OllamaShowResponse;
      if (data.parameters) {
        const match = data.parameters.match(/\bnum_ctx\s+(\d+)/i);
        if (match) {
          const n = Math.max(1, parseInt(match[1], 10));
          logger.info(`Context limit: ${n} (from Ollama parameters num_ctx)`);
          return n;
        }
      }
      if (data.model_info && typeof data.model_info === "object") {
        for (const [key, value] of Object.entries(data.model_info)) {
          if (key.endsWith("context_length") && typeof value === "number" && value > 0) {
            logger.info(`Context limit: ${value} (from Ollama model_info.${key})`);
            return value;
          }
        }
      }
      logger.info(`Context limit: ${DEFAULT_CTX} (fallback: no num_ctx or context_length in /api/show)`);
    } catch (e) {
      logger.info(`Context limit: ${DEFAULT_CTX} (fallback: Ollama unavailable — ${e instanceof Error ? e.message : "unknown error"})`);
    }
    return DEFAULT_CTX;
  }

  /**
   * Returns model names from GET /api/tags (for webview model selector).
   * @returns List of model names; empty array on error.
   */
  async getAvailableModels(): Promise<string[]> {
    try {
      const data = await this.getTags();
      const models = data?.models ?? [];
      return models
        .map((m) => m.name)
        .filter((n): n is string => typeof n === "string");
    } catch {
      return [];
    }
  }

  private async getTags(): Promise<OllamaTagsResponse> {
    const res = await fetch(`${this.baseUrl}/api/tags`, { method: "GET" });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Ollama tags failed (${res.status}): ${text || res.statusText}`);
    }
    return (await res.json()) as OllamaTagsResponse;
  }

  private async generate(
    prompt: string,
    system: string,
    signal?: AbortSignal
  ): Promise<string | undefined> {
    const url = `${this.baseUrl}/api/generate`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: this.model,
        prompt,
        system,
        stream: false,
        think: false,
      }),
      signal,
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Ollama generate failed (${res.status}): ${text || res.statusText}`);
    }
    const data = (await res.json()) as { response?: string };
    return data.response;
  }

  private async streamChatResponse(
    reader: ReadableStreamDefaultReader<Uint8Array>,
    onToken: StreamCallback
  ): Promise<void> {
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const data = JSON.parse(trimmed) as { message?: { content?: string }; done?: boolean };
          const content = data.message?.content;
          if (typeof content === "string" && content.length > 0) {
            onToken(content);
          }
        } catch {
          // ignore malformed JSON lines
        }
      }
    }

    if (buffer.trim()) {
      try {
        const data = JSON.parse(buffer.trim()) as { message?: { content?: string } };
        const content = data.message?.content;
        if (typeof content === "string" && content.length > 0) {
          onToken(content);
        }
      } catch {
        // ignore
      }
    }
  }
}
