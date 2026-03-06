import { randomUUID } from "node:crypto";
import {
  DatabaseSchema,
  SchemaChunk,
  CrawlProgress,
  TableMeta,
  ViewMeta,
  StoredProcedureMeta,
  FunctionMeta,
  SpParameterMeta,
} from "../../shared/types";
import type { OllamaRepository } from "../../repositories/OllamaRepository";
import type { PromptBuilder } from "../../llm/PromptBuilder";
import type { EmbeddingRepository } from "../../repositories/EmbeddingRepository";
import type { ChunkRepository } from "../../repositories/ChunkRepository";

type ProgressCallback = (progress: CrawlProgress) => void;

const SUMMARIZE_CONCURRENCY = 5;
const EMBED_BATCH_SIZE = 32;

/**
 * Orchestrates the indexing pipeline: schema → chunks → summarize (Ollama) → embed → store.
 * Builds one chunk per table, view, stored procedure, and function; summarizes with limited concurrency;
 * embeds in batches; upserts into the chunk repository. Reports progress for UI and respects AbortSignal.
 */
export class Indexer {
  /**
   * @param ollamaRepository - For summarizing chunk content.
   * @param promptBuilder - For buildSummarizationPrompt (object type, name, content).
   * @param embeddingRepository - For embedBatch on chunk summaries.
   * @param chunkRepository - For upsertChunks (persists chunks and builds vector/FTS indexes).
   */
  constructor(
    private readonly ollamaRepository: OllamaRepository,
    private readonly promptBuilder: PromptBuilder,
    private readonly embeddingRepository: EmbeddingRepository,
    private readonly chunkRepository: ChunkRepository
  ) {}

  /**
   * Indexes a full database schema: builds chunks, summarizes via Ollama, embeds, and upserts.
   * Progress is reported for each phase (summarizing, embedding, storing). Cancellation via signal throws AbortError.
   * @param schema - Crawled schema (tables, views, stored procedures, functions).
   * @param onProgress - Callback for progress updates (phase, current, total, currentObject).
   * @param signal - Optional AbortSignal; when aborted, throws DOMException with name "AbortError".
   */
  async index(schema: DatabaseSchema, onProgress: ProgressCallback, signal?: AbortSignal): Promise<void> {
    const throwIfAborted = () => {
      if (signal?.aborted) throw new DOMException("Crawl cancelled", "AbortError");
    };

    const chunks = this.buildChunksFromSchema(schema);
    if (chunks.length === 0) {
      onProgress({ connectionId: schema.connectionId, phase: "storing", current: 0, total: 1 });
      return;
    }

    await this.summarizeChunks(chunks, schema.connectionId, onProgress, signal);
    await this.embedChunks(chunks, schema.connectionId, onProgress, throwIfAborted);

    throwIfAborted();
    onProgress({ connectionId: schema.connectionId, phase: "storing", current: 1, total: 1 });
    await this.chunkRepository.upsertChunks(schema.connectionId, chunks);
  }

  private buildChunksFromSchema(schema: DatabaseSchema): SchemaChunk[] {
    const { connectionId, crawledAt } = schema;
    const chunks: SchemaChunk[] = [];
    for (const table of schema.tables) {
      chunks.push(...this.chunkTable(connectionId, table, crawledAt));
    }
    for (const view of schema.views) {
      chunks.push(...this.chunkView(connectionId, view, crawledAt));
    }
    for (const sp of schema.storedProcedures) {
      chunks.push(...this.chunkSp(connectionId, sp, crawledAt));
    }
    for (const fn of schema.functions) {
      chunks.push(...this.chunkFunction(connectionId, fn, crawledAt));
    }
    return chunks;
  }

  private async summarizeChunks(
    chunks: SchemaChunk[],
    connectionId: string,
    onProgress: ProgressCallback,
    signal?: AbortSignal
  ): Promise<void> {
    const throwIfAborted = () => {
      if (signal?.aborted) throw new DOMException("Crawl cancelled", "AbortError");
    };
    const total = chunks.length;
    let completed = 0;
    const summarizeOne = async (i: number): Promise<void> => {
      throwIfAborted();
      const chunk = chunks[i];
      const prompt = this.promptBuilder.buildSummarizationPrompt(
        chunk.objectType,
        `${chunk.schema}.${chunk.objectName}`,
        chunk.content
      );
      chunk.summary = await this.ollamaRepository.summarize(prompt, signal);
      completed++;
      onProgress({
        connectionId,
        phase: "summarizing",
        current: completed,
        total,
        currentObject: `${chunk.schema}.${chunk.objectName}`,
      });
    };
    const queue = chunks.map((_, i) => i);
    const workers = Math.min(SUMMARIZE_CONCURRENCY, queue.length);
    const runWorker = async (): Promise<void> => {
      while (queue.length > 0) {
        throwIfAborted();
        const i = queue.shift()!;
        await summarizeOne(i);
      }
    };
    await Promise.all(Array.from({ length: workers }, () => runWorker()));
  }

