import { useState, useEffect, useCallback } from "react";
import { DbConnectionConfig, CrawlProgress } from "../../shared/types";
import { postMessage, onMessage } from "../vscodeApi";

/** Result of an add-connection attempt (test then add). */
export type AddConnectionResult = { success: boolean; error?: string } | null;

/** Return type of useConnections: connection list, crawl state, and actions. */
interface UseConnectionsReturn {
  connections: DbConnectionConfig[];
  crawledConnectionIds: string[];
  crawlProgress: CrawlProgress | null;
  addConnection: (config: DbConnectionConfig & { password: string }) => void;
  addConnectionPending: boolean;
  addConnectionResult: AddConnectionResult;
  clearAddConnectionResult: () => void;
  removeConnection: (id: string) => void;
  testConnection: (id: string) => void;
  crawlSchema: (id: string) => void;
  cancelCrawl: (connectionId: string) => void;
}

/**
 * Connection list and crawl state driven by extension messages. On mount, requests
 * GET_CONNECTIONS and subscribes to connection/crawl messages.
 * Index stats are managed separately by useIndexStats.
 */
export function useConnections(): UseConnectionsReturn {
  const [connections, setConnections] = useState<DbConnectionConfig[]>([]);
  const [crawledConnectionIds, setCrawledConnectionIds] = useState<string[]>([]);
  const [crawlProgress, setCrawlProgress] = useState<CrawlProgress | null>(null);
  const [addConnectionPending, setAddConnectionPending] = useState(false);
  const [addConnectionResult, setAddConnectionResult] = useState<AddConnectionResult>(null);

  useEffect(() => {
    postMessage({ type: "GET_CONNECTIONS" });

    const unsubscribe = onMessage((message) => {
      switch (message.type) {
        case "CONNECTIONS_LIST":
          setConnections(message.payload);
          break;
        case "CONNECTION_ADDED":
          setConnections((prev) => [...prev, message.payload]);
          break;
        case "ADD_CONNECTION_RESULT":
          setAddConnectionResult(message.payload);
          setAddConnectionPending(false);
          break;
        case "CONNECTION_REMOVED":
          setConnections((prev) => prev.filter((c) => c.id !== message.payload.id));
          setCrawledConnectionIds((prev) => prev.filter((id) => id !== message.payload.id));
          break;
        case "CRAWLED_CONNECTION_IDS":
          setCrawledConnectionIds(message.payload);
          break;
        case "CRAWL_PROGRESS":
          setCrawlProgress(message.payload);
          break;
        case "CRAWL_COMPLETE":
        case "CRAWL_CANCELLED":
        case "CRAWL_ERROR":
          setCrawlProgress(null);
          break;
      }
    });

    return unsubscribe;
  }, []);

  const addConnection = useCallback((config: DbConnectionConfig & { password: string }) => {
    setAddConnectionResult(null);
    setAddConnectionPending(true);
    postMessage({ type: "ADD_CONNECTION", payload: config });
  }, []);

  const clearAddConnectionResult = useCallback(() => {
    setAddConnectionResult(null);
  }, []);

  const removeConnection = useCallback((id: string) => {
    postMessage({ type: "REMOVE_CONNECTION", payload: { id } });
  }, []);

  const testConnection = useCallback((id: string) => {
    postMessage({ type: "TEST_CONNECTION", payload: { id } });
  }, []);

  const crawlSchema = useCallback((id: string) => {
    postMessage({ type: "CRAWL_SCHEMA", payload: { id } });
  }, []);

  const cancelCrawl = useCallback((connectionId: string) => {
    postMessage({ type: "CRAWL_CANCEL", payload: { connectionId } });
  }, []);

  return {
    connections,
    crawledConnectionIds,
    crawlProgress,
    addConnection,
    addConnectionPending,
    addConnectionResult,
    clearAddConnectionResult,
    removeConnection,
    testConnection,
    crawlSchema,
    cancelCrawl,
  };
}
