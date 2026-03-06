import React from "react";
import { Loader2 } from "lucide-react";

export function ReindexingState() {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-3" role="status" aria-live="polite">
      <Loader2 size={32} className="animate-spin text-vscode-descriptionForeground" aria-hidden />
      <p className="text-sm text-vscode-descriptionForeground">Reindexing schema…</p>
    </div>
  );
}
