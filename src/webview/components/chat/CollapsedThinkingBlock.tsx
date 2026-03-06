import React, { useState } from "react";
import { Sparkles, Check, ChevronDown, ChevronRight } from "lucide-react";
import type { ChatThinking } from "../../../shared/types";
import { STEPS_ORDER, STEP_LABELS, stepDetailText } from "../../utils/thinkingUtils";

export function CollapsedThinkingBlock({ thinking }: { thinking: ChatThinking }) {
  const [expanded, setExpanded] = useState(false);
  const ctx = thinking.context;
  const thoughtLabel =
    ctx && ctx.totalElapsedMs != null
      ? `How this was answered (${(ctx.totalElapsedMs / 1000).toFixed(1)}s)`
      : ctx && ctx.searchMs != null
        ? `How this was answered (${(ctx.searchMs / 1000).toFixed(1)}s)`
        : "How this was answered";

  return (
    <div className="flex justify-start mb-2">
      <div className="max-w-[85%] rounded-xl py-2 px-3 bg-vscode-editor-inactiveSelectionBackground/20">
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="flex items-center gap-2 w-full text-left focus:outline-none focus:ring-1 focus:ring-vscode-focusBorder rounded"
          aria-expanded={expanded}
        >
          {expanded ? (
            <ChevronDown size={12} className="text-vscode-descriptionForeground/80 shrink-0" aria-hidden />
          ) : (
            <ChevronRight size={12} className="text-vscode-descriptionForeground/80 shrink-0" aria-hidden />
          )}
          <Sparkles size={12} className="text-vscode-descriptionForeground/80 shrink-0" aria-hidden />
          <span className="text-[11px] text-vscode-descriptionForeground/90">{thoughtLabel}</span>
        </button>
        {expanded && (
          <div className="mt-2 pl-4 border-l-2 border-vscode-descriptionForeground/20 space-y-2">
            {STEPS_ORDER.map((step) => {
              const label =
                step === "generating" && thinking.model
                  ? `${STEP_LABELS[step]} with ${thinking.model}`
                  : STEP_LABELS[step];
              const detail = stepDetailText(step, thinking);
              return (
                <div key={step} className="flex flex-col gap-0.5">
                  <div className="flex items-center gap-2">
                    <Check size={12} className="shrink-0 text-vscode-descriptionForeground/90" aria-hidden />
                    <span className="text-[11px] text-vscode-descriptionForeground/90">{label}</span>
                  </div>
                  {detail && (
                    <p className="ml-5 text-[10px] text-vscode-descriptionForeground/60 leading-relaxed">{detail}</p>
                  )}
                  {step === "context" && ctx && ctx.objectNames.length > 0 && (
                    <p className="ml-5 text-[10px] text-vscode-descriptionForeground/50 leading-relaxed break-words">
                      {ctx.objectNames.join(", ")}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
