import * as vscode from "vscode";
import * as path from "path";
import * as lancedb from "@lancedb/lancedb";
import type { Connection } from "@lancedb/lancedb";
import { Field, Float32, FixedSizeList, Schema, Utf8 } from "apache-arrow";
import type { SchemaChunk, IndexStats } from "../shared/types";

const CHUNKS_TABLE_PREFIX = "chunks_";
const EMBEDDING_COLUMN = "embedding";
const CONTENT_COLUMN = "content";
const MIN_ROWS_FOR_VECTOR_INDEX = 256;

/**
 * Options for hybrid (vector + FTS) search over schema chunks.
 */
export interface SearchOptions {
  /** Maximum number of chunks to return (after reranking). */
  topK: number;
  /** Natural language or keyword query (used for full-text and reranking). */
  queryText: string;
  /** Optional filter by object type (table, view, stored_procedure, function). */
  typeFilter?: SchemaChunk["objectType"];
}

const ALLOWED_OBJECT_TYPES = new Set<SchemaChunk["objectType"]>([
  "table",
  "view",
  "stored_procedure",
  "function",
]);

function rowToChunk(row: Record<string, unknown>): SchemaChunk {
  return {
    id: row.id as string,
    connectionId: row.connectionId as string,
    objectType: row.objectType as SchemaChunk["objectType"],
    objectName: row.objectName as string,
    schema: row.schema as string,
    content: row.content as string,
    summary: row.summary as string,
    embedding: (row.embedding as number[]) ?? [],
    crawledAt: row.crawledAt as string,
  };
}

function tableNameFor(connectionId: string): string {
  const safe = connectionId.replace(/[^a-zA-Z0-9_-]/g, "_");
  return `${CHUNKS_TABLE_PREFIX}${safe}`;
}

function buildChunksSchema(embeddingDimension: number): Schema {
  return new Schema([
    new Field("id", new Utf8(), true),
    new Field("connectionId", new Utf8(), true),
    new Field("objectType", new Utf8(), true),
    new Field("objectName", new Utf8(), true),
    new Field("schema", new Utf8(), true),
    new Field("content", new Utf8(), true),
    new Field("summary", new Utf8(), true),
    new Field("embedding", new FixedSizeList(embeddingDimension, new Field("item", new Float32(), true)), true),
    new Field("crawledAt", new Utf8(), true),
  ]);
}

function computeStatsFromRows(
  rows: Record<string, unknown>[]
): Omit<IndexStats, "totalChunks"> {
  let tableChunks = 0;
  let viewChunks = 0;
  let spChunks = 0;
  let functionChunks = 0;
  let chunksWithSummary = 0;
  let chunksWithEmbedding = 0;
  let lastCrawledAt: string | null = null;

  for (const r of rows) {
    if (r.objectType === "table") tableChunks++;
    if (r.objectType === "view") viewChunks++;
    if (r.objectType === "stored_procedure") spChunks++;
    if (r.objectType === "function") functionChunks++;
    if (typeof r.summary === "string" && r.summary.length > 0) chunksWithSummary++;
    const emb = r.embedding;
    const hasEmbedding =
      (Array.isArray(emb) && emb.length > 0) ||
      (typeof emb === "object" && emb !== null && "length" in emb && (emb as { length: number }).length > 0);
    if (hasEmbedding) chunksWithEmbedding++;
    const at = r.crawledAt;
    if (typeof at === "string" && at) {
      if (!lastCrawledAt || at > lastCrawledAt) lastCrawledAt = at;
    }
  }

  return {
    tableChunks,
    viewChunks,
    spChunks,
    functionChunks,
    chunksWithSummary,
    chunksWithEmbedding,
    lastCrawledAt,
  };
}

/**
 * Repository for schema chunks and vector search (LanceDB).
 * Stores one table per connection (`chunks_<connectionId>`); supports hybrid search
 * (embedding + full-text) with RRF reranking, and index stats/clear/list.
 */
