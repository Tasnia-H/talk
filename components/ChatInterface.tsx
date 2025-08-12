"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useNotification } from "../contexts/NotificationContext";
import { useWebRTC } from "../hooks/useWebRTC";
import { useWebRTCFileTransfer } from "../hooks/useWebRTCFileTransfer";
import CallModal from "./CallModal";
import Sidebar from "./Sidebar";
import ChatHeader from "./ChatHeader";
import MessageList from "./MessageList";
import MessageInput from "./MessageInput";
import io from "socket.io-client";
type SocketType = ReturnType<typeof io>;

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
  isNewMessage?: boolean;
  type?: string;
  fileName?: string;
  fileSize?: number;
  fileType?: string;
  isReceiverOnline?: boolean;
}

interface IncomingCall {
  callId: string;
  caller: User;
  type: "audio" | "video";
}

interface CallState {
  callId: string;
  type: "audio" | "video";
  status: "outgoing" | "incoming" | "connected" | "ended";
  otherUser: User;
  isInitiator: boolean;
}

interface FileTransferInfo {
  messageId: string;
  file?: File;
  progress?: {
    percentage: number;
    status: "pending" | "transferring" | "completed" | "failed";
  };
}

export default function ChatInterface() {
  const { user, token, logout } = useAuth();
  const {
    requestNotificationPermission,
    showNotification,
    isNotificationSupported,
    notificationPermission,
    isPageVisible,
  } = useNotification();

  // State management
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [socket, setSocket] = useState<SocketType | null>(null);
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});
  const [showNotificationPrompt, setShowNotificationPrompt] = useState(false);
  const [showSidebar, setShowSidebar] = useState(false);

  // File sharing states
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileTransfers, setFileTransfers] = useState<
    Map<string, FileTransferInfo>
  >(new Map());
  const [isUserOnline, setIsUserOnline] = useState<boolean>(false);

  // Call states
  const [currentCall, setCurrentCall] = useState<CallState | null>(null);
  const [incomingCall, setIncomingCall] = useState<IncomingCall | null>(null);

  // Refs
  const socketRef = useRef<SocketType | null>(null);
  const dialTone = useRef<HTMLAudioElement | null>(null);
  const ringTone = useRef<HTMLAudioElement | null>(null);
  const selectedFileRef = useRef<File | null>(null);
  const selectedUserRef = useRef<User | null>(null);
  const sendFileRef = useRef<((file: File, metadata: any) => boolean) | null>(
    null
  );

  // Keep refs in sync
  useEffect(() => {
    selectedFileRef.current = selectedFile;
  }, [selectedFile]);

  useEffect(() => {
    selectedUserRef.current = selectedUser;
  }, [selectedUser]);

  // Utility function for file size formatting
  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
  };

  // WebRTC File Transfer Hook
  const {
    isChannelReady,
    connectionState,
    sendFile,
    establishConnection,
    transferProgress,
    cleanup: cleanupFileTransfer,
  } = useWebRTCFileTransfer({
    socket: socketRef.current,
    currentUserId: user?.id || "",
    otherUserId: selectedUser?.id || null,
    onFileReceived: (file, metadata) => {
      console.log("File received:", file.name);
      const messageId = metadata.messageId;
      if (messageId) {
        setFileTransfers((prev) => {
          const newMap = new Map(prev);
          newMap.set(messageId, {
            messageId,
            file,
            progress: {
              percentage: 100,
              status: "completed",
            },
          });
          return newMap;
        });
      }
    },
    onTransferProgress: (progress) => {
      const messageId = progress.fileId;
      setFileTransfers((prev) => {
        const newMap = new Map(prev);
        const existing = newMap.get(messageId) || { messageId };
        newMap.set(messageId, {
          ...existing,
          progress: {
            percentage: progress.percentage,
            status: progress.status,
          },
        });
        return newMap;
      });
    },
  });

  // Keep sendFile ref updated
  useEffect(() => {
    sendFileRef.current = sendFile;
  }, [sendFile]);

  // Keep establishConnection available
  const establishConnectionRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    establishConnectionRef.current = establishConnection;
  }, [establishConnection]);

  // Debug connection state (development only)
  useEffect(() => {
    if (selectedUser) {
      console.log(
        `File transfer connection state for ${selectedUser.username}:`,
        {
          connectionState,
          isChannelReady,
        }
      );

      // Show user feedback for connection issues
      if (connectionState === "failed") {
        console.warn(
          "WebRTC P2P connection failed - files will be queued until connection is restored"
        );
      }
    }
  }, [selectedUser, connectionState, isChannelReady]);

  // Initialize audio on component mount
  useEffect(() => {
    dialTone.current = new Audio("/sounds/dial.mp3");
    ringTone.current = new Audio("/sounds/ring.mp3");

    if (dialTone.current) {
      dialTone.current.loop = true;
      dialTone.current.volume = 0.5;
    }
    if (ringTone.current) {
      ringTone.current.loop = true;
      ringTone.current.volume = 0.7;
    }

    return () => {
      if (dialTone.current) {
        dialTone.current.pause();
        dialTone.current = null;
      }
      if (ringTone.current) {
        ringTone.current.pause();
        ringTone.current = null;
      }
    };
  }, []);

  // Audio control functions
  const stopAllRingtones = useCallback(() => {
    if (dialTone.current) {
      dialTone.current.pause();
      dialTone.current.currentTime = 0;
    }
    if (ringTone.current) {
      ringTone.current.pause();
      ringTone.current.currentTime = 0;
    }
  }, []);

  const playDialTone = useCallback(() => {
    stopAllRingtones();
    if (dialTone.current) {
      dialTone.current.currentTime = 0;
      dialTone.current.play().catch((err) => {
        console.log("Could not play dial tone:", err);
      });
    }
  }, [stopAllRingtones]);

  const playRingTone = useCallback(() => {
    stopAllRingtones();
    if (ringTone.current) {
      ringTone.current.currentTime = 0;
      ringTone.current.play().catch((err) => {
        console.log("Could not play ring tone:", err);
      });
    }
  }, [stopAllRingtones]);

  // WebRTC hook for calls
  const {
    localStream,
    remoteStream,
    isConnected,
    getUserMedia,
    addLocalStream,
    createOffer,
    initializePeerConnection,
    toggleMute,
    toggleVideo,
    forceReleaseVideo,
    cleanup: cleanupWebRTC,
  } = useWebRTC({
    socket: socketRef.current,
    callId: currentCall?.callId || null,
    isInitiator: currentCall?.isInitiator || false,
  });

  // Initialize socket connection - ONLY ONCE
  useEffect(() => {
    if (!token || socketRef.current) return;

    console.log("Initializing socket connection");
    const socketInstance = io("http://localhost:3001", {
      auth: { token },
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    socketRef.current = socketInstance;
    setSocket(socketInstance);

    // Connection event handlers
    socketInstance.on("connect", () => {
      console.log("Socket connected");
    });

    socketInstance.on("disconnect", (reason: string) => {
      console.log("Socket disconnected:", reason);
    });

    return () => {
      console.log("Cleaning up socket connection");
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
        setSocket(null);
      }
    };
  }, [token]); // Only depend on token

  // Setup socket event listeners - SEPARATE EFFECT
  useEffect(() => {
    if (!socketRef.current || !user) return;

    const socket = socketRef.current;

    // Message event handlers
    const handleReceiveMessage = (message: Message) => {
      setMessages((prev) => [...prev, message]);

      // Show notification if page is not visible
      if (message.isNewMessage && !isPageVisible) {
        if (message.type === "file") {
          showNotification(
            `New file from ${message.sender.username}`,
            `${message.fileName} (${formatFileSize(message.fileSize || 0)})`,
            "/favicon.ico"
          );
        } else {
          showNotification(
            `New message from ${message.sender.username}`,
            message.content,
            "/favicon.ico"
          );
        }
      }

      // Handle file message for DataChannel transfer
      if (
        message.type === "file" &&
        message.isReceiverOnline &&
        message.sender.id !== user?.id
      ) {
        console.log(
          "File message received, transfer will happen via DataChannel"
        );
      }
    };

    const handleMessageSent = (message: Message) => {
      setMessages((prev) => [...prev, message]);

      // If it's a file message, store the file for the sender
      if (message.type === "file" && selectedFileRef.current) {
        const file = selectedFileRef.current;

        // Store the file for the sender to preview/download
        setFileTransfers((prev) => {
          const newMap = new Map(prev);
          newMap.set(message.id, {
            messageId: message.id,
            file: file,
            progress: {
              percentage: 100,
              status: "completed",
            },
          });
          return newMap;
        });

        // If receiver is online, initiate transfer via DataChannel
        if (message.isReceiverOnline && sendFileRef.current) {
          console.log("Initiating file transfer via DataChannel");

          const success = sendFileRef.current(file, { messageId: message.id });

          if (!success) {
            console.log("File queued, P2P connection will be established");
            // Update the file transfer status to show it's pending
            setFileTransfers((prev) => {
              const newMap = new Map(prev);
              const existing = newMap.get(message.id);
              if (existing) {
                newMap.set(message.id, {
                  ...existing,
                  progress: {
                    percentage: 0,
                    status: "pending",
                  },
                });
              }
              return newMap;
            });
          }
        }

        setSelectedFile(null);
      }
    };

    const handleMessagesHistory = (history: Message[]) => {
      setMessages(history);

      // Clear existing file transfers when loading new history
      setFileTransfers(new Map());

      // Note: For persistent file storage across sessions, you would need to:
      // 1. Store files in IndexedDB or a backend storage service
      // 2. Retrieve them when loading message history
      // For now, files are only available during the current session
    };

    const handleUnreadCounts = (counts: Record<string, number>) => {
      setUnreadCounts(counts);
    };

    const handleMessagesMarkedRead = (data: { senderId: string }) => {
      setMessages((prev) =>
        prev.map((msg) =>
          msg.sender.id === data.senderId ? { ...msg, isRead: true } : msg
        )
      );
    };

    const handleUserOnlineStatus = (data: {
      userId: string;
      isOnline: boolean;
    }) => {
      if (data.userId === selectedUserRef.current?.id) {
        setIsUserOnline(data.isOnline);
      }
    };

    // Call event handlers
    const handleIncomingCall = (data: IncomingCall) => {
      console.log("Incoming call received:", data);
      setIncomingCall(data);
      playRingTone();

      if (!isPageVisible) {
        showNotification(
          `Incoming ${data.type} call`,
          `${data.caller.username} is calling you`,
          "/favicon.ico"
        );
      }
    };

    const handleCallInitiated = (data: { callId: string }) => {
      console.log("Call initiated with ID:", data.callId);
      setCurrentCall((prev) => {
        if (prev && !prev.callId) {
          return { ...prev, callId: data.callId };
        }
        return prev;
      });
    };

    const handleCallAccepted = (data: { callId: string }) => {
      console.log("Call accepted:", data.callId);
      stopAllRingtones();
      setCurrentCall((prev) => {
        if (prev && prev.callId === data.callId) {
          return { ...prev, status: "connected" };
        }
        return prev;
      });
    };

    const handleCallRejected = (data: { callId: string }) => {
      console.log("Call rejected:", data.callId);
      stopAllRingtones();
      setCurrentCall((prev) => {
        if (prev && prev.callId === data.callId) {
          setTimeout(() => cleanupWebRTC(), 100);
          return null;
        }
        return prev;
      });
    };

    const handleCallEnded = (data: { callId: string }) => {
      console.log("Call ended:", data.callId);
      stopAllRingtones();
      setCurrentCall((prev) => {
        if (prev && prev.callId === data.callId) {
          setTimeout(() => cleanupWebRTC(), 100);
          return null;
        }
        return prev;
      });
      setIncomingCall(null);
    };

    const handleCallFailed = (data: { reason: string }) => {
      console.log("Call failed:", data.reason);
      stopAllRingtones();
      alert(`Call failed: ${data.reason}`);
      setCurrentCall(null);
      cleanupWebRTC();
    };

    // Register all event listeners
    socket.on("receive_message", handleReceiveMessage);
    socket.on("message_sent", handleMessageSent);
    socket.on("messages_history", handleMessagesHistory);
    socket.on("unread_counts", handleUnreadCounts);
    socket.on("messages_marked_read", handleMessagesMarkedRead);
    socket.on("user_online_status", handleUserOnlineStatus);
    socket.on("incoming_call", handleIncomingCall);
    socket.on("call_initiated", handleCallInitiated);
    socket.on("call_accepted", handleCallAccepted);
    socket.on("call_rejected", handleCallRejected);
    socket.on("call_ended", handleCallEnded);
    socket.on("call_failed", handleCallFailed);

    // Cleanup listeners
    return () => {
      socket.off("receive_message", handleReceiveMessage);
      socket.off("message_sent", handleMessageSent);
      socket.off("messages_history", handleMessagesHistory);
      socket.off("unread_counts", handleUnreadCounts);
      socket.off("messages_marked_read", handleMessagesMarkedRead);
      socket.off("user_online_status", handleUserOnlineStatus);
      socket.off("incoming_call", handleIncomingCall);
      socket.off("call_initiated", handleCallInitiated);
      socket.off("call_accepted", handleCallAccepted);
      socket.off("call_rejected", handleCallRejected);
      socket.off("call_ended", handleCallEnded);
      socket.off("call_failed", handleCallFailed);
    };
  }, [
    user,
    isPageVisible,
    showNotification,
    playRingTone,
    stopAllRingtones,
    cleanupWebRTC,
    formatFileSize,
  ]);

  // Check if selected user is online
  useEffect(() => {
    if (socketRef.current && selectedUser) {
      socketRef.current.emit("check_user_online", { userId: selectedUser.id });
    }
  }, [selectedUser]);

  // Fetch users on mount
  useEffect(() => {
    if (token) {
      fetchUsers();
    }
  }, [token]);

  // Show notification prompt
  useEffect(() => {
    if (isNotificationSupported && notificationPermission === "default") {
      setShowNotificationPrompt(true);
    }
  }, [isNotificationSupported, notificationPermission]);

  // Handle WebRTC offer creation for initiator when call is connected
  useEffect(() => {
    if (
      currentCall?.isInitiator &&
      currentCall.status === "connected" &&
      localStream &&
      currentCall.callId &&
      !isConnected
    ) {
      console.log("Creating offer for accepted call");
      const timer = setTimeout(() => {
        createOffer();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [
    currentCall?.status,
    currentCall?.callId,
    currentCall?.isInitiator,
    localStream,
    isConnected,
    createOffer,
  ]);

  // Update document title with unread count
  useEffect(() => {
    const totalUnread = getTotalUnreadCount();
    document.title =
      totalUnread > 0
        ? `(${totalUnread}) Solar-ICT Chat App`
        : "Solar-ICT Chat App";
  }, [unreadCounts]);

  // Utility functions
  const fetchUsers = async () => {
    try {
      const response = await fetch("http://localhost:3001/users", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const data = await response.json();
      setUsers(data);
    } catch (error) {
      console.error("Failed to fetch users:", error);
    }
  };

  const getTotalUnreadCount = () => {
    return Object.values(unreadCounts).reduce(
      (total, count) => total + count,
      0
    );
  };

  const selectUser = useCallback((selectedUser: User) => {
    setSelectedUser(selectedUser);
    setMessages([]);
    setShowSidebar(false);
    setSelectedFile(null);
    setFileTransfers(new Map());

    if (socketRef.current) {
      socketRef.current.emit("get_messages", { otherUserId: selectedUser.id });
      socketRef.current.emit("set_active_chat", {
        receiverId: selectedUser.id,
      });
      socketRef.current.emit("check_user_online", { userId: selectedUser.id });
    }
  }, []);

  const sendMessage = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!newMessage.trim() || !selectedUser || !socketRef.current) return;

      socketRef.current.emit("send_message", {
        receiverId: selectedUser.id,
        content: newMessage,
      });

      setNewMessage("");
    },
    [newMessage, selectedUser]
  );

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Check file size (10MB limit)
    if (file.size > 10 * 1024 * 1024) {
      alert("File size must be less than 10MB");
      e.target.value = "";
      return;
    }

    // Proactively establish WebRTC connection when user selects a file
    if (connectionState === "disconnected" && establishConnectionRef.current) {
      console.log(
        "Establishing WebRTC connection proactively for file transfer"
      );
      establishConnectionRef.current();
    }

    setSelectedFile(file);
    e.target.value = "";
  };

  const sendFileMessage = useCallback(() => {
    if (!selectedFile || !selectedUser || !socketRef.current) return;

    socketRef.current.emit("send_file_message", {
      receiverId: selectedUser.id,
      content: `Sent a file: ${selectedFile.name}`,
      fileName: selectedFile.name,
      fileSize: selectedFile.size,
      fileType: selectedFile.type,
    });
  }, [selectedFile, selectedUser]);

  const removeSelectedFile = () => {
    setSelectedFile(null);
  };

  const handleNotificationPermission = async () => {
    await requestNotificationPermission();
    setShowNotificationPrompt(false);
  };

  // Call functions
  const initiateCall = useCallback(
    async (type: "audio" | "video") => {
      if (!selectedUser || !socketRef.current) {
        console.error("Cannot initiate call - missing selectedUser or socket");
        return;
      }

      try {
        console.log("Initiating", type, "call to", selectedUser.username);
        initializePeerConnection();
        const stream = await getUserMedia(type === "video");
        addLocalStream(stream);

        setCurrentCall({
          callId: "",
          type,
          status: "outgoing",
          otherUser: selectedUser,
          isInitiator: true,
        });

        playDialTone();

        socketRef.current.emit("initiate_call", {
          receiverId: selectedUser.id,
          type,
        });
      } catch (error) {
        console.error("Failed to initiate call:", error);
        alert("Failed to access camera/microphone");
        stopAllRingtones();
        setCurrentCall(null);
        cleanupWebRTC();
      }
    },
    [
      selectedUser,
      getUserMedia,
      initializePeerConnection,
      addLocalStream,
      playDialTone,
      stopAllRingtones,
      cleanupWebRTC,
    ]
  );

  const acceptCall = useCallback(async () => {
    if (!incomingCall || !socketRef.current) {
      console.error("Cannot accept call - missing incomingCall or socket");
      return;
    }

    try {
      console.log("Accepting call:", incomingCall.callId);
      stopAllRingtones();
      initializePeerConnection();
      const stream = await getUserMedia(incomingCall.type === "video");
      addLocalStream(stream);

      setCurrentCall({
        callId: incomingCall.callId,
        type: incomingCall.type,
        status: "connected",
        otherUser: incomingCall.caller,
        isInitiator: false,
      });

      socketRef.current.emit("accept_call", {
        callId: incomingCall.callId,
      });

      setIncomingCall(null);
    } catch (error) {
      console.error("Failed to accept call:", error);
      alert("Failed to access camera/microphone");
      rejectCall();
    }
  }, [
    incomingCall,
    getUserMedia,
    initializePeerConnection,
    addLocalStream,
    stopAllRingtones,
  ]);

  const rejectCall = useCallback(() => {
    if (!incomingCall || !socketRef.current) {
      console.error("Cannot reject call - missing incomingCall or socket");
      return;
    }

    console.log("Rejecting call:", incomingCall.callId);
    stopAllRingtones();

    socketRef.current.emit("reject_call", {
      callId: incomingCall.callId,
    });

    setIncomingCall(null);
  }, [incomingCall, stopAllRingtones]);

  const endCall = useCallback(() => {
    if (!currentCall || !socketRef.current) {
      console.error("Cannot end call - missing currentCall or socket");
      return;
    }

    console.log("Ending call:", currentCall.callId);
    stopAllRingtones();

    socketRef.current.emit("end_call", {
      callId: currentCall.callId,
    });

    setCurrentCall(null);
    cleanupWebRTC();
  }, [currentCall, stopAllRingtones, cleanupWebRTC]);

  const handleToggleMute = useCallback(
    (isMuted: boolean) => {
      toggleMute(isMuted);
    },
    [toggleMute]
  );

  const handleToggleVideo = useCallback(
    (isVideoOff: boolean) => {
      toggleVideo(isVideoOff);
    },
    [toggleVideo]
  );

  const markMessagesAsRead = useCallback(() => {
    if (
      selectedUser &&
      socketRef.current &&
      unreadCounts[selectedUser.id] > 0
    ) {
      socketRef.current.emit("mark_messages_read", {
        senderId: selectedUser.id,
      });
    }
  }, [selectedUser, unreadCounts]);

  const handleInputFocus = useCallback(() => {
    markMessagesAsRead();
  }, [markMessagesAsRead]);

  // Main render
  return (
    <div className="flex h-screen bg-gray-100 relative overflow-hidden">
      {/* Call Modal */}
      {(currentCall || incomingCall) && (
        <CallModal
          isOpen={true}
          callType={currentCall?.type || incomingCall?.type || "audio"}
          callStatus={
            incomingCall ? "incoming" : currentCall?.status || "ended"
          }
          otherUser={
            currentCall?.otherUser || incomingCall?.caller || selectedUser!
          }
          onAccept={incomingCall ? acceptCall : undefined}
          onReject={incomingCall ? rejectCall : undefined}
          onEnd={endCall}
          onToggleMute={handleToggleMute}
          onToggleVideo={handleToggleVideo}
          onForceReleaseVideo={forceReleaseVideo}
          localStream={localStream || undefined}
          remoteStream={remoteStream || undefined}
        />
      )}

      {/* Notification Permission Prompt */}
      {showNotificationPrompt && (
        <div className="fixed top-4 right-4 bg-blue-600 text-white p-4 rounded-lg shadow-lg z-50 max-w-sm">
          <div className="flex items-center space-x-3">
            <div className="flex-1">
              <p className="text-sm font-medium">Enable notifications</p>
              <p className="text-xs opacity-90">
                Get notified when you receive new messages
              </p>
            </div>
            <div className="flex space-x-2">
              <button
                onClick={handleNotificationPermission}
                className="bg-white text-blue-600 px-3 py-1 rounded text-sm font-medium hover:bg-gray-100"
              >
                Enable
              </button>
              <button
                onClick={() => setShowNotificationPrompt(false)}
                className="text-white hover:text-gray-200 text-sm"
              >
                ✕
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sidebar */}
      <Sidebar
        users={users}
        selectedUser={selectedUser}
        unreadCounts={unreadCounts}
        currentUser={user}
        showSidebar={showSidebar}
        onSelectUser={selectUser}
        onCloseSidebar={() => setShowSidebar(false)}
        onLogout={logout}
      />

      {/* Chat Area */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        {selectedUser ? (
          <>
            {/* Chat Header */}
            <ChatHeader
              selectedUser={selectedUser}
              isUserOnline={isUserOnline}
              unreadCount={unreadCounts[selectedUser.id] || 0}
              isCallActive={!!currentCall || !!incomingCall}
              onShowSidebar={() => setShowSidebar(true)}
              onInitiateCall={initiateCall}
            />

            {/* Messages */}
            <MessageList
              messages={messages}
              currentUserId={user?.id || ""}
              fileTransfers={fileTransfers}
            />

            {/* Message Input */}
            <MessageInput
              newMessage={newMessage}
              selectedFile={selectedFile}
              isUserOnline={isUserOnline}
              onMessageChange={setNewMessage}
              onSendMessage={sendMessage}
              onSendFile={sendFileMessage}
              onFileSelect={handleFileSelect}
              onRemoveFile={removeSelectedFile}
              onInputFocus={handleInputFocus}
              formatFileSize={formatFileSize}
            />
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center p-4">
            <div className="text-center">
              <button
                onClick={() => setShowSidebar(true)}
                className="md:hidden mb-4 p-3 bg-gray-100 rounded-full hover:bg-gray-200 transition-colors"
                aria-label="Open conversations"
              >
                <svg
                  className="w-6 h-6 text-gray-600"
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
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                Select a conversation
              </h3>
              <p className="text-gray-500">
                Choose a user from the sidebar to start messaging
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
