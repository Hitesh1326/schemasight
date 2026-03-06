import React from "react";
import { AlertTriangle, Check, Copy, Loader2 } from "lucide-react";
export { CrawlProgressBlock } from "../indexing/CrawlProgressBlock";

/** Recommended model (used for pull command and recommended option). */
export const RECOMMENDED_MODEL = "llama3.1:8b";
export const DEFAULT_PULL_MODEL = RECOMMENDED_MODEL;
/** Value for the "Enter custom model name..." dropdown option. */
export const CUSTOM_MODEL_VALUE = "__custom__";

/** Shared classes for the "Ready · model" success row. */
const READY_ROW_CLASSES =
  "flex items-center justify-center gap-2 py-2 px-3 rounded-md border border-vscode-panel-border bg-vscode-editor-inactiveSelectionBackground/30 w-full";
/** Shared classes for the "Pull required" warning row. */
const PULL_ROW_AMBER_CLASSES =
  "flex flex-wrap items-center justify-center gap-2 py-2.5 px-3 rounded-md border border-amber-500/60 bg-amber-500/10 text-amber-700 dark:text-amber-400 dark:border-amber-400/50 dark:bg-amber-400/10 w-full";
/** Models-to-pull card: 3px amber left accent. */
const MODELS_TO_PULL_CARD_CLASSES =
  "w-full rounded-md border border-vscode-panel-border border-l-[3px] border-l-amber-500 dark:border-l-amber-400 bg-vscode-editor-inactiveSelectionBackground/25 py-3 px-3 flex flex-col gap-3";

/** Derives UI booleans from Ollama status (availability, model chosen, model pulled). */
export function getOllamaDerivedState(props: {
  ollamaAvailable: boolean | null;
  ollamaModel: string | null;
  ollamaModelPulled: boolean | null;
}) {
  const { ollamaAvailable, ollamaModel, ollamaModelPulled } = props;
  const modelChosen = ollamaModel != null && ollamaModel !== "";
  const isOllamaReady =
    ollamaAvailable === true && modelChosen && ollamaModelPulled === true;
  return {
    isCheckingOllama: ollamaAvailable === null,
    modelChosen,
    isOllamaReady,
    needsPull: ollamaAvailable === true && modelChosen && ollamaModelPulled === false,
    ollamaUnavailable: ollamaAvailable === false,
    canCrawl: isOllamaReady,
  };
}

/** Green "Ready" row: check icon + "label · model". */
export function ModelReadyBadge({ label, model }: { label: string; model: string }) {
  return (
    <div className={READY_ROW_CLASSES}>
      <Check size={18} className="text-emerald-600 dark:text-emerald-400 shrink-0" />
      <span className="text-sm text-vscode-foreground">{label} · {model}</span>
    </div>
  );
}

/** Single row inside "Models to pull": label, command, Copy, Pull. */
function ModelPullRow({
  label,
  command,
  copyLabel,
  copied,
  onCopy,
  onPull,
  isPulling,
  disabled,
  showRecommendedBadge,
}: {
  label: string;
  command: string;
  copyLabel: "chat" | "indexing";
  copied: "chat" | "indexing" | null;
  onCopy: (which: "chat" | "indexing", text: string) => void;
  onPull: () => void;
  isPulling: boolean;
  disabled: boolean;
  showRecommendedBadge?: boolean;
}) {
  return (
    <div className="grid grid-cols-[1fr_auto_auto] gap-x-2 gap-y-0.5 items-start w-full">
      <div className="flex flex-col gap-0.5 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-vscode-foreground truncate">
            {label}
          </span>
          {showRecommendedBadge && (
            <span className="shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-500/15 text-emerald-600 dark:text-emerald-400/90">
              Recommended
            </span>
          )}
        </div>
        <code className="text-[11px] font-mono text-vscode-descriptionForeground/80 truncate block bg-transparent">
          {command}
        </code>
      </div>
      <button
        type="button"
        onClick={() => onCopy(copyLabel, command)}
        className="inline-flex items-center justify-center gap-1 min-w-[6.5rem] px-2 py-1.5 rounded text-xs font-medium border border-vscode-input-border bg-transparent text-vscode-foreground hover:bg-vscode-list-hoverBackground transition-colors"
      >
        {copied === copyLabel ? (
          <>
            <Check size={12} className="shrink-0" />
            Copied
          </>
        ) : (
          <>
            <Copy size={12} className="shrink-0" />
            Copy command
          </>
        )}
      </button>
      {!isPulling ? (
        <button
          type="button"
          onClick={onPull}
          disabled={disabled}
          className="inline-flex items-center justify-center min-w-[2.5rem] px-2 py-1.5 rounded text-xs font-medium bg-vscode-button-background text-vscode-button-foreground hover:bg-vscode-button-hoverBackground disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Pull
        </button>
      ) : (
        <span className="inline-flex items-center gap-1 min-w-[2.5rem] px-2 py-1.5 text-xs font-medium text-vscode-descriptionForeground">
          <Loader2 size={12} className="shrink-0 animate-spin" />
          Pulling…
        </span>
      )}
    </div>
  );
}