export class ChunkRepository {
  private conn: Connection | null = null;
  private initPromise: Promise<Connection> | null = null;
  private rrfrerankerPromise: Promise<InstanceType<typeof lancedb.rerankers.RRFReranker>> | null = null;

  /**
   * @param storageUri - Base URI for extension storage; LanceDB path is configurable via `schemasight.lanceDbPath` or defaults to `<storageUri>/lancedb`.
   */
  constructor(private readonly storageUri: vscode.Uri) {}

  private get dbPath(): string {
    const configPath = vscode.workspace.getConfiguration("schemasight").get<string>("lanceDbPath");
    return configPath?.trim() || path.join(this.storageUri.fsPath, "lancedb");
  }

  private async getConnection(): Promise<Connection> {
    if (this.conn) return this.conn;
    if (this.initPromise) return this.initPromise;
    this.initPromise = lancedb.connect(this.dbPath);
    this.conn = await this.initPromise;
    this.initPromise = null;
    return this.conn;
  }

  /**
   * Ensures the LanceDB connection is open. Call once at startup or before first use.
   */
  async initialize(): Promise<void> {
    await this.getConnection();
  }

  /**
   * Replaces all chunks for a connection: drops existing table, creates new one with the given chunks,
   * builds vector index (if enough rows) and FTS index on content.
   * @param connectionId - Connection id (used as table name suffix).
   * @param chunks - Chunks to store (must include embeddings; summary and content required).
   */
  async upsertChunks(connectionId: string, chunks: SchemaChunk[]): Promise<void> {
    if (chunks.length === 0) return;
    const db = await this.getConnection();
    const tableName = tableNameFor(connectionId);
    const embedDim = chunks[0].embedding.length;
    const rows = chunks.map((c) => ({
      id: c.id,
      connectionId: c.connectionId,
      objectType: c.objectType,
      objectName: c.objectName,
      schema: c.schema,
      content: c.content,
      summary: c.summary,
      embedding: Array.from(c.embedding instanceof Float32Array ? c.embedding : c.embedding),
      crawledAt: c.crawledAt,
    }));

    const names = await db.tableNames();
    if (names.includes(tableName)) {
      await db.dropTable(tableName);
    }
    const schema = buildChunksSchema(embedDim);
    await db.createTable(tableName, rows, { schema, mode: "overwrite" });

    const table = await db.openTable(tableName);
    if (chunks.length >= MIN_ROWS_FOR_VECTOR_INDEX) {
      await table.createIndex(EMBEDDING_COLUMN, {
        config: lancedb.Index.ivfPq({ distanceType: "cosine" }),
      });
    }
    await table.createIndex(CONTENT_COLUMN, {
      config: lancedb.Index.fts(),
    });
  }

  /**
   * Returns stored chunks for a connection (no vector search).
   * @param connectionId - Connection id.
   * @param limit - Max rows to return (default 500).
   * @returns List of chunks; empty if no index for this connection.
   */
  async getAllChunks(connectionId: string, limit = 500): Promise<SchemaChunk[]> {
    const ctx = await this.getTableIfExists(connectionId);
    if (!ctx) return [];
    const results = await ctx.table.query().limit(limit).toArray();
    return (results as Record<string, unknown>[]).map(rowToChunk);
  }

