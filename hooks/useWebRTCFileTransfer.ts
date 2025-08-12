"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import io from "socket.io-client";
type Socket = ReturnType<typeof io>;

interface FileTransferProgress {
  fileId: string;
  fileName: string;
  fileSize: number;
  transferred: number;
  percentage: number;
  status: "pending" | "transferring" | "completed" | "failed";
  direction: "sending" | "receiving";
}

interface UseWebRTCFileTransferProps {
  socket: Socket | null;
  currentUserId: string;
  otherUserId: string | null;
  onFileReceived?: (file: File, metadata: any) => void;
  onTransferProgress?: (progress: FileTransferProgress) => void;
}

const CHUNK_SIZE = 16384; // 16KB chunks

export function useWebRTCFileTransfer({
  socket,
  currentUserId,
  otherUserId,
  onFileReceived,
  onTransferProgress,
}: UseWebRTCFileTransferProps) {
  const [isChannelReady, setIsChannelReady] = useState(false);
  const [connectionState, setConnectionState] = useState<'disconnected' | 'connecting' | 'connected' | 'failed'>('disconnected');
  const [transferProgress, setTransferProgress] = useState<Map<string, FileTransferProgress>>(new Map());
  
  const peerConnection = useRef<RTCPeerConnection | null>(null);
  const dataChannel = useRef<RTCDataChannel | null>(null);
  const receivingFiles = useRef<Map<string, { chunks: ArrayBuffer[], metadata: any }>>(new Map());
  const sendQueue = useRef<{ file: File, metadata: any }[]>([]);
  const isInitiator = useRef<boolean>(false);
  const connectionEstablished = useRef<boolean>(false);

  const pcConfig = {
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun1.l.google.com:19302" },
      { urls: "stun:stun2.l.google.com:19302" },
      // Add a free TURN server for better connectivity
      {
        urls: "turn:openrelay.metered.ca:80",
        username: "openrelayproject",
        credential: "openrelayproject",
      },
    ],
    iceCandidatePoolSize: 10,
    iceTransportPolicy: 'all' as RTCIceTransportPolicy, // Allow both STUN and TURN
  };

  // Update progress
  const updateProgress = useCallback((progress: FileTransferProgress) => {
    setTransferProgress(prev => {
      const newMap = new Map(prev);
      newMap.set(progress.fileId, progress);
      return newMap;
    });
    
    if (onTransferProgress) {
      onTransferProgress(progress);
    }
  }, [onTransferProgress]);

  // Handle data channel messages
  const handleDataChannelMessage = useCallback((event: MessageEvent) => {
    if (typeof event.data === "string") {
      // Control message
      const message = JSON.parse(event.data);
      
      if (message.type === "file-start") {
        console.log("Starting file receive:", message.metadata.name);
        receivingFiles.current.set(message.fileId, {
          chunks: [],
          metadata: message.metadata,
        });
        
        updateProgress({
          fileId: message.fileId,
          fileName: message.metadata.name,
          fileSize: message.metadata.size,
          transferred: 0,
          percentage: 0,
          status: "transferring",
          direction: "receiving",
        });
      } else if (message.type === "file-end") {
        handleFileComplete(message.fileId);
      }
    } else {
      // Binary data (file chunk)
      const dataView = new DataView(event.data);
      const fileIdLength = dataView.getUint8(0);
      const fileIdBytes = new Uint8Array(event.data, 1, fileIdLength);
      const fileId = new TextDecoder().decode(fileIdBytes);
      const chunkData = event.data.slice(1 + fileIdLength);
      
      const fileInfo = receivingFiles.current.get(fileId);
      if (fileInfo) {
        fileInfo.chunks.push(chunkData);
        
        const transferred = fileInfo.chunks.reduce((acc, chunk) => acc + chunk.byteLength, 0);
        const percentage = Math.round((transferred / fileInfo.metadata.size) * 100);
        
        updateProgress({
          fileId,
          fileName: fileInfo.metadata.name,
          fileSize: fileInfo.metadata.size,
          transferred,
          percentage,
          status: "transferring",
          direction: "receiving",
        });
      }
    }
  }, [updateProgress]);

  // Handle file completion
  const handleFileComplete = useCallback((fileId: string) => {
    const fileInfo = receivingFiles.current.get(fileId);
    if (!fileInfo) return;

    // Combine chunks into a single blob
    const blob = new Blob(fileInfo.chunks, { type: fileInfo.metadata.type });
    const file = new File([blob], fileInfo.metadata.name, {
      type: fileInfo.metadata.type,
      lastModified: fileInfo.metadata.lastModified,
    });

    console.log("File received:", file.name);
    
    updateProgress({
      fileId,
      fileName: fileInfo.metadata.name,
      fileSize: fileInfo.metadata.size,
      transferred: fileInfo.metadata.size,
      percentage: 100,
      status: "completed",
      direction: "receiving",
    });

    if (onFileReceived) {
      onFileReceived(file, fileInfo.metadata);
    }

    receivingFiles.current.delete(fileId);
  }, [onFileReceived, updateProgress]);

  // Create data channel (User A - Initiator)
  const createDataChannel = useCallback(() => {
    if (!peerConnection.current) {
      console.error("No peer connection for data channel");
      return;
    }

    try {
      console.log("Creating data channel (as initiator)");
      dataChannel.current = peerConnection.current.createDataChannel("fileTransfer", {
        ordered: true,
        maxRetransmits: 30,
      });

      dataChannel.current.binaryType = "arraybuffer";

      dataChannel.current.onopen = () => {
        console.log("Data channel opened (initiator)");
        setIsChannelReady(true);
        setConnectionState('connected');
        processSendQueue();
      };

      dataChannel.current.onclose = () => {
        console.log("Data channel closed (initiator)");
        setIsChannelReady(false);
      };

      dataChannel.current.onerror = (error) => {
        console.error("Data channel error (initiator):", error);
        setIsChannelReady(false);
      };

      dataChannel.current.onmessage = handleDataChannelMessage;

    } catch (error) {
      console.error("Failed to create data channel:", error);
    }
  }, [handleDataChannelMessage]);

  // Handle incoming data channel (User B - Receiver)
  const handleIncomingDataChannel = useCallback((event: RTCDataChannelEvent) => {
    console.log("Incoming data channel (as receiver)");
    dataChannel.current = event.channel;
    dataChannel.current.binaryType = "arraybuffer";

    dataChannel.current.onopen = () => {
      console.log("Incoming data channel opened (receiver)");
      setIsChannelReady(true);
      setConnectionState('connected');
    };

    dataChannel.current.onclose = () => {
      console.log("Incoming data channel closed (receiver)");
      setIsChannelReady(false);
    };

    dataChannel.current.onerror = (error) => {
      console.error("Incoming data channel error (receiver):", error);
      setIsChannelReady(false);
    };

    dataChannel.current.onmessage = handleDataChannelMessage;
  }, [handleDataChannelMessage]);

  // Initialize peer connection
  const initializePeerConnection = useCallback(() => {
    if (peerConnection.current) {
      console.log("Peer connection already exists");
      return peerConnection.current;
    }

    console.log("Initializing peer connection");
    setConnectionState('connecting');
    
    try {
      peerConnection.current = new RTCPeerConnection(pcConfig);

      // Handle ICE candidates
      peerConnection.current.onicecandidate = (event) => {
        if (event.candidate && socket && otherUserId) {
          console.log("Sending ICE candidate");
          socket.emit("file_webrtc_ice_candidate", {
            targetUserId: otherUserId,
            candidate: event.candidate,
          });
        } else if (!event.candidate) {
          console.log("ICE gathering complete");
        }
      };

      // Handle connection state changes
      peerConnection.current.onconnectionstatechange = () => {
        const state = peerConnection.current?.connectionState;
        console.log("Connection state:", state);
        
        if (state === "connected") {
          setConnectionState('connected');
          connectionEstablished.current = true;
        } else if (state === "failed") {
          setConnectionState('failed');
          console.log("Connection failed, will clean up and allow retry");
          // Clean up the failed connection to allow retry
          setTimeout(() => {
            if (peerConnection.current) {
              peerConnection.current.close();
              peerConnection.current = null;
            }
            if (dataChannel.current) {
              dataChannel.current.close();
              dataChannel.current = null;
            }
            setConnectionState('disconnected');
            setIsChannelReady(false);
            connectionEstablished.current = false;
          }, 1000);
        } else if (state === "disconnected") {
          setConnectionState('disconnected');
          setIsChannelReady(false);
        } else if (state === "connecting") {
          setConnectionState('connecting');
        }
      };

      // Handle ICE connection state changes
      peerConnection.current.oniceconnectionstatechange = () => {
        const state = peerConnection.current?.iceConnectionState;
        console.log("ICE connection state:", state);
        
        if (state === "failed") {
          console.log("ICE connection failed - this usually means both users are behind symmetric NATs");
          console.log("Consider adding TURN servers for production use");
        }
      };

      // Handle incoming data channel (for receiver)
      peerConnection.current.ondatachannel = handleIncomingDataChannel;

      return peerConnection.current;
    } catch (error) {
      console.error("Failed to initialize peer connection:", error);
      setConnectionState('failed');
      return null;
    }
  }, [socket, otherUserId, handleIncomingDataChannel]);

  // Send file through data channel
  const sendFile = useCallback(async (file: File, metadata: any) => {
    if (!dataChannel.current || dataChannel.current.readyState !== "open") {
      console.log("Data channel not ready for file:", file.name);
      return false;
    }

    const fileId = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    console.log("Sending file:", file.name);
    
    try {
      // Send file start message
      dataChannel.current.send(JSON.stringify({
        type: "file-start",
        fileId,
        metadata: {
          ...metadata,
          name: file.name,
          size: file.size,
          type: file.type,
          lastModified: file.lastModified,
        },
      }));

      updateProgress({
        fileId,
        fileName: file.name,
        fileSize: file.size,
        transferred: 0,
        percentage: 0,
        status: "transferring",
        direction: "sending",
      });

      // Read and send file in chunks
      const reader = new FileReader();
      let offset = 0;

      const readNextChunk = () => {
        if (offset >= file.size) {
          // File complete
          if (dataChannel.current && dataChannel.current.readyState === "open") {
            dataChannel.current.send(JSON.stringify({
              type: "file-end",
              fileId,
            }));
            
            updateProgress({
              fileId,
              fileName: file.name,
              fileSize: file.size,
              transferred: file.size,
              percentage: 100,
              status: "completed",
              direction: "sending",
            });
            
            console.log("File sent:", file.name);
          }
          return;
        }

        const slice = file.slice(offset, offset + CHUNK_SIZE);
        reader.readAsArrayBuffer(slice);
      };

      reader.onload = (e) => {
        if (e.target?.result && dataChannel.current?.readyState === "open") {
          const chunk = e.target.result as ArrayBuffer;
          
          // Prepend file ID to chunk
          const fileIdBytes = new TextEncoder().encode(fileId);
          const message = new ArrayBuffer(1 + fileIdBytes.length + chunk.byteLength);
          const messageView = new DataView(message);
          
          messageView.setUint8(0, fileIdBytes.length);
          new Uint8Array(message, 1, fileIdBytes.length).set(fileIdBytes);
          new Uint8Array(message, 1 + fileIdBytes.length).set(new Uint8Array(chunk));
          
          dataChannel.current.send(message);
          
          offset += chunk.byteLength;
          const percentage = Math.round((offset / file.size) * 100);
          
          updateProgress({
            fileId,
            fileName: file.name,
            fileSize: file.size,
            transferred: offset,
            percentage,
            status: "transferring",
            direction: "sending",
          });

          // Control flow based on buffer
          if (dataChannel.current.bufferedAmount < 65536) {
            setTimeout(readNextChunk, 1);
          } else {
            setTimeout(readNextChunk, 10);
          }
        } else {
          updateProgress({
            fileId,
            fileName: file.name,
            fileSize: file.size,
            transferred: offset,
            percentage: Math.round((offset / file.size) * 100),
            status: "failed",
            direction: "sending",
          });
        }
      };

      reader.onerror = (error) => {
        console.error("File read error:", error);
        updateProgress({
          fileId,
          fileName: file.name,
          fileSize: file.size,
          transferred: offset,
          percentage: Math.round((offset / file.size) * 100),
          status: "failed",
          direction: "sending",
        });
      };

      readNextChunk();
      return true;
    } catch (error) {
      console.error("Error sending file:", error);
      updateProgress({
        fileId,
        fileName: file.name,
        fileSize: file.size,
        transferred: 0,
        percentage: 0,
        status: "failed",
        direction: "sending",
      });
      return false;
    }
  }, [updateProgress]);

  // Process send queue
  const processSendQueue = useCallback(() => {
    if (sendQueue.current.length === 0 || !isChannelReady || dataChannel.current?.readyState !== "open") {
      return;
    }

    console.log(`Processing send queue: ${sendQueue.current.length} files`);
    
    // Send files one by one
    const processNext = () => {
      if (sendQueue.current.length === 0) return;
      
      const fileToSend = sendQueue.current.shift();
      if (fileToSend) {
        sendFile(fileToSend.file, fileToSend.metadata).then((success) => {
          if (success && sendQueue.current.length > 0) {
            // Small delay before next file
            setTimeout(processNext, 100);
          }
        });
      }
    };

    processNext();
  }, [isChannelReady, sendFile]);

  // Establish connection (Step 1-7 of the flow)
  const establishConnection = useCallback(async () => {
    if (connectionState === 'connected') {
      console.log("Connection already established");
      return;
    }
    
    if (connectionState === 'connecting') {
      console.log("Connection already in progress");
      return;
    }

    if (!socket || !otherUserId) {
      console.log("Cannot establish connection - missing socket or otherUserId");
      return;
    }

    console.log("=== Starting WebRTC Connection Establishment ===");
    console.log("Step 1: Creating RTCPeerConnection");
    
    const pc = initializePeerConnection();
    if (!pc) return;

    // Determine who is the initiator (User A)
    // User with smaller ID becomes initiator for consistency
    isInitiator.current = currentUserId < otherUserId;

    if (isInitiator.current) {
      console.log("Step 2: Opening DataChannel (as initiator)");
      createDataChannel();

      console.log("Step 3: Creating and sending SDP offer");
      try {
        const offer = await pc.createOffer({
          offerToReceiveAudio: false,
          offerToReceiveVideo: false,
        });
        await pc.setLocalDescription(offer);
        
        socket.emit("file_webrtc_offer", {
          targetUserId: otherUserId,
          offer,
        });
        console.log("Step 4: Offer sent to backend for relay");
      } catch (error) {
        console.error("Error creating offer:", error);
        setConnectionState('failed');
      }
    } else {
      console.log("Waiting for incoming offer (as receiver)");
    }
  }, [socket, otherUserId, currentUserId, connectionState, initializePeerConnection, createDataChannel]);

  // Handle WebRTC signaling (Steps 4-7 of the flow)
  useEffect(() => {
    if (!socket || !otherUserId) return;

    console.log("Setting up WebRTC signaling for", otherUserId);

    const handleFileOffer = async (data: { userId: string; offer: RTCSessionDescriptionInit }) => {
      if (data.userId !== otherUserId) return;
      
      console.log("Step 5: Received offer from", data.userId);
      console.log("Creating RTCPeerConnection and setting offer as remoteDescription");
      
      const pc = initializePeerConnection();
      if (!pc) return;
      
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
        
        console.log("Step 6: Creating and sending SDP answer");
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        
        socket.emit("file_webrtc_answer", {
          targetUserId: otherUserId,
          answer,
        });
        console.log("Answer sent back through backend");
      } catch (error) {
        console.error("Error handling offer:", error);
        setConnectionState('failed');
      }
    };

    const handleFileAnswer = async (data: { userId: string; answer: RTCSessionDescriptionInit }) => {
      if (data.userId !== otherUserId) return;
      
      console.log("Received answer from", data.userId);
      
      if (peerConnection.current) {
        try {
          await peerConnection.current.setRemoteDescription(new RTCSessionDescription(data.answer));
          console.log("Answer set as remoteDescription");
        } catch (error) {
          console.error("Error setting answer:", error);
          setConnectionState('failed');
        }
      }
    };

    const handleFileIceCandidate = async (data: { userId: string; candidate: RTCIceCandidateInit }) => {
      if (data.userId !== otherUserId) return;
      
      if (peerConnection.current && peerConnection.current.remoteDescription) {
        try {
          await peerConnection.current.addIceCandidate(new RTCIceCandidate(data.candidate));
        } catch (error) {
          console.error("Error adding ICE candidate:", error);
        }
      }
    };

    socket.on("file_webrtc_offer", handleFileOffer);
    socket.on("file_webrtc_answer", handleFileAnswer);
    socket.on("file_webrtc_ice_candidate", handleFileIceCandidate);

    return () => {
      socket.off("file_webrtc_offer", handleFileOffer);
      socket.off("file_webrtc_answer", handleFileAnswer);
      socket.off("file_webrtc_ice_candidate", handleFileIceCandidate);
    };
  }, [socket, otherUserId]); // Only depend on socket and otherUserId

  // Queue file for sending
  const queueFile = useCallback((file: File, metadata: any = {}) => {
    if (file.size > 10 * 1024 * 1024) {
      console.error("File too large. Maximum size is 10MB");
      return false;
    }
    
    console.log(`Queueing file: ${file.name} (State: ${connectionState}, Ready: ${isChannelReady})`);
    
    if (isChannelReady && dataChannel.current?.readyState === "open") {
      // Step 8: DataChannel is ready, send immediately
      console.log("DataChannel ready, sending file immediately");
      sendFile(file, metadata).catch(console.error);
      return true;
    } else {
      // Queue the file
      sendQueue.current.push({ file, metadata });
      console.log(`File queued. Total queued files: ${sendQueue.current.length}`);
      
      if (connectionState === 'disconnected' || connectionState === 'failed') {
        console.log("Establishing P2P connection for queued files");
        establishConnection().catch(console.error);
      } else if (connectionState === 'connecting') {
        console.log("Connection in progress, file will be sent when ready");
      }
      
      return true; // File was queued successfully
    }
  }, [isChannelReady, connectionState, sendFile, establishConnection]);

  // Cleanup
  const cleanup = useCallback(() => {
    console.log("Cleaning up WebRTC file transfer resources");
    
    if (dataChannel.current) {
      dataChannel.current.close();
      dataChannel.current = null;
    }
    
    if (peerConnection.current) {
      peerConnection.current.close();
      peerConnection.current = null;
    }
    
    setIsChannelReady(false);
    setConnectionState('disconnected');
    receivingFiles.current.clear();
    sendQueue.current = [];
    connectionEstablished.current = false;
    isInitiator.current = false;
  }, []);

  // Reset when switching users
  useEffect(() => {
    if (otherUserId) {
      // Small delay to avoid race conditions
      const timer = setTimeout(() => {
        cleanup();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [otherUserId]);

  // Cleanup on unmount
  useEffect(() => {
    return () => cleanup();
  }, [cleanup]);

  return {
    isChannelReady,
    connectionState,
    sendFile: queueFile,
    establishConnection, // Expose this function
    transferProgress: Array.from(transferProgress.values()),
    cleanup,
  };
}