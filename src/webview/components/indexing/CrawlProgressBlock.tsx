import React from "react";
import type { CrawlProgress } from "../../../shared/types";
import { formatCrawlPhase } from "../../utils/formatCrawlPhase";
import { getProgressPercent } from "../../utils/getProgressPercent";

export function CrawlProgressBlock({ progress }: { progress: CrawlProgress }) {
  const hasProgress = progress.total > 0;
  const percent = getProgressPercent(progress);
  const phaseText = formatCrawlPhase(progress);
  return (
    <div className="w-full mb-2">
      <div className="flex items-baseline justify-between gap-2 mb-1">
        <p
          className="text-sm text-vscode-descriptionForeground truncate min-w-0 flex-1"
          title={phaseText}
        >
          {phaseText}
        </p>
        {hasProgress && (
          <span className="text-xs text-vscode-descriptionForeground shrink-0 tabular-nums">
            {percent}%
          </span>
        )}
      </div>
      {hasProgress && (
        <div
          className="h-1.5 rounded-full w-full overflow-hidden bg-[var(--vscode-widget-border)] opacity-40"
          role="progressbar"
          aria-valuenow={progress.current}
          aria-valuemin={0}
          aria-valuemax={progress.total}
        >
          <div
            className="h-full rounded-full bg-vscode-progressBar-background"
            style={{ width: `${(progress.current / progress.total) * 100}%` }}
          />
        </div>
      )}
    </div>
  );
}