  /**
   * Hybrid search: full-text on content + vector similarity, reranked with RRF.
   * @param connectionId - Connection id.
   * @param queryEmbedding - Query vector (same dimension as stored embeddings).
   * @param options - topK, queryText, optional typeFilter.
   * @returns Chunks ordered by relevance (up to topK).
   * @throws {Error} If `options.queryText` is empty.
   */
  async search(
    connectionId: string,
    queryEmbedding: number[],
    options: SearchOptions
  ): Promise<SchemaChunk[]> {
    const { topK, queryText, typeFilter } = options;
    const ctx = await this.getTableIfExists(connectionId);
    if (!ctx) return [];

    const trimmed = queryText.trim();
    if (trimmed.length === 0) {
      throw new Error("search requires non-empty queryText");
    }

    const { table } = ctx;
    const whereClause =
      typeFilter != null && ALLOWED_OBJECT_TYPES.has(typeFilter)
        ? `"objectType" = '${typeFilter}'`
        : undefined;

    if (!this.rrfrerankerPromise) {
      this.rrfrerankerPromise = lancedb.rerankers.RRFReranker.create(60);
    }
    const reranker = await this.rrfrerankerPromise;
    let hybridQuery = table
      .query()
      .fullTextSearch(trimmed, { columns: [CONTENT_COLUMN] })
      .nearestTo(queryEmbedding)
      .column(EMBEDDING_COLUMN)
      .distanceType("cosine")
      .rerank(reranker)
      .limit(topK);
    if (whereClause) hybridQuery = hybridQuery.where(whereClause);
    const results = await hybridQuery.toArray();
    return (results as Record<string, unknown>[]).map(rowToChunk);
  }

  /**
   * Finds a single chunk by object name (schema-qualified or bare).
   * @param connectionId - Connection id.
   * @param name - Object name (e.g. "dbo.MyTable" or "MyTable"); special chars stripped.
   * @returns The matching chunk or null.
   */
  async findByName(connectionId: string, name: string): Promise<SchemaChunk | null> {
    const sanitized = name.trim().replace(/[^a-zA-Z0-9_.]/g, "");
    if (sanitized.length === 0) return null;
    const ctx = await this.getTableIfExists(connectionId);
    if (!ctx) return null;
    if (sanitized.includes(".")) {
      const whereClause = `"objectName" = '${sanitized}'`;
      const results = await ctx.table.query().where(whereClause).limit(1).toArray();
      const row = (results as Record<string, unknown>[])[0];
      return row ? rowToChunk(row) : null;
    }
    const all = await ctx.table.query().limit(500).toArray();
    const rows = all as Record<string, unknown>[];
    const lower = sanitized.toLowerCase();
    const match = rows.find((r) => {
      const on = String(r.objectName);
      return (
        on === sanitized ||
        on.toLowerCase() === lower ||
        on.toLowerCase().endsWith("." + lower)
      );
    });
    return match ? rowToChunk(match) : null;
  }

  /**
   * Deletes the chunk table for a connection (all chunks removed).
   * @param connectionId - Connection id.
   */
  async clearIndex(connectionId: string): Promise<void> {
    const ctx = await this.getTableIfExists(connectionId);
    if (!ctx) return;
    await ctx.db.dropTable(ctx.tableName);
  }

  /**
   * Returns connection ids that have at least one chunk table.
   * @returns Array of connection ids derived from table names.
   */
  async listIndexedConnections(): Promise<string[]> {
    const db = await this.getConnection();
    const names = await db.tableNames();
    const prefix = CHUNKS_TABLE_PREFIX;
    return names
      .filter((n) => n.startsWith(prefix))
      .map((n) => n.slice(prefix.length));
  }

  /**
   * Returns aggregate stats for the connection's chunk table (counts by type, summary/embedding presence, last crawled).
   * @param connectionId - Connection id.
   * @returns Stats object or null if no table for this connection.
   */
  async getIndexStats(connectionId: string): Promise<IndexStats | null> {
    const ctx = await this.getTableIfExists(connectionId);
    if (!ctx) return null;

    const totalChunks = await ctx.table.countRows();
    const rows = await ctx.table
      .query()
      .select(["objectType", "summary", "embedding", "crawledAt"])
      .limit(50_000)
      .toArray();

    const partial = computeStatsFromRows(rows as Record<string, unknown>[]);
    return { totalChunks, ...partial };
  }

  private async getTableIfExists(
    connectionId: string
  ): Promise<{ db: Connection; tableName: string; table: Awaited<ReturnType<Connection["openTable"]>> } | null> {
    const db = await this.getConnection();
    const tableName = tableNameFor(connectionId);
    const names = await db.tableNames();
    if (!names.includes(tableName)) return null;
    const table = await db.openTable(tableName);
    return { db, tableName, table };
  }
}
