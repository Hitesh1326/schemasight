import React from "react";
import { useEscapeKey } from "../../hooks/useEscapeKey";

export function ClearConfirmModal({
  isOpen,
  onCancel,
  onConfirm,
}: {
  isOpen: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  useEscapeKey(onCancel, isOpen);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="clear-conversation-title"
      onClick={(e) => e.target === e.currentTarget && onCancel()}
    >
      <div
        className="bg-vscode-editor-background border border-vscode-panel-border rounded-lg shadow-xl max-w-sm w-full mx-4 p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="clear-conversation-title" className="text-sm font-semibold text-vscode-foreground mb-2">
          Clear conversation?
        </h2>
        <p className="text-xs text-vscode-descriptionForeground mb-4">This cannot be undone.</p>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-3 py-1.5 rounded text-sm text-vscode-foreground bg-vscode-button-secondaryBackground hover:bg-vscode-button-secondaryHoverBackground"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="px-3 py-1.5 rounded text-sm text-vscode-button-foreground bg-vscode-button-background hover:bg-vscode-button-hoverBackground"
          >
            Clear
          </button>
        </div>
      </div>
    </div>
  );
}
