import type { ConnectionRepository } from "../repositories/ConnectionRepository";
import type { SchemaRepository } from "../repositories/SchemaRepository";
import type { ChunkRepository } from "../repositories/ChunkRepository";
import type { OllamaRepository } from "../repositories/OllamaRepository";
import type { PromptBuilder } from "../llm/PromptBuilder";
import type { RagPipelineService } from "../services/rag/RagPipelineService";
import type { Indexer } from "../services/indexing/Indexer";
import { ConnectionHandler } from "./handlers/ConnectionHandler";
import { OllamaHandler } from "./handlers/OllamaHandler";
import { CrawlHandler } from "./handlers/CrawlHandler";
import { ChatHandler } from "./handlers/ChatHandler";
import { IndexHandler } from "./handlers/IndexHandler";
import type {
  WebviewToExtensionMessage,
  ExtensionToWebviewMessage,
} from "../shared/types";

type AddConnectionPayload = Extract<WebviewToExtensionMessage, { type: "ADD_CONNECTION" }>["payload"];

type PostMessage = (message: ExtensionToWebviewMessage) => void;

/**
 * Injected services used to fulfill webview message requests.
 * Handlers receive the repositories and services they need; RagPipelineService is pre-built in extension.
 */
interface Services {
  connectionRepository: ConnectionRepository;
  schemaRepository: SchemaRepository;
  chunkRepository: ChunkRepository;
  ollamaRepository: OllamaRepository;
  promptBuilder: PromptBuilder;
  ragPipelineService: RagPipelineService;
  indexer: Indexer;
}

export class MessageRouter {
  private readonly connectionHandler: ConnectionHandler;
  private readonly ollamaHandler: OllamaHandler;
  private readonly crawlHandler: CrawlHandler;
  private readonly chatHandler: ChatHandler;
  private readonly indexHandler: IndexHandler;

  constructor(services: Services) {
    this.connectionHandler = new ConnectionHandler(services.connectionRepository);
    this.ollamaHandler = new OllamaHandler(services.ollamaRepository);
    this.crawlHandler = new CrawlHandler(
      services.connectionRepository,
      services.schemaRepository,
      services.indexer
    );
    this.chatHandler = new ChatHandler(
      services.connectionRepository,
      services.ollamaRepository,
      services.promptBuilder,
      services.ragPipelineService
    );
    this.indexHandler = new IndexHandler(services.chunkRepository, services.connectionRepository);
  }

  /**
   * Dispatches the incoming message to the correct handler.
   */
  async handle(message: WebviewToExtensionMessage, post: PostMessage): Promise<void> {
    try {
      switch (message.type) {
        case "GET_CONNECTIONS":
          await this.connectionHandler.handleGetConnections(post);
          break;
        case "ADD_CONNECTION":
          await this.connectionHandler.handleAddConnection(message.payload as AddConnectionPayload, post);
          break;
        case "REMOVE_CONNECTION":
          await this.connectionHandler.handleRemoveConnection(message.payload, post);
          break;
        case "TEST_CONNECTION":
          await this.connectionHandler.handleTestConnection(message.payload.id, post);
          break;
        case "GET_OLLAMA_STATUS":
          await this.ollamaHandler.handleGetOllamaStatus(post);
          break;
        case "GET_OLLAMA_MODELS":
          await this.ollamaHandler.handleGetOllamaModels(post);
          break;
        case "SET_OLLAMA_MODEL":
          await this.ollamaHandler.handleSetOllamaModel(message.payload.model, post);
          break;
        case "PULL_MODEL":
          await this.ollamaHandler.handlePullModel(message.payload.model, post);
          break;
        case "CRAWL_SCHEMA":
          await this.crawlHandler.handleCrawlSchema(message.payload.id, post);
          break;
        case "CRAWL_CANCEL":
          this.crawlHandler.handleCrawlCancel(message.payload.connectionId);
          break;
        case "CHAT":
          await this.chatHandler.handleChat(message.payload, post);
          break;
        case "CLEAR_INDEX":
          await this.indexHandler.handleClearIndex(message.payload.connectionId, post);
          break;
        case "GET_INDEX_STATS":
          await this.indexHandler.handleGetIndexStats(message.payload.connectionId, post);
          break;
        default:
          post({ type: "ERROR", payload: { message: "Unknown message type" } });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      post({ type: "ERROR", payload: { message: msg } });
    }
  }
}
