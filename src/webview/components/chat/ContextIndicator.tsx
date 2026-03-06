import React from "react";
import { Loader2 } from "lucide-react";
import { formatTokenCount } from "../../utils/thinkingUtils";

export function ContextIndicator({
  usedTokens,
  limitTokens,
  isStreaming = false,
  children,
}: {
  usedTokens?: number;
  limitTokens?: number;
  isStreaming?: boolean;
  children?: React.ReactNode;
}) {
  const used = usedTokens ?? 0;
  const limit = limitTokens ?? 0;
  const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  const hasData = used > 0 || limit > 0;
  const label =
    used > 0 && limit > 0
      ? `Context: ${formatTokenCount(used)} / ${formatTokenCount(limit)} (${pct}%)`
      : used > 0
        ? `Context: ${formatTokenCount(used)} / —`
        : "Context: — / — (—)";

  if (isStreaming && !hasData) {
    return (
      <div className="flex justify-start items-center gap-2 min-h-[18px] w-fit shrink-0" aria-busy="true">
        <Loader2 size={10} className="animate-spin text-vscode-descriptionForeground shrink-0" aria-hidden />
        <span className="text-[10px] text-vscode-descriptionForeground">Context: …</span>
        {children}
      </div>
    );
  }

  return (
    <div className="flex justify-start items-center gap-2 min-h-[18px] w-fit shrink-0">
      <span className="text-[10px] text-vscode-descriptionForeground shrink-0">{label}</span>
      {children}
      <div
        className="w-14 h-[2px] shrink-0 rounded-full bg-vscode-descriptionForeground/20 overflow-hidden"
        aria-hidden
      >
        <div
          className="h-full bg-vscode-descriptionForeground/40 rounded-full transition-[width]"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
