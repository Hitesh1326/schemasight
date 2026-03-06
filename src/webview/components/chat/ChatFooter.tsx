import React, { KeyboardEvent } from "react";
import { Send } from "lucide-react";
import type { ChatThinking } from "../../../shared/types";
import { ContextIndicator } from "./ContextIndicator";

export function ChatFooter({
  messagesLength,
  lastCompletedThinking,
  isStreaming,
  isSummarized,
  isReindexing,
  input,
  setInput,
  onSend,
  onKeyDown,
  connectionId,
}: {
  messagesLength: number;
  lastCompletedThinking: ChatThinking | null;
  isStreaming: boolean;
  isSummarized: boolean;
  isReindexing: boolean;
  input: string;
  setInput: (value: string) => void;
  onSend: () => void;
  onKeyDown: (e: KeyboardEvent<HTMLTextAreaElement>) => void;
  connectionId: string | null;
}) {
  const placeholder = isReindexing
    ? "Reindexing schema…"
    : !connectionId
      ? "Select a connection first…"
      : messagesLength > 0
        ? "Reply…"
        : "Ask about your database…";

  return (
    <div
      className="shrink-0"
      style={{
        background: "var(--vscode-input-background)",
        boxShadow: "0 -4px 12px rgba(0,0,0,0.15)",
      }}
    >
      <div className="p-3 flex flex-col gap-1.5">
        {messagesLength > 0 && !isReindexing && (
          <div className="inline-flex items-center min-h-[18px] gap-0 self-start">
            <ContextIndicator
              usedTokens={lastCompletedThinking?.context?.contextTokens}
              limitTokens={lastCompletedThinking?.context?.contextLimit}
              isStreaming={isStreaming}
            >
              {isSummarized && (
                <span className="inline-flex items-center gap-0.5 shrink-0">
                  <span
                    className="h-3.5 w-px min-w-px bg-vscode-descriptionForeground shrink-0 opacity-70"
                    aria-hidden
                  />
                  <span className="text-[10px] text-vscode-descriptionForeground ml-0.5">
                    Context summarized. Clear chat to start fresh.
                  </span>
                </span>
              )}
            </ContextIndicator>
          </div>
        )}
        <div className="relative flex-1 min-h-[44px]">
          <textarea
            className="w-full min-h-[44px] max-h-[120px] resize-none border border-vscode-input-border bg-vscode-input-background text-vscode-input-foreground text-sm focus:outline-none focus:ring-2 focus:ring-vscode-focusBorder focus:border-transparent overflow-y-auto transition-shadow disabled:opacity-70 disabled:cursor-not-allowed"
            style={{ padding: "10px 48px 10px 12px", borderRadius: "12px" }}
            rows={2}
            placeholder={placeholder}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            disabled={!connectionId || isStreaming || isReindexing}
          />
          <button
            type="button"
            onClick={onSend}
            disabled={!connectionId || isStreaming || isReindexing || !input.trim()}
            title="Send"
            aria-label="Send"
            className={`absolute bottom-2 right-2 w-8 h-8 rounded-lg flex items-center justify-center transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
              input.trim()
                ? "bg-vscode-button-background text-vscode-button-foreground hover:bg-vscode-button-hoverBackground"
                : "bg-vscode-descriptionForeground/30 text-vscode-descriptionForeground"
            }`}
          >
            <Send size={16} aria-hidden />
          </button>
        </div>
      </div>
    </div>
  );
}