/** "Models to pull" card: one or more rows with Copy + Pull. */
export function ModelsToPullSection({
  items,
  copied,
  onCopy,
  disabled,
}: {
  items: Array<{
    label: string;
    command: string;
    copyLabel: "chat" | "indexing";
    onPull: () => void;
    isPulling: boolean;
    showRecommendedBadge?: boolean;
  }>;
  copied: "chat" | "indexing" | null;
  onCopy: (which: "chat" | "indexing", text: string) => void;
  disabled: boolean;
}) {
  return (
    <div className={MODELS_TO_PULL_CARD_CLASSES}>
      <div className="flex flex-col gap-3">
        {items.map((item, index) => (
          <div key={item.copyLabel}>
            {index > 0 && (
              <div
                className="border-t border-gray-700/40 dark:border-gray-600/30 pt-3 mb-3"
                role="separator"
                aria-hidden
              />
            )}
            <ModelPullRow
              label={item.label}
              command={item.command}
              copyLabel={item.copyLabel}
              copied={copied}
              onCopy={onCopy}
              onPull={item.onPull}
              isPulling={item.isPulling}
              disabled={disabled}
              showRecommendedBadge={item.showRecommendedBadge}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

/** One-line muted explanation: recommended model and caveat. */
export function ModelsSetupExplanation() {
  return (
    <p className="w-full text-left text-xs text-vscode-descriptionForeground py-1">
      Recommended: {RECOMMENDED_MODEL}. Smaller models may be faster but less accurate.
    </p>
  );
}

/** Banner when Ollama is not running. */
export function OllamaUnavailableBanner() {
  return (
    <div className={PULL_ROW_AMBER_CLASSES}>
      <AlertTriangle size={18} className="shrink-0 opacity-90" />
      <span className="text-xs opacity-90">
        Start Ollama (e.g. <code className="font-mono">ollama serve</code>) and try again.
      </span>
    </div>
  );
}

/** Model selector: heading, dropdown, and custom model input. */
export function ModelSelector({
  ollamaModel,
  selectOptions,
  customModelValue,
  showOtherModel,
  otherModelName,
  isCrawling,
  onModelChange,
  setShowOtherModel,
  setOtherModelName,
  onOtherSubmit,
}: {
  ollamaModel: string | null;
  selectOptions: { value: string; label: string; disabled?: boolean }[];
  customModelValue: string;
  showOtherModel: boolean;
  otherModelName: string;
  isCrawling: boolean;
  onModelChange: (model: string) => void;
  setShowOtherModel: (v: boolean) => void;
  setOtherModelName: (v: string) => void;
  onOtherSubmit: () => void;
}) {
  return (
    <>
      <p className="text-sm font-medium text-vscode-foreground text-left w-full">Choose model</p>
      <div className="w-full flex flex-col gap-2">
        {showOtherModel ? (
          <>
            <input
              type="text"
              value={otherModelName}
              onChange={(e) => setOtherModelName(e.target.value)}
              placeholder="e.g. codellama:latest"
              aria-label="Model name"
              disabled={isCrawling}
              className="w-full px-3 py-2 text-sm bg-vscode-input-background text-vscode-input-foreground border border-vscode-input-border rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
            />
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onOtherSubmit}
                disabled={!otherModelName.trim() || isCrawling}
                className="px-3 py-2 text-sm font-medium rounded-md bg-vscode-button-background text-vscode-button-foreground hover:bg-vscode-button-hoverBackground disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Use this model
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowOtherModel(false);
                  setOtherModelName("");
                }}
                disabled={isCrawling}
                className="text-xs text-vscode-descriptionForeground hover:text-vscode-textLink-foreground hover:underline disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
            </div>
          </>
        ) : (
          <>
            {!ollamaModel && (
              <button
                type="button"
                onClick={() => onModelChange(DEFAULT_PULL_MODEL)}
                disabled={isCrawling}
                className="w-full px-3 py-2 rounded-md text-sm font-medium bg-vscode-button-background text-vscode-button-foreground hover:bg-vscode-button-hoverBackground border border-transparent text-center disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Use recommended ({DEFAULT_PULL_MODEL})
              </button>
            )}
            <select
              value={ollamaModel ?? ""}
              onChange={(e) => {
                const v = e.target.value;
                if (v === customModelValue) {
                  setShowOtherModel(true);
                  return;
                }
                if (v) onModelChange(v);
              }}
              disabled={isCrawling}
              aria-label="Model"
              className={`w-full px-3 py-2 rounded-md text-sm bg-vscode-input-background border border-vscode-input-border disabled:opacity-50 disabled:cursor-not-allowed ${(ollamaModel == null || ollamaModel === "") ? "text-vscode-descriptionForeground" : "text-vscode-input-foreground"}`}
            >
              {selectOptions.map((opt) => (
                <option key={opt.value === customModelValue ? customModelValue : opt.value || "__placeholder__"} value={opt.value} disabled={opt.disabled}>
                  {opt.label}
                </option>
              ))}
            </select>
          </>
        )}
      </div>
    </>
  );
}
