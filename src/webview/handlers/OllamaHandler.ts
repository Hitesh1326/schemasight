import * as vscode from "vscode";
import type { OllamaRepository } from "../../repositories/OllamaRepository";
import type { ExtensionToWebviewMessage } from "../../shared/types";

type PostMessage = (message: ExtensionToWebviewMessage) => void;

export class OllamaHandler {
  constructor(private readonly ollamaRepository: OllamaRepository) {}

  async handleGetOllamaStatus(post: PostMessage): Promise<void> {
    const available = await this.ollamaRepository.isAvailable();
    let model: string | undefined;
    let modelPulled: boolean | undefined;
    if (available) {
      model = this.ollamaRepository.getModelName();
      modelPulled = await this.ollamaRepository.isModelPulled();
    }
    post({ type: "OLLAMA_STATUS", payload: { available, model, modelPulled } });
  }

  async handleGetOllamaModels(post: PostMessage): Promise<void> {
    const models = await this.ollamaRepository.getAvailableModels();
    post({ type: "OLLAMA_MODELS", payload: { models } });
  }

  async handleSetOllamaModel(model: string, post: PostMessage): Promise<void> {
    const trimmed = model.trim();
    if (trimmed.length === 0) return;
    await vscode.workspace
      .getConfiguration("schemasight")
      .update("ollamaModel", trimmed, vscode.ConfigurationTarget.Global);
    await this.handleGetOllamaStatus(post);
  }

  async handlePullModel(modelName: string, post: PostMessage): Promise<void> {
    post({ type: "PULL_STARTED", payload: { model: modelName } });
    try {
      await this.ollamaRepository.pullModel(modelName);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      vscode.window.showErrorMessage(
        `SchemaSight: Pull failed for "${modelName}". ${message}`
      );
    } finally {
      await this.handleGetOllamaStatus(post);
    }
  }
}
