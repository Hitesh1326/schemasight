import type { CrawlProgress } from "../../shared/types";

export function getProgressPercent(progress: CrawlProgress): number {
  if (progress.total <= 0) return 0;
  return Math.round((progress.current / progress.total) * 100);
}
