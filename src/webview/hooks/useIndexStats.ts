import { useState, useCallback, useRef } from "react";
import type { IndexStats, ExtensionToWebviewMessage } from "../../shared/types";
import { postMessage } from "../vscodeApi";

export interface UseIndexStatsReturn {
  indexStats: IndexStats | null;
  indexStatsLoading: boolean;
  requestIndexStats: (connectionId: string) => void;
  clearIndexInfo: () => void;
  handleMessage: (message: ExtensionToWebviewMessage) => void;
}

/**
 * Manages index stats for a single connection. Call handleMessage in your message subscription.
 */
export function useIndexStats(): UseIndexStatsReturn {
  const [indexStats, setIndexStats] = useState<IndexStats | null>(null);
  const [indexStatsRequestedId, setIndexStatsRequestedId] = useState<string | null>(null);
  const indexStatsRequestedIdRef = useRef<string | null>(null);

  const requestIndexStats = useCallback((connectionId: string) => {
    indexStatsRequestedIdRef.current = connectionId;
    setIndexStatsRequestedId(connectionId);
    setIndexStats(null);
    postMessage({ type: "GET_INDEX_STATS", payload: { connectionId } });
  }, []);

  const clearIndexInfo = useCallback(() => {
    indexStatsRequestedIdRef.current = null;
    setIndexStatsRequestedId(null);
    setIndexStats(null);
  }, []);

  const handleMessage = useCallback((message: ExtensionToWebviewMessage) => {
    if (
      message.type === "INDEX_STATS" &&
      message.payload.connectionId === indexStatsRequestedIdRef.current
    ) {
      setIndexStats(message.payload.stats);
      indexStatsRequestedIdRef.current = null;
      setIndexStatsRequestedId(null);
    }
  }, []);

  return {
    indexStats,
    indexStatsLoading: indexStatsRequestedId !== null,
    requestIndexStats,
    clearIndexInfo,
    handleMessage,
  };
}
