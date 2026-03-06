import { DbConnectionConfig, DatabaseSchema, CrawlProgressCallback } from "../shared/types";
import { getDriver } from "../db/drivers";

/**
 * Repository for database schema discovery (crawl).
 * Delegates to the driver for the given `config.driver` (mssql, postgres, mysql).
 * Each crawl uses its own connection; supports progress callbacks and cancellation via AbortSignal.
 */
export class SchemaRepository {
  /**
   * Crawls the database schema: tables, views, stored procedures, functions.
   * @param config - Connection config (driver, host, port, database, etc.).
   * @param password - Connection password.
   * @param onProgress - Callback invoked with phase and progress (e.g. current table name).
   * @param signal - Optional AbortSignal to cancel the crawl.
   * @returns The full database schema for the connection.
   * @throws {Error} On driver or network failure.
   */
  async crawl(
    config: DbConnectionConfig,
    password: string,
    onProgress: CrawlProgressCallback,
    signal?: AbortSignal
  ): Promise<DatabaseSchema> {
    const driver = getDriver(config.driver);
    return driver.crawlSchema(config, password, onProgress, signal);
  }
}
