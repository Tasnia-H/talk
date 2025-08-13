"use client";

import React from "react";
import { Phone, Video, Monitor } from "lucide-react";

interface User {
  id: string;
  email: string;
  username: string;
  avatar?: string;
}

interface ChatHeaderProps {
  selectedUser: User;
  isUserOnline: boolean;
  unreadCount: number;
  isCallActive: boolean;
  onShowSidebar: () => void;
  onInitiateCall: (type: "audio" | "video" | "screen") => void;
}

export default function ChatHeader({
  selectedUser,
  isUserOnline,
  unreadCount,
  isCallActive,
  onShowSidebar,
  onInitiateCall,
}: ChatHeaderProps) {
  return (
    <div className="bg-white border-b border-gray-300 p-4 flex-shrink-0">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <button
            onClick={onShowSidebar}
            className="md:hidden text-gray-500 hover:text-gray-700 mr-2"
          >
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 6h16M4 12h16M4 18h16"
              />
            </svg>
          </button>
          <div className="w-10 h-10 bg-gray-300 rounded-full flex items-center justify-center overflow-hidden">
            {selectedUser.avatar ? (
              <img
                src={selectedUser.avatar}
                alt={selectedUser.username}
                className="w-full h-full object-cover"
              />
            ) : (
              <span className="text-gray-600 font-medium">
                {selectedUser.username.charAt(0).toUpperCase()}
              </span>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="font-medium text-gray-900 truncate">
              {selectedUser.username}
            </h2>
            <p className="text-sm text-gray-500 truncate">
              {isUserOnline ? (
                <span className="text-green-500">● Online</span>
              ) : (
                <span className="text-gray-400">● Offline</span>
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          {/* Call buttons */}
          <button
            onClick={() => onInitiateCall("audio")}
            disabled={isCallActive}
            className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title="Audio call"
          >
            <Phone className="w-5 h-5" />
          </button>
          <button
            onClick={() => onInitiateCall("video")}
            disabled={isCallActive}
            className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title="Video call"
          >
            <Video className="w-5 h-5" />
          </button>
          <button
            onClick={() => onInitiateCall("screen")}
            disabled={isCallActive}
            className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title="Screen share"
          >
            <Monitor className="w-5 h-5" />
          </button>

          {unreadCount > 0 && (
            <span className="bg-red-500 text-white text-xs rounded-full px-2 py-1 min-w-[20px] text-center">
              {unreadCount} unread
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
