import React, { useRef, useEffect, useState, useCallback, KeyboardEvent } from "react";
import { ChatMessage, CrawlProgress, ChatThinking } from "../../../shared/types";
import { IndexFirstCard } from "../indexing/IndexFirstCard";
import { ReindexCard } from "../indexing/ReindexCard";
import { ReindexingBanner } from "../indexing/ReindexingBanner";
import { ChatHeader } from "./ChatHeader";
import { ChatBody } from "./ChatBody";
import { ChatFooter } from "./ChatFooter";
import { ClearConfirmModal } from "./ClearConfirmModal";

interface ChatPanelProps {
  messages: ChatMessage[];
  isStreaming: boolean;
  thinking: ChatThinking | null;
  showThinkingBlock: boolean;
  lastCompletedThinking: ChatThinking | null;
  streamedChunkCount: number;
  isSummarized: boolean;
  onSend: (text: string) => void;
  onClear: () => void;
  connectionId: string | null;
  connectionName: string;
  isCrawled: boolean;
  onCrawl: () => void;
  onCancelCrawl?: () => void;
  isCrawling: boolean;
  crawlProgress: CrawlProgress | null;
  reindexConnectionId: string | null;
  onClearReindexRequest: () => void;
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
 * Main chat panel: routes to IndexFirstCard (not yet crawled), ReindexCard (re-index requested),
 * or the chat UI (header + body + footer). Handles input state and action callbacks.
 */
export function ChatPanel({
  messages,
  isStreaming,
  thinking,
  showThinkingBlock,
  lastCompletedThinking,
  streamedChunkCount,
  isSummarized,
  onSend,
  onClear,
  connectionId,
  connectionName,
  isCrawled,
  onCrawl,
  onCancelCrawl,
  isCrawling,
  crawlProgress,
  reindexConnectionId,
  onClearReindexRequest,
  ollamaAvailable,
  ollamaModel,
  ollamaModelPulled,
  ollamaModels,
  onModelChange,
  onCheckOllama,
  onPullModel,
  pullingModel,
}: ChatPanelProps) {
  const [input, setInput] = useState("");
  const [clearConfirmShown, setClearConfirmShown] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = useCallback(() => {
    const trimmed = input.trim();
    if (!trimmed || isStreaming || !connectionId) return;
    onSend(trimmed);
    setInput("");
  }, [input, isStreaming, connectionId, onSend]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  const handleClearClick = useCallback(() => {
    if (messages.length === 0) return;
    setClearConfirmShown(true);
  }, [messages.length]);

  const handleClearConfirm = useCallback(() => {
    onClear();
    setClearConfirmShown(false);
  }, [onClear]);

  const handleSuggestedPrompt = useCallback(
    (text: string) => {
      if (!connectionId || isStreaming) return;
      onSend(text);
    },
    [connectionId, isStreaming, onSend]
  );

  if (connectionId && !isCrawled) {
    return (
      <div className="flex flex-col flex-1 min-h-0">
        <IndexFirstCard
          connectionName={connectionName}
          onCrawl={onCrawl}
          onCancelCrawl={onCancelCrawl}
          isCrawling={isCrawling}
          crawlProgress={crawlProgress}
          ollamaAvailable={ollamaAvailable}
          ollamaModel={ollamaModel}
          ollamaModelPulled={ollamaModelPulled}
          ollamaModels={ollamaModels}
          onModelChange={onModelChange}
          onCheckOllama={onCheckOllama}
          onPullModel={onPullModel}
          pullingModel={pullingModel}
        />
      </div>
    );
  }

  if (connectionId && isCrawled && reindexConnectionId === connectionId) {
    return (
      <div className="flex flex-col flex-1 min-h-0">
        <ReindexCard
          connectionName={connectionName}
          onReindex={() => {
            onClearReindexRequest();
            onCrawl();
          }}
          onCancel={onClearReindexRequest}
          isCrawling={isCrawling}
          crawlProgress={crawlProgress}
          onCancelCrawl={onCancelCrawl}
          ollamaAvailable={ollamaAvailable}
          ollamaModel={ollamaModel}
          ollamaModelPulled={ollamaModelPulled}
          ollamaModels={ollamaModels}
          onModelChange={onModelChange}
          onCheckOllama={onCheckOllama}
          onPullModel={onPullModel}
          pullingModel={pullingModel}
        />
      </div>
    );
  }

  const showReindexingBanner = isCrawled && isCrawling && crawlProgress;
  const isReindexing = Boolean(showReindexingBanner);

  return (
    <div className="flex flex-col h-full min-h-0">
      <ClearConfirmModal
        isOpen={clearConfirmShown}
        onCancel={() => setClearConfirmShown(false)}
        onConfirm={handleClearConfirm}
      />
      {showReindexingBanner && <ReindexingBanner progress={crawlProgress} onCancel={onCancelCrawl} />}
      <ChatHeader
        connectionName={connectionName}
        onClearClick={handleClearClick}
        hasMessages={messages.length > 0}
      />
      <ChatBody
        messages={messages}
        isStreaming={isStreaming}
        isReindexing={isReindexing}
        thinking={thinking}
        showThinkingBlock={showThinkingBlock}
        lastCompletedThinking={lastCompletedThinking}
        streamedChunkCount={streamedChunkCount}
        connectionId={connectionId}
        onSuggestedPrompt={handleSuggestedPrompt}
        bottomRef={bottomRef}
      />
      <ChatFooter
        messagesLength={messages.length}
        lastCompletedThinking={lastCompletedThinking}
        isStreaming={isStreaming}
        isSummarized={isSummarized}
        isReindexing={isReindexing}
        input={input}
        setInput={setInput}
        onSend={handleSend}
        onKeyDown={handleKeyDown}
        connectionId={connectionId}
      />
    </div>
  );
}
