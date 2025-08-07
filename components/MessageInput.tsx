"use client";

import React, { useRef } from "react";
import { Paperclip, X, Send } from "lucide-react";

interface MessageInputProps {
  newMessage: string;
  selectedFile: File | null;
  isUserOnline: boolean;
  onMessageChange: (message: string) => void;
  onSendMessage: (e: React.FormEvent) => void;
  onSendFile: () => void;
  onFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onRemoveFile: () => void;
  onInputFocus: () => void;
  formatFileSize: (bytes: number) => string;
}

export default function MessageInput({
  newMessage,
  selectedFile,
  isUserOnline,
  onMessageChange,
  onSendMessage,
  onSendFile,
  onFileSelect,
  onRemoveFile,
  onInputFocus,
  formatFileSize,
}: MessageInputProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  return (
    <>
      {/* Selected File Preview */}
      {selectedFile && (
        <div className="bg-gray-50 border-t border-gray-200 px-4 py-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Paperclip className="w-4 h-4 text-gray-500" />
              <span className="text-sm text-gray-700 truncate max-w-xs">
                {selectedFile.name}
              </span>
              <span className="text-xs text-gray-500">
                ({formatFileSize(selectedFile.size)})
              </span>
            </div>
            <div className="flex items-center space-x-2">
              {!isUserOnline && (
                <span className="text-xs text-orange-600">
                  User offline - file won't transfer
                </span>
              )}
              <button
                onClick={onRemoveFile}
                className="text-gray-500 hover:text-gray-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Message Input */}
      <div className="bg-white border-t border-gray-300 p-4 flex-shrink-0">
        <form
          onSubmit={
            selectedFile
              ? (e) => {
                  e.preventDefault();
                  onSendFile();
                }
              : onSendMessage
          }
        >
          <div className="flex space-x-2 sm:space-x-4">
            {/* File Input (Hidden) */}
            <input
              ref={fileInputRef}
              type="file"
              onChange={onFileSelect}
              className="hidden"
              accept="*/*"
            />

            {/* File Attach Button */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="text-gray-500 hover:text-gray-700 p-2"
              title="Attach file"
            >
              <Paperclip className="w-5 h-5" />
            </button>

            {/* Text Input or Send File Button */}
            {!selectedFile ? (
              <>
                <input
                  type="text"
                  value={newMessage}
                  onChange={(e) => onMessageChange(e.target.value)}
                  onFocus={onInputFocus}
                  placeholder="Type a message..."
                  className="flex-1 border border-gray-300 rounded-full px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <button
                  type="submit"
                  disabled={!newMessage.trim()}
                  className="bg-blue-600 text-white px-4 sm:px-6 py-2 rounded-full hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Send
                </button>
              </>
            ) : (
              <button
                type="submit"
                disabled={!isUserOnline}
                className="flex-1 bg-blue-600 text-white px-4 py-2 rounded-full hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
              >
                <Send className="w-5 h-5" />
                <span>{isUserOnline ? "Send File" : "User Offline"}</span>
              </button>
            )}
          </div>
        </form>
      </div>
    </>
  );
}
