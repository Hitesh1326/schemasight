import type { ConnectionRepository } from "../../repositories/ConnectionRepository";
import type { ChunkRepository } from "../../repositories/ChunkRepository";
import type { ExtensionToWebviewMessage } from "../../shared/types";

type PostMessage = (message: ExtensionToWebviewMessage) => void;

export class IndexHandler {
  constructor(
    private readonly chunkRepository: ChunkRepository,
    private readonly connectionRepository: ConnectionRepository
  ) {}

  async handleGetIndexStats(connectionId: string, post: PostMessage): Promise<void> {
    const stats = await this.chunkRepository.getIndexStats(connectionId);
    post({ type: "INDEX_STATS", payload: { connectionId, stats } });
  }

  async handleClearIndex(connectionId: string, post: PostMessage): Promise<void> {
    await this.chunkRepository.clearIndex(connectionId);
    await this.connectionRepository.removeCrawledConnectionId(connectionId);
    const crawledIds = await this.connectionRepository.getCrawledConnectionIds();
    post({ type: "INDEX_CLEARED", payload: { connectionId } });
    post({ type: "CRAWLED_CONNECTION_IDS", payload: crawledIds });
  }
}
