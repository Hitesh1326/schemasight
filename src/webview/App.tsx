import React, { useState, useEffect, useCallback } from "react";
import { Sidebar } from "./components/connections/Sidebar";
import { ChatPanel } from "./components/chat/ChatPanel";
import { AddConnectionModal } from "./components/connections/AddConnectionModal";
import { IndexInfoModal } from "./components/indexing/IndexInfoModal";
import { useConnections } from "./hooks/useConnections";
import { useChat } from "./hooks/useChat";
import { useOllamaStatus } from "./hooks/useOllamaStatus";
import { useIndexStats } from "./hooks/useIndexStats";
import { useActiveConnection } from "./hooks/useActiveConnection";
import { onMessage } from "./vscodeApi";

/**
 * Root webview UI: sidebar (connections, crawl, index info), main chat area, and modals for
 * adding a connection and viewing index stats.
 */
export function App() {
  const [activeConnectionId, setActiveConnectionId] = useState<string | null>(null);
  const [addConnectionModalOpen, setAddConnectionModalOpen] = useState(false);
  const [indexInfoConnectionId, setIndexInfoConnectionId] = useState<string | null>(null);
  const [reindexConnectionId, setReindexConnectionId] = useState<string | null>(null);

  const {
    connections,
    crawledConnectionIds,
    crawlProgress,
    addConnection,
    addConnectionPending,
    addConnectionResult,
    clearAddConnectionResult,
    removeConnection,
    testConnection,
    crawlSchema,
    cancelCrawl,
  } = useConnections();

  const {
    indexStats,
    indexStatsLoading,
    requestIndexStats,
    clearIndexInfo,
    handleMessage: handleIndexStatsMessage,
  } = useIndexStats();

  useEffect(() => {
    return onMessage(handleIndexStatsMessage);
  }, [handleIndexStatsMessage]);

  const {
    messages,
    sendMessage,
    isStreaming,
    thinking,
    showThinkingBlock,
    lastCompletedThinking,
    streamedChunkCount,
    isSummarized,
    clearHistory,
  } = useChat(activeConnectionId);

  const {
    available: ollamaAvailable,
    model: ollamaModel,
    modelPulled: ollamaModelPulled,
    models: ollamaModels,
    setModel: setOllamaModel,
    check: checkOllama,
    pullModel: onPullModel,
    pullingModel,
  } = useOllamaStatus();

  const { activeConnectionName, isActiveCrawled, isActiveCrawling } = useActiveConnection(
    activeConnectionId,
    connections,
    crawledConnectionIds,
    crawlProgress
  );

  const cancelActiveCrawl = useCallback(() => {
    if (activeConnectionId) cancelCrawl(activeConnectionId);
  }, [activeConnectionId, cancelCrawl]);

  useEffect(() => {
    if (activeConnectionId && !connections.some((c) => c.id === activeConnectionId)) {
      setActiveConnectionId(null);
    }
  }, [activeConnectionId, connections]);

  useEffect(() => {
    if (reindexConnectionId != null && activeConnectionId !== reindexConnectionId) {
      setReindexConnectionId(null);
    }
  }, [activeConnectionId, reindexConnectionId]);

  useEffect(() => {
    if (addConnectionResult?.success === true) {
      setAddConnectionModalOpen(false);
      clearAddConnectionResult();
    }
  }, [addConnectionResult, clearAddConnectionResult]);

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar
        connections={connections}
        crawledConnectionIds={crawledConnectionIds}
        activeConnectionId={activeConnectionId}
        crawlProgress={crawlProgress}
        onSelectConnection={setActiveConnectionId}
        onAddConnection={() => {
          clearAddConnectionResult();
          setAddConnectionModalOpen(true);
        }}
        onTest={testConnection}
        onCrawl={crawlSchema}
        onReindexRequest={(id) => {
          setReindexConnectionId(id);
          setActiveConnectionId(id);
        }}
        onRemove={removeConnection}
        onIndexInfo={(id) => {
          setIndexInfoConnectionId(id);
          requestIndexStats(id);
        }}
      />

      <main className="flex-1 flex flex-col overflow-hidden">
        {!activeConnectionId ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center px-6">
            <p className="text-sm text-vscode-descriptionForeground">
              Select a connection from the sidebar or add one to get started.
            </p>
            <p className="text-xs text-vscode-descriptionForeground opacity-80">
              SchemaSight indexes your schema and stored procedures so you can chat with your database locally.
            </p>
          </div>
        ) : (
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
            <ChatPanel
              messages={messages}
              isStreaming={isStreaming}
              thinking={thinking}
              showThinkingBlock={showThinkingBlock}
              lastCompletedThinking={lastCompletedThinking}
              streamedChunkCount={streamedChunkCount}
              isSummarized={isSummarized}
              onSend={sendMessage}
              onClear={clearHistory}
              connectionId={activeConnectionId}
              connectionName={activeConnectionName}
              isCrawled={isActiveCrawled}
              onCrawl={() => activeConnectionId && crawlSchema(activeConnectionId)}
              onCancelCrawl={cancelActiveCrawl}
              isCrawling={isActiveCrawling}
              crawlProgress={crawlProgress}
              reindexConnectionId={reindexConnectionId}
              onClearReindexRequest={() => setReindexConnectionId(null)}
              ollamaAvailable={ollamaAvailable}
              ollamaModel={ollamaModel}
              ollamaModelPulled={ollamaModelPulled}
              ollamaModels={ollamaModels}
              onModelChange={setOllamaModel}
              onCheckOllama={checkOllama}
              onPullModel={onPullModel}
              pullingModel={pullingModel}
            />
          </div>
        )}
      </main>

      <AddConnectionModal
        isOpen={addConnectionModalOpen}
        onClose={() => {
          setAddConnectionModalOpen(false);
          clearAddConnectionResult();
        }}
        onAdd={addConnection}
        addConnectionPending={addConnectionPending}
        addConnectionResult={addConnectionResult}
      />

      <IndexInfoModal
        isOpen={indexInfoConnectionId !== null}
        connectionId={indexInfoConnectionId ?? ""}
        connectionName={
          connections.find((c) => c.id === indexInfoConnectionId)?.database ??
          indexInfoConnectionId ??
          ""
        }
        stats={indexStats}
        loading={indexStatsLoading}
        onClose={() => {
          setIndexInfoConnectionId(null);
          clearIndexInfo();
        }}
        onReindex={(id) => {
          setIndexInfoConnectionId(null);
          clearIndexInfo();
          setReindexConnectionId(id);
          setActiveConnectionId(id);
        }}
      />
    </div>
  );
}
