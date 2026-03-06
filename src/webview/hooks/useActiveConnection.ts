import { useMemo } from "react";
import type { DbConnectionConfig, CrawlProgress } from "../../shared/types";
import { formatConnectionName } from "../utils/formatConnectionName";

export interface UseActiveConnectionReturn {
  activeConnection: DbConnectionConfig | null;
  activeConnectionName: string;
  isActiveCrawled: boolean;
  isActiveCrawling: boolean;
}

export function useActiveConnection(
  activeConnectionId: string | null,
  connections: DbConnectionConfig[],
  crawledConnectionIds: string[],
  crawlProgress: CrawlProgress | null
): UseActiveConnectionReturn {
  const activeConnection = useMemo(
    () =>
      activeConnectionId ? connections.find((c) => c.id === activeConnectionId) ?? null : null,
    [activeConnectionId, connections]
  );

  const activeConnectionName = useMemo(
    () => formatConnectionName(activeConnection),
    [activeConnection]
  );

  const isActiveCrawled =
    activeConnectionId !== null && crawledConnectionIds.includes(activeConnectionId);
  const isActiveCrawling =
    crawlProgress !== null && crawlProgress.connectionId === activeConnectionId;

  return { activeConnection, activeConnectionName, isActiveCrawled, isActiveCrawling };
}