  private async embedChunks(
    chunks: SchemaChunk[],
    connectionId: string,
    onProgress: ProgressCallback,
    throwIfAborted: () => void
  ): Promise<void> {
    const total = chunks.length;
    for (let offset = 0; offset < chunks.length; offset += EMBED_BATCH_SIZE) {
      throwIfAborted();
      onProgress({
        connectionId,
        phase: "embedding",
        current: Math.min(offset + EMBED_BATCH_SIZE, chunks.length),
        total,
        currentObject: undefined,
      });
      const batch = chunks.slice(offset, offset + EMBED_BATCH_SIZE);
      const summaries = batch.map((c) => c.summary);
      const embeddings = await this.embeddingRepository.embedBatch(summaries);
      batch.forEach((chunk, j) => {
        chunk.embedding = embeddings[j];
      });
    }
  }

  private createChunk(
    connectionId: string,
    objectType: SchemaChunk["objectType"],
    objectName: string,
    schema: string,
    content: string,
    crawledAt: string
  ): SchemaChunk {
    return {
      id: randomUUID(),
      connectionId,
      objectType,
      objectName,
      schema,
      content,
      summary: "",
      embedding: [],
      crawledAt,
    };
  }

  private chunkTable(
    connectionId: string,
    table: TableMeta,
    crawledAt: string
  ): SchemaChunk[] {
    const lines: string[] = [];
    lines.push(`Table ${table.schema}.${table.name}`);
    const colParts = table.columns.map((c) => {
      let s = `${c.name} (${c.dataType}${c.nullable ? ", nullable" : ""})`;
      if (c.isPrimaryKey) s += " PK";
      if (c.isForeignKey && c.referencedTable) s += ` FK -> ${c.referencedTable}.${c.referencedColumn ?? "?"}`;
      return s;
    });
    lines.push("Columns: " + colParts.join("; "));
    const content = lines.join("\n");
    const objectName = `${table.schema}.${table.name}`;
    return [this.createChunk(connectionId, "table", objectName, table.schema, content, crawledAt)];
  }

  private chunkView(connectionId: string, view: ViewMeta, crawledAt: string): SchemaChunk[] {
    const colParts = view.columns.map((c) => `${c.name} (${c.dataType}${c.nullable ? ", nullable" : ""})`);
    const content = `View ${view.schema}.${view.name}\nColumns: ${colParts.join("; ")}\n\nDefinition:\n${view.definition}`;
    const objectName = `${view.schema}.${view.name}`;
    return [this.createChunk(connectionId, "view", objectName, view.schema, content, crawledAt)];
  }

  private chunkSp(
    connectionId: string,
    sp: StoredProcedureMeta,
    crawledAt: string
  ): SchemaChunk[] {
    return this.chunkProcedureLike(
      "stored_procedure",
      "Stored procedure",
      sp.schema,
      sp.name,
      sp.definition,
      sp.parameters,
      connectionId,
      crawledAt
    );
  }

  private chunkFunction(
    connectionId: string,
    fn: FunctionMeta,
    crawledAt: string
  ): SchemaChunk[] {
    return this.chunkProcedureLike(
      "function",
      "Function",
      fn.schema,
      fn.name,
      fn.definition,
      fn.parameters,
      connectionId,
      crawledAt
    );
  }

  private chunkProcedureLike(
    objectType: "stored_procedure" | "function",
    label: string,
    schema: string,
    name: string,
    definition: string,
    parameters: SpParameterMeta[],
    connectionId: string,
    crawledAt: string
  ): SchemaChunk[] {
    const paramStr =
      parameters.length > 0
        ? parameters.map((p) => `${p.name} (${p.dataType}, ${p.direction})`).join(", ")
        : "none";
    const objectName = `${schema}.${name}`;
    const content = `${label} ${objectName}\nParameters: ${paramStr}\n\nDefinition:\n${definition}`;
    return [this.createChunk(connectionId, objectType, objectName, schema, content, crawledAt)];
  }
}
