"use client";

import React, { useRef, useEffect } from "react";
import FileMessage from "./FileMessage";

interface User {
  id: string;
  email: string;
  username: string;
  avatar?: string;
}

interface Message {
  id: string;
  content: string;
  createdAt: string;
  isRead: boolean;
  sender: User;
  receiver: User;
  type?: string;
  fileName?: string;
  fileSize?: number;
  fileType?: string;
}

interface FileTransferInfo {
  messageId: string;
  file?: File;
  progress?: {
    percentage: number;
    status: "pending" | "transferring" | "completed" | "failed";
  };
}

interface MessageListProps {
  messages: Message[];
  currentUserId: string;
  fileTransfers: Map<string, FileTransferInfo>;
}

export default function MessageList({
  messages,
  currentUserId,
  fileTransfers,
}: MessageListProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0">
      {messages.map((message) => {
        const isOwn = message.sender.id === currentUserId;
        const transferInfo = fileTransfers.get(message.id);

        return (
          <div
            key={message.id}
            className={`flex ${isOwn ? "justify-end" : "justify-start"}`}
          >
            {message.type === "file" ? (
              <FileMessage
                fileName={message.fileName || "Unknown file"}
                fileSize={message.fileSize || 0}
                fileType={message.fileType || "application/octet-stream"}
                fileData={transferInfo?.file}
                isOwn={isOwn}
                transferProgress={transferInfo?.progress}
              />
            ) : (
              <div
                className={`max-w-xs sm:max-w-md lg:max-w-lg xl:max-w-xl px-4 py-2 rounded-lg ${
                  isOwn ? "bg-blue-600 text-white" : "bg-gray-200 text-gray-900"
                }`}
              >
                <p className="text-sm break-words">{message.content}</p>
                <div className="flex items-center justify-between mt-1">
                  <p className="text-xs opacity-75">
                    {new Date(message.createdAt).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                  {isOwn && (
                    <span className="text-xs opacity-75 ml-2">
                      {message.isRead ? "✓✓" : "✓"}
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}
      <div ref={messagesEndRef} />
    </div>
  );
}
