"use client";

import { useState, useEffect, useRef } from "react";
import {
  Phone,
  PhoneOff,
  Video,
  VideoOff,
  Mic,
  MicOff,
  Monitor,
  MonitorOff,
} from "lucide-react";

interface User {
  id: string;
  username: string;
  avatar?: string;
}

interface CallModalProps {
  isOpen: boolean;
  callType: "audio" | "video" | "screen";
  callStatus: "outgoing" | "incoming" | "connected" | "ended";
  otherUser: User;
  onAccept?: () => void;
  onReject?: () => void;
  onEnd: () => void;
  onToggleMute?: (isMuted: boolean) => void;
  onToggleVideo?: (isVideoOff: boolean) => void;
  onToggleScreenShare?: (isScreenOff: boolean) => void;
  onForceReleaseVideo?: () => void;
  localStream?: MediaStream;
  remoteStream?: MediaStream;
  isScreenSharing?: boolean;
}

export default function CallModal({
  isOpen,
  callType,
  callStatus,
  otherUser,
  onAccept,
  onReject,
  onEnd,
  onToggleMute,
  onToggleVideo,
  onToggleScreenShare,
  onForceReleaseVideo,
  localStream,
  remoteStream,
  isScreenSharing = false,
}: CallModalProps) {
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [callDuration, setCallDuration] = useState(0);

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const localAudioRef = useRef<HTMLAudioElement>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);

  // Call duration timer
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (callStatus === "connected") {
      interval = setInterval(() => {
        setCallDuration((prev) => prev + 1);
      }, 1000);
    } else {
      setCallDuration(0);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [callStatus]);

  // Handle local stream - Clear video when muted + force black screen
  useEffect(() => {
    if (localVideoRef.current) {
      if (localStream && localStream.getTracks().length > 0) {
        // For screen calls, check if screen sharing is enabled
        if (callType === "screen") {
          const videoTrack = localStream.getVideoTracks()[0];
          if (videoTrack && videoTrack.enabled && isScreenSharing) {
            localVideoRef.current.srcObject = localStream;
          } else {
            // Screen sharing is muted - show black screen
            localVideoRef.current.srcObject = null;
          }
        } else {
          localVideoRef.current.srcObject = localStream;
        }
      } else {
        // Clear video element when no stream to prevent frozen frames
        localVideoRef.current.srcObject = null;
      }
    }

    if (localAudioRef.current) {
      if (localStream && localStream.getTracks().length > 0) {
        localAudioRef.current.srcObject = localStream;
      } else {
        localAudioRef.current.srcObject = null;
      }
    }
  }, [localStream, callType, isScreenSharing]);

  // Handle remote stream - Clear video when remote is muted + force black screen
  useEffect(() => {
    if (remoteVideoRef.current) {
      if (remoteStream && remoteStream.getTracks().length > 0) {
        // Check if remote video track is enabled
        const videoTrack = remoteStream.getVideoTracks()[0];
        if (videoTrack && videoTrack.enabled) {
          remoteVideoRef.current.srcObject = remoteStream;
        } else {
          // Remote screen sharing is muted - show black screen
          remoteVideoRef.current.srcObject = null;
        }
      } else {
        // Clear video element when no stream to prevent frozen frames
        remoteVideoRef.current.srcObject = null;
      }
    }

    if (remoteAudioRef.current) {
      if (remoteStream && remoteStream.getTracks().length > 0) {
        remoteAudioRef.current.srcObject = remoteStream;
      } else {
        remoteAudioRef.current.srcObject = null;
      }
    }
  }, [remoteStream, callType]);

  const toggleMute = () => {
    const newMutedState = !isMuted;
    setIsMuted(newMutedState);
    onToggleMute?.(newMutedState);
  };

  const toggleVideo = () => {
    if (callType !== "video") return;

    const newVideoOffState = !isVideoOff;
    setIsVideoOff(newVideoOffState);
    onToggleVideo?.(newVideoOffState);
  };

  const toggleScreenShare = () => {
    if (callType !== "screen") return;

    const newScreenOffState = !isScreenSharing;
    onToggleScreenShare?.(newScreenOffState);
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs
      .toString()
      .padStart(2, "0")}`;
  };

  const getStatusText = () => {
    switch (callStatus) {
      case "outgoing":
        return "Calling...";
      case "incoming":
        return "Incoming call";
      case "connected":
        return formatDuration(callDuration);
      case "ended":
        return "Call ended";
      default:
        return "";
    }
  };

  const getCallTypeIcon = () => {
    switch (callType) {
      case "video":
        return <Video className="w-5 h-5 text-gray-500 mr-2" />;
      case "screen":
        return <Monitor className="w-5 h-5 text-gray-500 mr-2" />;
      default:
        return <Phone className="w-5 h-5 text-gray-500 mr-2" />;
    }
  };

  const getCallTypeText = () => {
    switch (callType) {
      case "video":
        return "Video call";
      case "screen":
        return "Screen share";
      default:
        return "Audio call";
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-gray-100 bg-opacity-95 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-2xl p-6 max-w-md w-full mx-4 border border-gray-200 ring-1 ring-gray-900/5">
        {/* SCREEN CALLS: Handle exactly like video calls but with black screens when muted */}
        {(callType === "video" || callType === "screen") &&
        callStatus === "connected" ? (
          <div className="relative">
            {/* Remote video/screen - SAME AS VIDEO CALLS */}
            <div className="relative w-full h-64 bg-black rounded-lg overflow-hidden">
              <video
                ref={remoteVideoRef}
                autoPlay
                playsInline
                className="w-full h-full object-cover"
                style={{
                  display:
                    remoteStream &&
                    remoteStream.getTracks().length > 0 &&
                    remoteStream.getVideoTracks()[0]?.enabled
                      ? "block"
                      : "none",
                }}
              />

              {/* Show black screen with message when remote stream is muted */}
              {(!remoteStream ||
                remoteStream.getTracks().length === 0 ||
                !remoteStream.getVideoTracks()[0]?.enabled) && (
                <div className="absolute inset-0 bg-black flex items-center justify-center">
                  <div className="text-center text-white">
                    <Monitor className="w-12 h-12 mx-auto mb-2 opacity-50" />
                    <p className="text-sm opacity-75">
                      {callType === "screen"
                        ? "Screen sharing stopped"
                        : "Video off"}
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Local video (picture-in-picture) - SAME AS VIDEO CALLS */}
            <div className="absolute top-4 right-4 w-24 h-32 bg-black rounded border-2 border-white overflow-hidden">
              {callType === "video" && isVideoOff ? (
                // Show avatar when video is off (only for video calls)
                <div className="w-full h-full bg-gray-700 flex items-center justify-center">
                  <span className="text-white text-lg font-medium">
                    {otherUser.username.charAt(0).toUpperCase()}
                  </span>
                </div>
              ) : callType === "screen" && !isScreenSharing ? (
                // Show black screen when screen sharing is off
                <div className="w-full h-full bg-black flex items-center justify-center">
                  <Monitor className="w-6 h-6 text-white opacity-50" />
                </div>
              ) : (
                // Show video/screen for both video and screen calls when active
                <video
                  ref={localVideoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                  style={{
                    display:
                      localStream &&
                      localStream.getTracks().length > 0 &&
                      (callType === "video" ||
                        (callType === "screen" && isScreenSharing))
                        ? "block"
                        : "none",
                  }}
                />
              )}
            </div>

            {/* Screen share indicator */}
            {callType === "screen" && (
              <div className="absolute top-4 left-4 bg-blue-600 text-white px-3 py-1 rounded-full text-sm flex items-center space-x-1">
                <Monitor className="w-4 h-4" />
                <span>Screen Share Call</span>
              </div>
            )}
          </div>
        ) : (
          <div className="text-center">
            {/* User avatar */}
            <div className="w-24 h-24 bg-gray-300 rounded-full flex items-center justify-center mx-auto mb-4 overflow-hidden">
              {otherUser.avatar ? (
                <img
                  src={otherUser.avatar}
                  alt={otherUser.username}
                  className="w-full h-full object-cover"
                />
              ) : (
                <span className="text-2xl text-gray-600 font-medium">
                  {otherUser.username.charAt(0).toUpperCase()}
                </span>
              )}
            </div>

            {/* User name */}
            <h3 className="text-xl font-semibold text-gray-900 mb-2">
              {otherUser.username}
            </h3>

            {/* Call type */}
            <div className="flex items-center justify-center mb-2">
              {getCallTypeIcon()}
              <span className="text-gray-500">{getCallTypeText()}</span>
            </div>

            {/* Status */}
            <p className="text-gray-600 mb-6">{getStatusText()}</p>
          </div>
        )}

        {/* Hidden audio elements for audio calls */}
        {callType === "audio" && (
          <>
            <audio ref={localAudioRef} autoPlay muted />
            <audio ref={remoteAudioRef} autoPlay />
          </>
        )}

        {/* Call controls */}
        <div className="flex justify-center space-x-4">
          {callStatus === "incoming" && (
            <>
              <button
                onClick={onAccept}
                className="bg-green-500 hover:bg-green-600 text-white p-3 rounded-full transition-colors"
              >
                <Phone className="w-6 h-6" />
              </button>
              <button
                onClick={onReject}
                className="bg-red-500 hover:bg-red-600 text-white p-3 rounded-full transition-colors"
              >
                <PhoneOff className="w-6 h-6" />
              </button>
            </>
          )}

          {(callStatus === "outgoing" || callStatus === "connected") && (
            <>
              {/* Mute button (only for audio and video calls, not screen share) */}
              {callType !== "screen" && (
                <button
                  onClick={toggleMute}
                  className={`p-3 rounded-full transition-colors ${
                    isMuted
                      ? "bg-red-500 hover:bg-red-600 text-white"
                      : "bg-gray-200 hover:bg-gray-300 text-gray-700"
                  }`}
                >
                  {isMuted ? (
                    <MicOff className="w-6 h-6" />
                  ) : (
                    <Mic className="w-6 h-6" />
                  )}
                </button>
              )}

              {/* Video toggle (only for video calls) */}
              {callType === "video" && (
                <button
                  onClick={toggleVideo}
                  className={`p-3 rounded-full transition-colors ${
                    isVideoOff
                      ? "bg-red-500 hover:bg-red-600 text-white"
                      : "bg-gray-200 hover:bg-gray-300 text-gray-700"
                  }`}
                >
                  {isVideoOff ? (
                    <VideoOff className="w-6 h-6" />
                  ) : (
                    <Video className="w-6 h-6" />
                  )}
                </button>
              )}

              {/* Screen share toggle (only for screen calls) - SAME LOGIC AS VIDEO TOGGLE */}
              {callType === "screen" && (
                <button
                  onClick={toggleScreenShare}
                  className={`p-3 rounded-full transition-colors ${
                    !isScreenSharing
                      ? "bg-red-500 hover:bg-red-600 text-white"
                      : "bg-gray-200 hover:bg-gray-300 text-gray-700"
                  }`}
                  title={
                    isScreenSharing
                      ? "Stop sharing your screen"
                      : "Share your screen"
                  }
                >
                  {!isScreenSharing ? (
                    <MonitorOff className="w-6 h-6" />
                  ) : (
                    <Monitor className="w-6 h-6" />
                  )}
                </button>
              )}

              {/* End call button */}
              <button
                onClick={onEnd}
                className="bg-red-500 hover:bg-red-600 text-white p-3 rounded-full transition-colors"
              >
                <PhoneOff className="w-6 h-6" />
              </button>
            </>
          )}
        </div>

        {/* Testing buttons for development */}
        {process.env.NODE_ENV === "development" &&
          callType === "video" &&
          (callStatus === "outgoing" || callStatus === "connected") && (
            <div className="mt-4 pt-4 border-t border-gray-200">
              <p className="text-xs text-gray-500 text-center mb-2">
                Testing Controls (Dev Only)
              </p>
              <div className="flex justify-center">
                <button
                  onClick={onForceReleaseVideo}
                  className="px-3 py-1 text-xs bg-orange-100 text-orange-700 rounded hover:bg-orange-200 transition-colors"
                  title="Completely release camera access for testing"
                >
                  Force Release Media
                </button>
              </div>
              <p className="text-xs text-gray-400 text-center mt-1">
                {callStatus === "outgoing"
                  ? "Release media so other browser can accept the video call"
                  : "Release media to test camera switching between browsers"}
              </p>
            </div>
          )}
      </div>
    </div>
  );
}
