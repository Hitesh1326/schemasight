import React from "react";
import { Database, Loader2 } from "lucide-react";
import type { CrawlProgress } from "../../../shared/types";
import {
  RECOMMENDED_MODEL,
  DEFAULT_PULL_MODEL,
  CUSTOM_MODEL_VALUE,
  getOllamaDerivedState,
  CrawlProgressBlock,
  ModelReadyBadge,
  ModelSelector,
  ModelsSetupExplanation,
  ModelsToPullSection,
  OllamaUnavailableBanner,
} from "../ollama/OllamaModelSetup";
import { useCopyFeedback } from "../../hooks/useCopyFeedback";
import { useOllamaModelForm } from "../../hooks/useOllamaModelForm";

export interface ReindexCardProps {
  connectionName: string;
  onReindex: () => void;
  onCancel: () => void;
  isCrawling: boolean;
  crawlProgress: CrawlProgress | null;
  onCancelCrawl?: () => void;
  ollamaAvailable: boolean | null;
  ollamaModel: string | null;
  ollamaModelPulled: boolean | null;
  ollamaModels: string[];
  onModelChange: (model: string) => void;
  onCheckOllama?: () => void;
  onPullModel: (model: string) => void;
  pullingModel: string | null;
}

/**
 * Card shown when user chose "Re-index": choose model, then Re-index or Back to chat.
 */
export function ReindexCard({
  connectionName,
  onReindex,
  onCancel,
  isCrawling,
  crawlProgress,
  onCancelCrawl,
  ollamaAvailable,
  ollamaModel,
  ollamaModelPulled,
  ollamaModels,
  onModelChange,
  onCheckOllama,
  onPullModel,
  pullingModel,
}: ReindexCardProps) {
  const { copiedWhich, copyWithFeedback } = useCopyFeedback();

  const derived = getOllamaDerivedState({ ollamaAvailable, ollamaModel, ollamaModelPulled });
  const { isCheckingOllama, modelChosen, isOllamaReady, needsPull, ollamaUnavailable, canCrawl } = derived;

  const {
    showOtherModel,
    otherModelName,
    setShowOtherModel,
    setOtherModelName,
    handleOtherSubmit,
    pullCommand,
    isPulling,
    selectOptions,
  } = useOllamaModelForm({ ollamaModel, ollamaModels, pullingModel, onModelChange });

  const showCheckAgain = (needsPull || ollamaUnavailable) && !!onCheckOllama;

  return (
    <div className="flex flex-1 min-h-0 items-center justify-center p-6">
      <div className="w-full max-w-xl rounded-lg border border-vscode-panel-border bg-vscode-editor-inactiveSelectionBackground/40 shadow-sm p-8 flex flex-col items-center text-center">
        <div className="mb-4 text-vscode-descriptionForeground opacity-80" aria-hidden>
          <Database size={64} strokeWidth={1.5} className="mx-auto" />
        </div>
        <h1 className="text-base font-semibold text-vscode-foreground mb-1 text-center">
          Re-index
        </h1>
        <p className="text-sm text-vscode-descriptionForeground mb-4 text-center break-all">
          {connectionName}
        </p>

        <div className="w-full space-y-2 mb-5 flex flex-col items-center">
          {isCheckingOllama && (
            <p className="text-sm text-vscode-descriptionForeground text-center">Checking Ollama…</p>
          )}
          {ollamaUnavailable && !isCheckingOllama && <OllamaUnavailableBanner />}
          {ollamaAvailable === true && (
            <>
              <ModelsSetupExplanation />
              <ModelSelector
                ollamaModel={ollamaModel}
                selectOptions={selectOptions}
                customModelValue={CUSTOM_MODEL_VALUE}
                showOtherModel={showOtherModel}
                otherModelName={otherModelName}
                isCrawling={isCrawling}
                onModelChange={onModelChange}
                setShowOtherModel={setShowOtherModel}
                setOtherModelName={setOtherModelName}
                onOtherSubmit={handleOtherSubmit}
              />
              {modelChosen && isOllamaReady && (
                <ModelReadyBadge label="Ready" model={ollamaModel!} />
              )}
              {needsPull && (
                <ModelsToPullSection
                  items={[
                    {
                      label: ollamaModel ?? DEFAULT_PULL_MODEL,
                      command: pullCommand,
                      copyLabel: "chat" as const,
                      onPull: () => ollamaModel && onPullModel(ollamaModel),
                      isPulling,
                      showRecommendedBadge: ollamaModel === RECOMMENDED_MODEL,
                    },
                  ]}
                  copied={copiedWhich}
                  onCopy={copyWithFeedback}
                  disabled={isCrawling}
                />
              )}
            </>
          )}
        </div>

        {isCrawling ? (
          <>
            {crawlProgress && <CrawlProgressBlock progress={crawlProgress} />}
            <div className="flex items-center justify-center gap-2 mb-2 text-sm text-vscode-descriptionForeground">
              <Loader2 size={16} className="shrink-0 animate-spin" aria-hidden />
              <span>Indexing in progress…</span>
              {onCancelCrawl && (
                <button
                  type="button"
                  onClick={onCancelCrawl}
                  className="ml-1 text-xs hover:text-vscode-foreground hover:underline focus:outline-none transition-colors"
                >
                  Cancel
                </button>
              )}
            </div>
          </>
        ) : (
          <div className="w-full flex flex-col items-center gap-3 mb-2">
            <button
              type="button"
              onClick={onReindex}
              disabled={!canCrawl}
              title={!canCrawl ? "Choose and pull a model first" : undefined}
              className="w-full max-w-sm px-5 py-2.5 rounded-md text-sm font-medium bg-vscode-button-background text-vscode-button-foreground hover:bg-vscode-button-hoverBackground disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-vscode-button-background border border-transparent"
            >
              Re-index
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="text-xs text-vscode-descriptionForeground hover:text-vscode-textLink-foreground hover:underline focus:outline-none transition-colors"
            >
              Back to chat
            </button>
          </div>
        )}

        {showCheckAgain && onCheckOllama && (
          <button
            type="button"
            onClick={onCheckOllama}
            className="text-xs text-vscode-descriptionForeground hover:text-vscode-textLink-foreground hover:underline focus:outline-none mt-2"
          >
            Check again
          </button>
        )}
      </div>
    </div>
  );
}
