import React, { useState } from "react";
import { Sparkles, Check, Loader2, ChevronDown, ChevronRight } from "lucide-react";
import type { ChatThinking } from "../../../shared/types";
import { STEPS_ORDER, STEP_LABELS, stepDetailText } from "../../utils/thinkingUtils";

export function ThinkingBlock({
  thinking,
  streamedChunkCount = 0,
}: {
  thinking: ChatThinking;
  streamedChunkCount?: number;
}) {
  const [objectsExpanded, setObjectsExpanded] = useState(false);
  const currentIndex = STEPS_ORDER.indexOf(thinking.step);
  const ctx = thinking.context;

  return (
    <div className="flex justify-start mb-2" role="status" aria-live="polite" aria-label="Assistant is thinking">
      <div className="max-w-[85%] rounded-xl py-2.5 px-3 bg-vscode-editor-inactiveSelectionBackground/25">
        <div className="flex items-center gap-2 mb-2 thinking-pulse">
          <Sparkles size={12} className="text-vscode-descriptionForeground/80 shrink-0" aria-hidden />
          <span className="text-[11px] text-vscode-descriptionForeground/90 tracking-wide uppercase">How I'm answering</span>
        </div>

        <div className="space-y-2">
          {STEPS_ORDER.map((step, i) => {
            const isDone = i < currentIndex;
            const isCurrent = i === currentIndex;
            const detail = stepDetailText(step, thinking, streamedChunkCount);
            const showDetail = (isDone || isCurrent) && detail;
            const showObjectList =
              step === "context" && ctx && ctx.objectNames.length > 0 && (isDone || isCurrent);
            const label =
              step === "generating" && thinking.model
                ? `${STEP_LABELS[step]} with ${thinking.model}`
                : STEP_LABELS[step];
            return (
              <div
                key={step}
                className={`rounded px-1.5 -mx-1.5 transition-colors ${
                  isCurrent ? "bg-vscode-list-activeSelectionBackground/20" : ""
                }`}
              >
                <div className="flex items-center gap-2 min-h-[20px]">
                  <span className="w-3.5 h-3.5 flex items-center justify-center shrink-0 text-vscode-descriptionForeground/90">
                    {isDone && <Check size={12} strokeWidth={2.5} aria-hidden />}
                    {isCurrent && (
                      <Loader2 size={12} className="animate-spin text-vscode-foreground/80" aria-label="Loading" />
                    )}
                    {!isDone && !isCurrent && (
                      <span className="w-1.5 h-1.5 rounded-full bg-vscode-descriptionForeground/40" aria-hidden />
                    )}
                  </span>
                  <span
                    className={`text-[11px] ${isCurrent ? "text-vscode-foreground" : "text-vscode-descriptionForeground/90"}`}
                  >
                    {label}{isCurrent ? "…" : ""}
                  </span>
                </div>
                {showDetail && (
                  <p className="ml-5 mt-0.5 text-[10px] text-vscode-descriptionForeground/70 leading-relaxed">
                    {detail}
                  </p>
                )}
                {showObjectList && (
                  <div className="ml-5 mt-1">
                    <button
                      type="button"
                      onClick={() => setObjectsExpanded((e) => !e)}
                      className="flex items-center gap-1 text-[10px] text-vscode-descriptionForeground/60 hover:text-vscode-descriptionForeground/90 focus:outline-none focus:underline"
                      aria-expanded={objectsExpanded}
                    >
                      {objectsExpanded ? (
                        <ChevronDown size={10} aria-hidden />
                      ) : (
                        <ChevronRight size={10} aria-hidden />
                      )}
                      Objects ({ctx!.totalInIndex != null ? `${ctx!.chunksUsed} of ${ctx!.totalInIndex}` : ctx!.chunksUsed})
                    </button>
                    {objectsExpanded && (
                      <p className="mt-1 text-[10px] text-vscode-descriptionForeground/50 leading-relaxed break-words">
                        {ctx!.objectNames.join(", ")}
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
