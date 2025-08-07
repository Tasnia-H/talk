"use client";

import React from "react";

interface User {
  id: string;
  email: string;
  username: string;
  avatar?: string;
}

interface SidebarProps {
  users: User[];
  selectedUser: User | null;
  unreadCounts: Record<string, number>;
  currentUser: { username: string } | null;
  showSidebar: boolean;
  onSelectUser: (user: User) => void;
  onCloseSidebar: () => void;
  onLogout: () => void;
}

export default function Sidebar({
  users,
  selectedUser,
  unreadCounts,
  currentUser,
  showSidebar,
  onSelectUser,
  onCloseSidebar,
  onLogout,
}: SidebarProps) {
  const getTotalUnreadCount = () => {
    return Object.values(unreadCounts).reduce(
      (total, count) => total + count,
      0
    );
  };

  return (
    <>
      {/* Mobile Sidebar Overlay */}
      {showSidebar && (
        <div
          className="fixed inset-0 bg-gray-100 bg-opacity-75 z-40 md:hidden"
          onClick={onCloseSidebar}
        />
      )}

      {/* Sidebar */}
      <div
        className={`${
          showSidebar ? "translate-x-0" : "-translate-x-full"
        } fixed inset-y-0 left-0 z-50 w-80 bg-white border-r border-gray-300 transform transition-transform duration-300 ease-in-out md:relative md:translate-x-0 md:w-1/4 flex flex-col`}
      >
        <div className="p-4 border-b border-gray-300 flex-shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <h1 className="text-xl font-semibold">Messages</h1>
              {getTotalUnreadCount() > 0 && (
                <span className="bg-red-500 text-white text-xs rounded-full px-2 py-1 min-w-[20px] text-center">
                  {getTotalUnreadCount()}
                </span>
              )}
            </div>
            <div className="flex items-center space-x-2">
              <button
                onClick={onLogout}
                className="text-sm text-gray-500 hover:text-gray-700"
              >
                Logout
              </button>
              <button
                onClick={onCloseSidebar}
                className="md:hidden text-gray-500 hover:text-gray-700"
              >
                ✕
              </button>
            </div>
          </div>
          <p className="text-sm text-gray-600 truncate">
            Welcome, {currentUser?.username}!
          </p>
        </div>

        <div className="flex-1 overflow-y-auto">
          {users && users.length > 0 ? (
            users.map((u) => (
              <div
                key={u.id}
                className={`p-4 border-b border-gray-100 cursor-pointer hover:bg-gray-50 ${
                  selectedUser?.id === u.id ? "bg-blue-50 border-blue-200" : ""
                }`}
                onClick={() => onSelectUser(u)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3 flex-1 min-w-0">
                    <div className="w-10 h-10 bg-gray-300 rounded-full flex items-center justify-center flex-shrink-0 overflow-hidden">
                      {u.avatar ? (
                        <img
                          src={u.avatar}
                          alt={u.username}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <span className="text-gray-600 font-medium">
                          {u.username.charAt(0).toUpperCase()}
                        </span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="font-medium text-gray-900 truncate">
                        {u.username}
                      </h3>
                      <p className="text-sm text-gray-500 truncate">
                        {u.email}
                      </p>
                    </div>
                  </div>
                  {unreadCounts[u.id] > 0 && (
                    <span className="bg-red-500 text-white text-xs rounded-full px-2 py-1 min-w-[20px] text-center flex-shrink-0">
                      {unreadCounts[u.id]}
                    </span>
                  )}
                </div>
              </div>
            ))
          ) : (
            <div className="p-4 text-center text-gray-500">
              <p>Loading users...</p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
