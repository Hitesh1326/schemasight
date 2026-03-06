import * as vscode from "vscode";
import { registerCommands } from "./commands";
import { PanelManager } from "./webview/PanelManager";
import { ConnectionRepository } from "./repositories/ConnectionRepository";
import { SchemaRepository } from "./repositories/SchemaRepository";
import { ChunkRepository } from "./repositories/ChunkRepository";
import { OllamaRepository } from "./repositories/OllamaRepository";
import { EmbeddingRepository } from "./repositories/EmbeddingRepository";
import { PromptBuilder } from "./llm/PromptBuilder";
import { RagPipelineService } from "./services/rag/RagPipelineService";
import { Indexer } from "./services/indexing/Indexer";

export function activate(context: vscode.ExtensionContext): void {
  const connectionRepository = new ConnectionRepository(context.globalState, context.secrets);
  const schemaRepository = new SchemaRepository();
  const chunkRepository = new ChunkRepository(context.globalStorageUri);
  const ollamaRepository = new OllamaRepository();
  const embeddingRepository = new EmbeddingRepository();
  void embeddingRepository.initialize();
  const promptBuilder = new PromptBuilder();
  const ragPipelineService = new RagPipelineService(
    ollamaRepository,
    promptBuilder,
    embeddingRepository,
    chunkRepository
  );
  const indexer = new Indexer(
    ollamaRepository,
    promptBuilder,
    embeddingRepository,
    chunkRepository
  );
  const panelManager = new PanelManager(context, {
    connectionRepository,
    schemaRepository,
    chunkRepository,
    ollamaRepository,
    promptBuilder,
    ragPipelineService,
    indexer,
  });

  registerCommands(context, panelManager);

  // Sidebar view provider — renders the same React app inside the sidebar
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      "schemasight.sidebarView",
      panelManager.getSidebarViewProvider(),
      { webviewOptions: { retainContextWhenHidden: true } }
    )
  );
}

/**
 * Called when the extension is deactivated. Cleanup is handled by disposables registered on context.
 */
export function deactivate(): void {
  // cleanup handled by disposables registered on context
}
