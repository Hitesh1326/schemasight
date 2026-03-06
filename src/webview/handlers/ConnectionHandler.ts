import * as vscode from "vscode";
import type { ConnectionRepository } from "../../repositories/ConnectionRepository";
import type { DbConnectionConfig, ExtensionToWebviewMessage } from "../../shared/types";

type PostMessage = (message: ExtensionToWebviewMessage) => void;
type AddConnectionPayload = DbConnectionConfig & { password: string };

export class ConnectionHandler {
  constructor(private readonly connectionRepository: ConnectionRepository) {}

  async handleGetConnections(post: PostMessage): Promise<void> {
    const connections = await this.connectionRepository.getAll();
    const crawledIds = await this.connectionRepository.getCrawledConnectionIds();
    post({ type: "CONNECTIONS_LIST", payload: connections });
    post({ type: "CRAWLED_CONNECTION_IDS", payload: crawledIds });
  }

  async handleAddConnection(payload: AddConnectionPayload, post: PostMessage): Promise<void> {
    const { password, ...config } = payload;
    const test = await this.connectionRepository.testConnectionConfig(config, password);
    if (!test.success) {
      post({ type: "ADD_CONNECTION_RESULT", payload: { success: false, error: test.error } });
      return;
    }
    await this.connectionRepository.add(config, password);
    post({ type: "CONNECTION_ADDED", payload: config });
    post({ type: "ADD_CONNECTION_RESULT", payload: { success: true } });
  }

  async handleRemoveConnection(payload: { id: string }, post: PostMessage): Promise<void> {
    await this.connectionRepository.remove(payload.id);
    post({ type: "CONNECTION_REMOVED", payload });
  }

  async handleTestConnection(id: string, post: PostMessage): Promise<void> {
    const result = await this.connectionRepository.testConnection(id);
    post({
      type: "CONNECTION_TEST_RESULT",
      payload: { id, success: result.success, error: result.error },
    });
    if (result.success) {
      vscode.window.showInformationMessage("SchemaSight: Connection successful.");
    } else {
      vscode.window.showErrorMessage(
        `SchemaSight: Connection failed. ${result.error ?? "Unknown error"}`
      );
    }
  }
}
