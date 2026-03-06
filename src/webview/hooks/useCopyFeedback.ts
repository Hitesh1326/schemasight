import { useState, useCallback } from "react";

/** Duration to show "Copied" state after copying text to clipboard (ms). */
const COPY_FEEDBACK_MS = 2000;

/** Which copy target last triggered feedback (e.g. "chat" or "indexing" row). */
export type CopyFeedbackWhich = "chat" | "indexing";

/**
 * Hook for copy-to-clipboard feedback: tracks which target last copied and exposes a function
 * to copy text and set that state. State resets after {@link COPY_FEEDBACK_MS}.
 *
 * @param resetMs - Optional override for reset delay (default {@link COPY_FEEDBACK_MS}).
 * @returns `{ copiedWhich, copyWithFeedback }` for use in UI (e.g. "Copied" vs "Copy command").
 */
export function useCopyFeedback(resetMs: number = COPY_FEEDBACK_MS) {
  const [copiedWhich, setCopiedWhich] = useState<CopyFeedbackWhich | null>(null);
  const copyWithFeedback = useCallback(
    (which: CopyFeedbackWhich, text: string) => {
      if (!text) return;
      void navigator.clipboard.writeText(text).then(() => {
        setCopiedWhich(which);
        setTimeout(() => setCopiedWhich(null), resetMs);
      });
    },
    [resetMs]
  );
  return { copiedWhich, copyWithFeedback };
}
