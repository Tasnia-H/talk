"use client";

import { useState, useEffect, useRef } from "react";
import { Phone, PhoneOff, Video, VideoOff, Mic, MicOff } from "lucide-react";

interface User {
  id: string;
  username: string;
  avatar?: string;
}

interface CallModalProps {
  isOpen: boolean;
  callType: "audio" | "video";
  callStatus: "outgoing" | "incoming" | "connected" | "ended";
  otherUser: User;
  onAccept?: () => void;
  onReject?: () => void;
  onEnd: () => void;
  onToggleMute?: (isMuted: boolean) => void;
  onToggleVideo?: (isVideoOff: boolean) => void;
  onForceReleaseVideo?: () => void;
  localStream?: MediaStream;
  remoteStream?: MediaStream;
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
  onForceReleaseVideo,
  localStream,
  remoteStream,
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

  // Handle local stream
  useEffect(() => {
    if (localStream) {
      if (callType === "video" && localVideoRef.current) {
        localVideoRef.current.srcObject = localStream;
      } else if (callType === "audio" && localAudioRef.current) {
        localAudioRef.current.srcObject = localStream;
      }
    }
  }, [localStream, callType]);

  // Handle remote stream
  useEffect(() => {
    if (remoteStream) {
      if (callType === "video" && remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = remoteStream;
      } else if (callType === "audio" && remoteAudioRef.current) {
        remoteAudioRef.current.srcObject = remoteStream;
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

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-gray-100 bg-opacity-95 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-2xl p-6 max-w-md w-full mx-4 border border-gray-200 ring-1 ring-gray-900/5">
        {callType === "video" && callStatus === "connected" ? (
          <div className="relative">
            {/* Remote video */}
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              className="w-full h-64 bg-gray-800 rounded-lg object-cover"
            />

            {/* Local video (picture-in-picture) */}
            <div className="absolute top-4 right-4 w-24 h-32 bg-gray-600 rounded border-2 border-white overflow-hidden">
              {isVideoOff ? (
                // Show avatar when video is off
                <div className="w-full h-full bg-gray-700 flex items-center justify-center">
                  <span className="text-white text-lg font-medium">
                    {otherUser.username.charAt(0).toUpperCase()}
                  </span>
                </div>
              ) : (
                // Show video when video is on
                <video
                  ref={localVideoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                />
              )}
            </div>
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
              {callType === "video" ? (
                <Video className="w-5 h-5 text-gray-500 mr-2" />
              ) : (
                <Phone className="w-5 h-5 text-gray-500 mr-2" />
              )}
              <span className="text-gray-500 capitalize">{callType} call</span>
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
              {/* Mute button */}
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
