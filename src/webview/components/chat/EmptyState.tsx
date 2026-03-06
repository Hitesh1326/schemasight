import React from "react";
import { Database } from "lucide-react";

export const SUGGESTED_PROMPTS: string[] = [
  "What is this database about?",
  "Give me a high-level overview of the schema",
  "What are the main areas of this database?",
];

export function EmptyState({
  connectionId,
  isStreaming,
  onSuggestedPrompt,
  suggestedPrompts,
}: {
  connectionId: string | null;
  isStreaming: boolean;
  onSuggestedPrompt: (text: string) => void;
  suggestedPrompts: string[];
}) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 opacity-90">
      <Database size={48} strokeWidth={1.5} className="text-vscode-descriptionForeground" />
      <p className="text-sm text-center text-vscode-descriptionForeground">
        Ask anything about your database schema, tables, or stored procedures.
      </p>
      {connectionId && !isStreaming && (
        <div className="flex flex-wrap justify-center gap-2 max-w-md">
          {suggestedPrompts.map((prompt) => (
            <button
              key={prompt}
              type="button"
              onClick={() => onSuggestedPrompt(prompt)}
              className="px-3 py-1.5 rounded-full text-xs bg-vscode-editor-inactiveSelectionBackground/50 text-vscode-foreground hover:bg-vscode-list-hoverBackground border border-vscode-input-border transition-colors"
            >
              {prompt}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
