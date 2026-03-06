import * as vscode from "vscode";
import type { ConnectionRepository } from "../../repositories/ConnectionRepository";
import type { SchemaRepository } from "../../repositories/SchemaRepository";
import type { Indexer } from "../../services/indexing/Indexer";
import type { ExtensionToWebviewMessage } from "../../shared/types";
import { logger } from "../../utils/logger";

type PostMessage = (message: ExtensionToWebviewMessage) => void;

function isOllamaUnreachableError(error: string): boolean {
  const lower = error.toLowerCase();
  return (
    lower.includes("fetch") ||
    lower.includes("econnrefused") ||
    lower.includes("11434") ||
    lower.includes("ollama") ||
    lower.includes("network") ||
    lower.includes("failed to fetch")
  );
}

export class CrawlHandler {
  private activeCrawl: { connectionId: string; controller: AbortController } | null = null;

  constructor(
    private readonly connectionRepository: ConnectionRepository,
    private readonly schemaRepository: SchemaRepository,
    private readonly indexer: Indexer
  ) {}

  async handleCrawlSchema(connectionId: string, post: PostMessage): Promise<void> {
    const config = await this.connectionRepository.getById(connectionId);
    if (!config) {
      post({ type: "ERROR", payload: { message: "Connection not found" } });
      return;
    }
    const password = await this.connectionRepository.getPassword(connectionId);
    if (password === undefined) {
      post({ type: "ERROR", payload: { message: "Password not found for this connection" } });
      return;
    }
    const controller = new AbortController();
    this.activeCrawl = { connectionId, controller };
    try {
      const schema = await this.schemaRepository.crawl(
        config,
        password,
        (progress) => post({ type: "CRAWL_PROGRESS", payload: progress }),
        controller.signal
      );
      await this.indexer.index(
        schema,
        (progress) => post({ type: "CRAWL_PROGRESS", payload: progress }),
        controller.signal
      );
      await this.connectionRepository.addCrawledConnectionId(connectionId);
      const crawledIds = await this.connectionRepository.getCrawledConnectionIds();
      post({ type: "CRAWL_COMPLETE", payload: { connectionId } });
      post({ type: "CRAWLED_CONNECTION_IDS", payload: crawledIds });
      vscode.window.showInformationMessage("SchemaSight: Schema crawl and index complete.");
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        post({ type: "CRAWL_CANCELLED", payload: { connectionId } });
        vscode.window.showInformationMessage("SchemaSight: Re-index cancelled.");
      } else {
        const error = err instanceof Error ? err.message : String(err);
        logger.error("Crawl failed", err);
        post({ type: "CRAWL_ERROR", payload: { connectionId, error } });
        if (isOllamaUnreachableError(error)) {
          vscode.window.showErrorMessage(
            "SchemaSight: Couldn't reach Ollama. Is it running? Start it (e.g. ollama serve) and try again. See Output → SchemaSight for details."
          );
        } else {
          vscode.window.showErrorMessage(
            "SchemaSight: Crawl failed. See Output → SchemaSight for details."
          );
        }
      }
    } finally {
      this.activeCrawl = null;
    }
  }

  handleCrawlCancel(connectionId: string): void {
    if (this.activeCrawl?.connectionId === connectionId) {
      this.activeCrawl.controller.abort();
    }
  }
}
