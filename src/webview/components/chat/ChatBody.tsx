import React from "react";
import type { ChatMessage, ChatThinking } from "../../../shared/types";
import { MessageBubble } from "./MessageBubble";
import { ThinkingBlock } from "./ThinkingBlock";
import { CollapsedThinkingBlock } from "./CollapsedThinkingBlock";
import { EmptyState, SUGGESTED_PROMPTS } from "./EmptyState";
import { ReindexingState } from "./ReindexingState";

export function ChatBody({
  messages,
  isStreaming,
  isReindexing,
  thinking,
  showThinkingBlock,
  lastCompletedThinking,
  streamedChunkCount,
  connectionId,
  onSuggestedPrompt,
  bottomRef,
}: {
  messages: ChatMessage[];
  isStreaming: boolean;
  isReindexing: boolean;
  thinking: ChatThinking | null;
  showThinkingBlock: boolean;
  lastCompletedThinking: ChatThinking | null;
  streamedChunkCount: number;
  connectionId: string | null;
  onSuggestedPrompt: (text: string) => void;
  bottomRef: React.RefObject<HTMLDivElement | null>;
}) {
  const ref = bottomRef as React.RefObject<HTMLDivElement>;

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4">
      {messages.length === 0 && isReindexing && <ReindexingState />}
      {messages.length === 0 && !isReindexing && (
        <EmptyState
          connectionId={connectionId}
          isStreaming={isStreaming}
          onSuggestedPrompt={onSuggestedPrompt}
          suggestedPrompts={SUGGESTED_PROMPTS}
        />
      )}
      {messages.map((msg, i) => (
        <MessageBubble key={`${i}-${msg.timestamp}`} message={msg} />
      ))}
      {isStreaming && thinking && showThinkingBlock && (
        <ThinkingBlock thinking={thinking} streamedChunkCount={streamedChunkCount} />
      )}
      {!isStreaming && lastCompletedThinking && (
        <CollapsedThinkingBlock thinking={lastCompletedThinking} />
      )}
      {isStreaming && !showThinkingBlock && (
        <div className="flex gap-1 pl-2">
          <span className="w-1.5 h-1.5 rounded-full bg-current animate-bounce [animation-delay:0ms]" />
          <span className="w-1.5 h-1.5 rounded-full bg-current animate-bounce [animation-delay:150ms]" />
          <span className="w-1.5 h-1.5 rounded-full bg-current animate-bounce [animation-delay:300ms]" />
        </div>
      )}
      <div ref={ref} />
    </div>
  );
}
