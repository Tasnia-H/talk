"use client";

import { useAuth } from "@/contexts/AuthContext";
import AuthForm from "@/components/AuthForm";
import ChatInterface from "@/components/ChatInterface";

export default function Home() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center space-y-4">
          <p>Yoooooo</p>
          {/* Company Logo */}
          <div className="relative">
            <img
              src="/favicon.ico"
              alt="Loading..."
              className="w-12 h-12 animate-pulse"
            />
            {/* Subtle spinning ring around logo */}
            <div className="absolute inset-0 w-12 h-12 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin"></div>
          </div>
        </div>
      </div>
    );
  }

  return user ? <ChatInterface /> : <AuthForm />;
}
