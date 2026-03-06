import React from "react";
import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import type { ChatMessage } from "../../../shared/types";

export function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] rounded-lg text-sm break-words ${
          isUser
            ? "px-4 py-2 bg-vscode-button-background text-vscode-button-foreground whitespace-pre-wrap"
            : "px-4 py-3 bg-vscode-editor-inactiveSelectionBackground chat-markdown"
        }`}
      >
        {isUser ? (
          message.content
        ) : (
          <ReactMarkdown rehypePlugins={[rehypeHighlight]}>{message.content}</ReactMarkdown>
        )}
      </div>
    </div>
  );
}
