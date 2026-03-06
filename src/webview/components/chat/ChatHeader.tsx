import React from "react";
import { Trash2 } from "lucide-react";

export function ChatHeader({
  connectionName,
  onClearClick,
  hasMessages,
}: {
  connectionName: string;
  onClearClick: () => void;
  hasMessages: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-2 border-b border-vscode-panel-border bg-vscode-editorGroupHeader-tabsBackground shrink-0">
      <span className="text-sm text-vscode-foreground truncate min-w-0">Database: {connectionName}</span>
      <button
        type="button"
        onClick={onClearClick}
        disabled={!hasMessages}
        title="Clear conversation"
        aria-label="Clear conversation"
        className="shrink-0 p-1.5 rounded opacity-40 hover:opacity-70 text-vscode-descriptionForeground hover:text-vscode-foreground hover:bg-vscode-toolbar-hoverBackground disabled:opacity-20 disabled:cursor-not-allowed transition-all border-l border-vscode-panel-border pl-3 -ml-1"
      >
        <Trash2 size={16} aria-hidden />
      </button>
    </div>
  );
}
