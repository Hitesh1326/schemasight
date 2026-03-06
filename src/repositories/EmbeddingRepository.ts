import * as vscode from "vscode";

const DEFAULT_MODEL = "Xenova/all-MiniLM-L6-v2";
const POOLING_OPTIONS = { pooling: "mean" as const, normalize: true };

type FeatureExtractionPipeline = (text: string | string[], options: { pooling: "mean"; normalize: boolean }) => Promise<{ data: Float32Array; dims: number[] }>;

/**
 * Repository for text embeddings via Transformers.js (e.g. all-MiniLM-L6-v2).
 * Model name from VS Code config (`schemasight.embeddingModel`). Lazy-initializes on first embed; use `initialize()` to preload.
 */
export class EmbeddingRepository {
  private pipelineInstance: FeatureExtractionPipeline | null = null;
  private initPromise: Promise<void> | null = null;

  private get modelName(): string {
    return vscode.workspace
      .getConfiguration("schemasight")
      .get("embeddingModel", DEFAULT_MODEL);
  }

  /**
   * Loads the feature-extraction pipeline. Call before embed/embedBatch or to preload.
   */
  async initialize(): Promise<void> {
    await this.ensurePipeline();
  }

  private async ensurePipeline(): Promise<FeatureExtractionPipeline> {
    if (this.pipelineInstance) return this.pipelineInstance;
    if (this.initPromise) {
      await this.initPromise;
      return this.pipelineInstance!;
    }
    this.initPromise = (async () => {
      const { pipeline } = await import("@xenova/transformers");
      const pipe = await pipeline("feature-extraction", this.modelName);
      this.pipelineInstance = pipe as FeatureExtractionPipeline;
    })();
    await this.initPromise;
    this.initPromise = null;
    return this.pipelineInstance!;
  }

  /**
   * Embeds a single text into a float vector (dimension depends on model, e.g. 384 for MiniLM-L6).
   * @param text - Input string to embed.
   * @returns One embedding vector as array of numbers.
   */
  async embed(text: string): Promise<number[]> {
    const pipe = await this.ensurePipeline();
    const output = await pipe(text, POOLING_OPTIONS);
    return this.tensorToVector(output);
  }

  /**
   * Embeds multiple texts in one forward pass (more efficient than repeated embed).
   * @param texts - Input strings; empty array returns [].
   * @returns Array of embedding vectors, one per input.
   */
  async embedBatch(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    const pipe = await this.ensurePipeline();
    const output = await pipe(texts, POOLING_OPTIONS);
    return this.tensorToVectors(output);
  }

  private tensorToVector(tensor: { data: Float32Array; dims: number[] }): number[] {
    return Array.from(tensor.data);
  }

  private tensorToVectors(tensor: { data: Float32Array; dims: number[] }): number[][] {
    const dims = tensor.dims;
    const data = tensor.data;
    if (dims.length === 1) {
      return [Array.from(data)];
    }
    const [batchSize, embedDim] = dims;
    const out: number[][] = [];
    for (let i = 0; i < batchSize; i++) {
      const start = i * embedDim;
      out.push(Array.from(data.slice(start, start + embedDim)));
    }
    return out;
  }
}
