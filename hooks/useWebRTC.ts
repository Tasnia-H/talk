"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import io from "socket.io-client"; 
type Socket = ReturnType<typeof io>;

interface UseWebRTCProps {
  socket: Socket | null;
  callId: string | null;
  isInitiator: boolean;
}

export function useWebRTC({ socket, callId, isInitiator }: UseWebRTCProps) {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  
  const peerConnection = useRef<RTCPeerConnection | null>(null);
  const iceCandidateQueue = useRef<RTCIceCandidate[]>([]);
  const currentCallIdRef = useRef<string | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);

  // STUN servers configuration
  const pcConfig = {
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
    ],
  };

  // Initialize peer connection
  const initializePeerConnection = useCallback(() => {
    if (peerConnection.current) {
      console.log("Peer connection already exists");
      return;
    }
    
    console.log("Initializing peer connection");

    try {
      peerConnection.current = new RTCPeerConnection(pcConfig);

      // Handle ICE candidates
      peerConnection.current.onicecandidate = (event) => {
        console.log("ICE candidate generated:", event.candidate);
        if (event.candidate && socket && currentCallIdRef.current) {
          socket.emit("webrtc_ice_candidate", {
            callId: currentCallIdRef.current,
            candidate: event.candidate,
          });
        }
      };

      // Handle remote stream
      peerConnection.current.ontrack = (event) => {
        console.log("Remote track received:", event.streams[0]);
        const [stream] = event.streams;
        setRemoteStream(stream);
      };

      // Handle connection state changes
      peerConnection.current.onconnectionstatechange = () => {
        const state = peerConnection.current?.connectionState;
        console.log("Connection state changed:", state);
        setIsConnected(state === "connected");
        
        if (state === "failed") {
          console.log("Connection failed, attempting to restart ICE");
          peerConnection.current?.restartIce();
        }
      };

      // Handle ICE connection state changes
      peerConnection.current.oniceconnectionstatechange = () => {
        const state = peerConnection.current?.iceConnectionState;
        console.log("ICE connection state changed:", state);
        
        if (state === "connected" || state === "completed") {
          setIsConnected(true);
        } else if (state === "failed") {
          console.log("ICE connection failed, restarting ICE");
          peerConnection.current?.restartIce();
        } else if (state === "disconnected") {
          setIsConnected(false);
        }
      };

      console.log("Peer connection initialized successfully");
    } catch (error) {
      console.error("Failed to initialize peer connection:", error);
    }
  }, [socket]);

  // Update current call ID reference
  useEffect(() => {
    currentCallIdRef.current = callId;
  }, [callId]);

  // Get user media
  const getUserMedia = useCallback(async (video: boolean = false) => {
    try {
      console.log("Getting user media, video:", video);
      
      // Stop existing stream if any
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => {
          track.stop();
          console.log("Stopped existing track:", track.kind);
        });
      }

      const constraints = {
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: video ? { 
          width: { ideal: 640 }, 
          height: { ideal: 480 },
          frameRate: { ideal: 30 }
        } : false,
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      console.log("Got user media:", stream);
      
      localStreamRef.current = stream;
      setLocalStream(stream);
      return stream;
    } catch (error) {
      console.error("Error accessing media devices:", error);
      throw error;
    }
  }, []);

  // Add local stream to peer connection
  const addLocalStream = useCallback((stream: MediaStream) => {
    if (!peerConnection.current) {
      console.error("Peer connection not initialized");
      return;
    }

    console.log("Adding local stream to peer connection");
    
    // Remove existing senders first
    const senders = peerConnection.current.getSenders();
    senders.forEach(sender => {
      if (sender.track) {
        console.log("Removing existing track:", sender.track.kind);
        peerConnection.current?.removeTrack(sender);
      }
    });

    // Add new tracks
    stream.getTracks().forEach((track) => {
      console.log("Adding track:", track.kind);
      peerConnection.current?.addTrack(track, stream);
    });
  }, []);

  // Create and send offer
  const createOffer = useCallback(async () => {
    if (!peerConnection.current || !socket || !currentCallIdRef.current) {
      console.error("Cannot create offer - missing dependencies", {
        peerConnection: !!peerConnection.current,
        socket: !!socket,
        callId: currentCallIdRef.current
      });
      return;
    }

    try {
      console.log("Creating offer for call:", currentCallIdRef.current);
      const offer = await peerConnection.current.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true,
      });
      
      await peerConnection.current.setLocalDescription(offer);
      console.log("Local description set, sending offer");

      socket.emit("webrtc_offer", {
        callId: currentCallIdRef.current,
        offer,
      });
    } catch (error) {
      console.error("Error creating offer:", error);
    }
  }, [socket]);

  // Handle incoming offer
  const handleOffer = useCallback(async (offer: RTCSessionDescriptionInit) => {
    if (!peerConnection.current || !socket || !currentCallIdRef.current) {
      console.error("Peer connection not initialized for handling offer");
      return;
    }

    try {
      console.log("Handling incoming offer");
      await peerConnection.current.setRemoteDescription(new RTCSessionDescription(offer));
      console.log("Remote description set");

      // Process queued ICE candidates
      console.log("Processing queued ICE candidates:", iceCandidateQueue.current.length);
      while (iceCandidateQueue.current.length > 0) {
        const candidate = iceCandidateQueue.current.shift();
        if (candidate) {
          try {
            await peerConnection.current.addIceCandidate(candidate);
            console.log("Added queued ICE candidate");
          } catch (err) {
            console.error("Error adding queued ICE candidate:", err);
          }
        }
      }

      console.log("Creating answer");
      const answer = await peerConnection.current.createAnswer();
      await peerConnection.current.setLocalDescription(answer);

      console.log("Sending answer via socket");
      socket.emit("webrtc_answer", {
        callId: currentCallIdRef.current,
        answer,
      });
    } catch (error) {
      console.error("Error handling offer:", error);
    }
  }, [socket]);

  // Handle incoming answer
  const handleAnswer = useCallback(async (answer: RTCSessionDescriptionInit) => {
    if (!peerConnection.current) {
      console.error("Peer connection not initialized for handling answer");
      return;
    }

    try {
      console.log("Handling incoming answer");
      await peerConnection.current.setRemoteDescription(new RTCSessionDescription(answer));
      console.log("Remote description set for answer");

      // Process queued ICE candidates
      console.log("Processing queued ICE candidates:", iceCandidateQueue.current.length);
      while (iceCandidateQueue.current.length > 0) {
        const candidate = iceCandidateQueue.current.shift();
        if (candidate) {
          try {
            await peerConnection.current.addIceCandidate(candidate);
            console.log("Added queued ICE candidate");
          } catch (err) {
            console.error("Error adding queued ICE candidate:", err);
          }
        }
      }
    } catch (error) {
      console.error("Error handling answer:", error);
    }
  }, []);

  // Handle incoming ICE candidate
  const handleIceCandidate = useCallback(async (candidate: RTCIceCandidateInit) => {
    if (!peerConnection.current) {
      console.error("Peer connection not initialized for handling ICE candidate");
      return;
    }

    try {
      const iceCandidate = new RTCIceCandidate(candidate);
      
      if (peerConnection.current.remoteDescription) {
        console.log("Adding ICE candidate immediately");
        await peerConnection.current.addIceCandidate(iceCandidate);
      } else {
        // Queue the candidate if remote description is not set yet
        console.log("Queueing ICE candidate - no remote description yet");
        iceCandidateQueue.current.push(iceCandidate);
      }
    } catch (error) {
      console.error("Error handling ICE candidate:", error);
    }
  }, []);

  // Toggle video - properly disable/enable video without breaking connection
  const toggleVideo = useCallback(async (isVideoOff: boolean) => {
    if (!localStreamRef.current) return;

    if (isVideoOff) {
      // Disable video track but keep it in the stream
      const videoTrack = localStreamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = false;
        console.log("Video disabled (track kept)");
      }
    } else {
      // Check if we have an existing video track
      const existingVideoTrack = localStreamRef.current.getVideoTracks()[0];
      
      if (existingVideoTrack && !existingVideoTrack.enabled) {
        // Re-enable existing track
        existingVideoTrack.enabled = true;
        console.log("Video re-enabled");
      } else if (!existingVideoTrack) {
        // No video track exists, create a new one
        try {
          const videoStream = await navigator.mediaDevices.getUserMedia({ 
            video: { 
              width: { ideal: 640 }, 
              height: { ideal: 480 },
              frameRate: { ideal: 30 }
            }
          });
          const newVideoTrack = videoStream.getVideoTracks()[0];
          
          if (newVideoTrack) {
            localStreamRef.current.addTrack(newVideoTrack);
            
            // Update peer connection
            if (peerConnection.current) {
              peerConnection.current.addTrack(newVideoTrack, localStreamRef.current);
            }
            
            // Update local stream state
            setLocalStream(new MediaStream(localStreamRef.current.getTracks()));
            console.log("New video track added");
          }
        } catch (error) {
          console.error("Failed to get video track:", error);
          alert("Failed to access camera. Please check camera permissions.");
        }
      }
    }
    
    // Update the local stream to trigger re-render
    setLocalStream(new MediaStream(localStreamRef.current.getTracks()));
  }, []);

  // Toggle mute - properly disable/enable audio without breaking connection
  const toggleMute = useCallback(async (isMuted: boolean) => {
    if (!localStreamRef.current) return;

    if (isMuted) {
      // Disable audio track but keep it in the stream
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = false;
        console.log("Audio disabled (track kept)");
      }
    } else {
      // Check if we have an existing audio track
      const existingAudioTrack = localStreamRef.current.getAudioTracks()[0];
      
      if (existingAudioTrack && !existingAudioTrack.enabled) {
        // Re-enable existing track
        existingAudioTrack.enabled = true;
        console.log("Audio re-enabled");
      } else if (!existingAudioTrack) {
        // No audio track exists, create a new one
        try {
          const audioStream = await navigator.mediaDevices.getUserMedia({ 
            audio: {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
            }
          });
          const newAudioTrack = audioStream.getAudioTracks()[0];
          
          if (newAudioTrack) {
            localStreamRef.current.addTrack(newAudioTrack);
            
            // Update peer connection
            if (peerConnection.current) {
              peerConnection.current.addTrack(newAudioTrack, localStreamRef.current);
            }
            
            // Update local stream state
            setLocalStream(new MediaStream(localStreamRef.current.getTracks()));
            console.log("New audio track added");
          }
        } catch (error) {
          console.error("Failed to get audio track:", error);
          alert("Failed to access microphone. Please check microphone permissions.");
        }
      }
    }
    
    // Update the local stream to trigger re-render
    setLocalStream(new MediaStream(localStreamRef.current.getTracks()));
  }, []);

  // Force release media for testing (completely stops tracks)
  const forceReleaseVideo = useCallback(() => {
    if (!localStreamRef.current) return;
    
    const videoTrack = localStreamRef.current.getVideoTracks()[0];
    if (videoTrack) {
      videoTrack.stop();
      localStreamRef.current.removeTrack(videoTrack);
      
      // Update peer connection
      if (peerConnection.current) {
        const sender = peerConnection.current.getSenders().find(s => 
          s.track && s.track.kind === 'video'
        );
        if (sender && sender.track) {
          sender.replaceTrack(null);
        }
      }
      
      // Update local stream state
      setLocalStream(new MediaStream(localStreamRef.current.getTracks()));
      console.log("Video track completely released");
    }
  }, []);
  // Cleanup function
  const cleanup = useCallback(() => {
    console.log("Cleaning up WebRTC resources");
    
    // Stop local stream
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => {
        console.log("Stopping track:", track.kind);
        track.stop();
      });
      localStreamRef.current = null;
      setLocalStream(null);
    }

    // Close peer connection
    if (peerConnection.current) {
      console.log("Closing peer connection");
      peerConnection.current.close();
      peerConnection.current = null;
    }

    setRemoteStream(null);
    setIsConnected(false);
    iceCandidateQueue.current = [];
    currentCallIdRef.current = null;
  }, []);

  // Setup WebRTC event listeners
  useEffect(() => {
    if (!socket || !callId) {
      console.log("No socket or callId, skipping WebRTC listeners setup");
      return;
    }

    console.log("Setting up WebRTC event listeners for callId:", callId);

    const handleWebRTCOffer = (data: { callId: string; offer: RTCSessionDescriptionInit }) => {
      console.log("Received WebRTC offer for callId:", data.callId, "current callId:", callId);
      if (data.callId === callId) {
        handleOffer(data.offer);
      }
    };

    const handleWebRTCAnswer = (data: { callId: string; answer: RTCSessionDescriptionInit }) => {
      console.log("Received WebRTC answer for callId:", data.callId, "current callId:", callId);
      if (data.callId === callId) {
        handleAnswer(data.answer);
      }
    };

    const handleWebRTCIceCandidate = (data: { callId: string; candidate: RTCIceCandidateInit }) => {
      console.log("Received ICE candidate for callId:", data.callId, "current callId:", callId);
      if (data.callId === callId) {
        handleIceCandidate(data.candidate);
      }
    };

    socket.on("webrtc_offer", handleWebRTCOffer);
    socket.on("webrtc_answer", handleWebRTCAnswer);
    socket.on("webrtc_ice_candidate", handleWebRTCIceCandidate);

    return () => {
      console.log("Cleaning up WebRTC event listeners for callId:", callId);
      socket.off("webrtc_offer", handleWebRTCOffer);
      socket.off("webrtc_answer", handleWebRTCAnswer);
      socket.off("webrtc_ice_candidate", handleWebRTCIceCandidate);
    };
  }, [socket, callId, handleOffer, handleAnswer, handleIceCandidate]);

  // Cleanup when callId changes or component unmounts
  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);

  return {
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
    cleanup,
  };
}