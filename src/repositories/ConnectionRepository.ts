import * as vscode from "vscode";
import { DbConnectionConfig } from "../shared/types";
import { getDriver } from "../db/drivers";
import { logger } from "../utils/logger";

const CONNECTIONS_KEY = "schemasight.connections";
const CRAWLED_IDS_KEY = "schemasight.crawledConnectionIds";
const PASSWORD_KEY_PREFIX = "schemasight.password.";

/**
 * Repository for database connection configuration and credentials.
 * Persists connection configs in VS Code globalState; passwords are stored in SecretStorage.
 * @see {@link https://code.visualstudio.com/api/references/vscode-api#Memento Memento}
 * @see {@link https://code.visualstudio.com/api/references/vscode-api#SecretStorage SecretStorage}
 */
export class ConnectionRepository {
  /**
   * @param globalState - VS Code Memento for extension-scoped key/value storage.
   * @param secrets - VS Code SecretStorage for storing connection passwords.
   */
  constructor(
    private readonly globalState: vscode.Memento,
    private readonly secrets: vscode.SecretStorage
  ) {}

  /**
   * Returns all stored connection configs (without passwords).
   * @returns List of connection configs; empty array if none stored.
   */
  async getAll(): Promise<DbConnectionConfig[]> {
    const raw = this.globalState.get<DbConnectionConfig[]>(CONNECTIONS_KEY);
    return Array.isArray(raw) ? raw : [];
  }

  /**
   * Adds a new connection and stores its password in SecretStorage.
   * @param config - Connection configuration (driver, host, port, database, label, id).
   * @param password - Password to store; not included in config.
   * @throws {Error} If a connection with the same `config.id` already exists.
   */
  async add(config: DbConnectionConfig, password: string): Promise<void> {
    const list = await this.getAll();
    if (list.some((c) => c.id === config.id)) {
      throw new Error(`Connection with id "${config.id}" already exists`);
    }
    list.push(config);
    await this.globalState.update(CONNECTIONS_KEY, list);
    await this.secrets.store(`${PASSWORD_KEY_PREFIX}${config.id}`, password);
  }

  /**
   * Removes a connection and its stored password; also removes it from crawled IDs.
   * @param id - Connection id to remove.
   */
  async remove(id: string): Promise<void> {
    const list = (await this.getAll()).filter((c) => c.id !== id);
    await this.globalState.update(CONNECTIONS_KEY, list);
    await this.secrets.delete(`${PASSWORD_KEY_PREFIX}${id}`);
    await this.removeCrawledConnectionId(id);
  }

  /**
   * Returns connection ids that have been crawled and indexed.
   * @returns Array of connection ids.
   */
  async getCrawledConnectionIds(): Promise<string[]> {
    const raw = this.globalState.get<string[]>(CRAWLED_IDS_KEY);
    return Array.isArray(raw) ? raw : [];
  }

  /**
   * Marks a connection as crawled (idempotent).
   * @param id - Connection id to mark.
   */
  async addCrawledConnectionId(id: string): Promise<void> {
    const ids = await this.getCrawledConnectionIds();
    if (ids.includes(id)) return;
    await this.globalState.update(CRAWLED_IDS_KEY, [...ids, id]);
  }

  /**
   * Removes a connection from the crawled set.
   * @param id - Connection id to remove.
   */
  async removeCrawledConnectionId(id: string): Promise<void> {
    const ids = (await this.getCrawledConnectionIds()).filter((x) => x !== id);
    await this.globalState.update(CRAWLED_IDS_KEY, ids);
  }

  /**
   * Retrieves the stored password for a connection.
   * @param id - Connection id.
   * @returns The password, or `undefined` if not stored.
   */
  async getPassword(id: string): Promise<string | undefined> {
    return this.secrets.get(`${PASSWORD_KEY_PREFIX}${id}`);
  }

  /**
   * Looks up a connection config by id.
   * @param id - Connection id.
   * @returns The config or `undefined` if not found.
   */
  async getById(id: string): Promise<DbConnectionConfig | undefined> {
    const list = await this.getAll();
    return list.find((c) => c.id === id);
  }

  /**
   * Tests connectivity using the given config and password (does not use stored state).
   * @param config - Connection config to test.
   * @param password - Password to use.
   * @returns `{ success: true }` or `{ success: false, error: string }`.
   */
  async testConnectionConfig(config: DbConnectionConfig, password: string): Promise<{ success: boolean; error?: string }> {
    const driver = getDriver(config.driver);
    try {
      const ok = await driver.testConnection(config, password);
      if (ok) return { success: true };
      return { success: false, error: "Connection failed" };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error(`Connection test failed: ${config.label}`, err);
      return { success: false, error: message };
    }
  }

  /**
   * Tests connectivity for a stored connection (loads config and password by id).
   * @param id - Stored connection id.
   * @returns `{ success: true }` or `{ success: false, error: string }` (e.g. "Connection not found", "Password not found").
   */
  async testConnection(id: string): Promise<{ success: boolean; error?: string }> {
    const config = await this.getById(id);
    if (!config) {
      logger.warn(`Connection test skipped: no connection found for id "${id}".`);
      return { success: false, error: "Connection not found" };
    }
    const password = await this.getPassword(id);
    if (password === undefined) {
      logger.warn(`Connection test skipped: no password stored for "${config.label}".`);
      return { success: false, error: "Password not found" };
    }

    logger.info(`Testing connection: ${config.label} (${config.driver} @ ${config.host}:${config.port}/${config.database}).`);
    const driver = getDriver(config.driver);
    try {
      const ok = await driver.testConnection(config, password);
      if (ok) {
        logger.info(`Connection test successful: ${config.label}.`);
        return { success: true };
      }
      logger.warn(`Connection test failed: ${config.label} — connection refused or invalid.`);
      return { success: false, error: "Connection failed" };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error(`Connection test failed: ${config.label}`, err);
      return { success: false, error: message };
    }
  }
}
