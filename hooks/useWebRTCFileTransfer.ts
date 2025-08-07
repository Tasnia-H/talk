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
  const [transferProgress, setTransferProgress] = useState<Map<string, FileTransferProgress>>(new Map());
  
  const peerConnection = useRef<RTCPeerConnection | null>(null);
  const dataChannel = useRef<RTCDataChannel | null>(null);
  const receivingFiles = useRef<Map<string, { chunks: ArrayBuffer[], metadata: any }>>(new Map());
  const sendQueue = useRef<{ file: File, metadata: any }[]>([]);
  const currentSendingFile = useRef<{ file: File, metadata: any, offset: number } | null>(null);

  const pcConfig = {
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun1.l.google.com:19302" },
    ],
  };

  // Initialize peer connection for data channel
  const initializePeerConnection = useCallback(() => {
    if (peerConnection.current) {
      console.log("File transfer peer connection already exists");
      return;
    }

    console.log("Initializing file transfer peer connection");
    
    try {
      peerConnection.current = new RTCPeerConnection(pcConfig);

      // Handle ICE candidates
      peerConnection.current.onicecandidate = (event) => {
        if (event.candidate && socket && otherUserId) {
          socket.emit("file_webrtc_ice_candidate", {
            targetUserId: otherUserId,
            candidate: event.candidate,
          });
        }
      };

      // Handle connection state
      peerConnection.current.onconnectionstatechange = () => {
        const state = peerConnection.current?.connectionState;
        console.log("File transfer connection state:", state);
        
        if (state === "failed") {
          cleanup();
          setTimeout(() => setupDataChannel(), 1000); // Retry
        }
      };

    } catch (error) {
      console.error("Failed to initialize file transfer peer connection:", error);
    }
  }, [socket, otherUserId]);

  // Create data channel
  const createDataChannel = useCallback(() => {
    if (!peerConnection.current) {
      console.error("No peer connection for data channel");
      return;
    }

    try {
      dataChannel.current = peerConnection.current.createDataChannel("fileTransfer", {
        ordered: true,
        maxRetransmits: 30,
      });

      dataChannel.current.binaryType = "arraybuffer";

      dataChannel.current.onopen = () => {
        console.log("Data channel opened");
        setIsChannelReady(true);
        processSendQueue();
      };

      dataChannel.current.onclose = () => {
        console.log("Data channel closed");
        setIsChannelReady(false);
      };

      dataChannel.current.onerror = (error) => {
        console.error("Data channel error:", error);
        setIsChannelReady(false);
      };

      dataChannel.current.onmessage = handleDataChannelMessage;

    } catch (error) {
      console.error("Failed to create data channel:", error);
    }
  }, []);

  // Handle incoming data channel
  const handleIncomingDataChannel = useCallback((event: RTCDataChannelEvent) => {
    console.log("Incoming data channel");
    dataChannel.current = event.channel;
    dataChannel.current.binaryType = "arraybuffer";

    dataChannel.current.onopen = () => {
      console.log("Incoming data channel opened");
      setIsChannelReady(true);
    };

    dataChannel.current.onclose = () => {
      console.log("Incoming data channel closed");
      setIsChannelReady(false);
    };

    dataChannel.current.onerror = (error) => {
      console.error("Incoming data channel error:", error);
      setIsChannelReady(false);
    };

    dataChannel.current.onmessage = handleDataChannelMessage;
  }, []);

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
  }, []);

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
  }, [onFileReceived]);

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

  // Send file through data channel
  const sendFile = useCallback(async (file: File, metadata: any) => {
    if (!dataChannel.current || dataChannel.current.readyState !== "open") {
      console.log("Data channel not ready, queueing file");
      sendQueue.current.push({ file, metadata });
      
      // Try to establish connection if not already
      if (!peerConnection.current) {
        setupDataChannel();
      }
      return;
    }

    const fileId = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    console.log("Sending file:", file.name);
    
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

        if (offset < file.size) {
          // Use bufferedAmount to control flow
          if (dataChannel.current.bufferedAmount < 65536) { // 64KB buffer threshold
            readNextChunk();
          } else {
            // Wait for buffer to clear
            setTimeout(readNextChunk, 10);
          }
        } else {
          // File complete
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
          
          // Process next file in queue
          processSendQueue();
        }
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
      processSendQueue();
    };

    readNextChunk();
  }, [updateProgress]);

  // Process send queue
  const processSendQueue = useCallback(() => {
    if (sendQueue.current.length > 0 && !currentSendingFile.current && isChannelReady) {
      const next = sendQueue.current.shift();
      if (next) {
        sendFile(next.file, next.metadata);
      }
    }
  }, [isChannelReady, sendFile]);

  // Setup data channel connection
  const setupDataChannel = useCallback(async () => {
    if (!socket || !otherUserId) return;
    
    console.log("Setting up data channel connection");
    initializePeerConnection();
    
    if (peerConnection.current) {
      peerConnection.current.ondatachannel = handleIncomingDataChannel;
      createDataChannel();
      
      // Create offer
      try {
        const offer = await peerConnection.current.createOffer();
        await peerConnection.current.setLocalDescription(offer);
        
        socket.emit("file_webrtc_offer", {
          targetUserId: otherUserId,
          offer,
        });
      } catch (error) {
        console.error("Error creating file transfer offer:", error);
      }
    }
  }, [socket, otherUserId, initializePeerConnection, createDataChannel, handleIncomingDataChannel]);

  // Handle WebRTC signaling
  useEffect(() => {
    if (!socket || !otherUserId) return;

    const handleFileOffer = async (data: { userId: string; offer: RTCSessionDescriptionInit }) => {
      if (data.userId !== otherUserId) return;
      
      console.log("Received file transfer offer");
      
      if (!peerConnection.current) {
  initializePeerConnection();
}

if (peerConnection.current) {
  peerConnection.current.ondatachannel = handleIncomingDataChannel;
}
      
      if (peerConnection.current) {
        try {
          await peerConnection.current.setRemoteDescription(new RTCSessionDescription(data.offer));
          const answer = await peerConnection.current.createAnswer();
          await peerConnection.current.setLocalDescription(answer);
          
          socket.emit("file_webrtc_answer", {
            targetUserId: otherUserId,
            answer,
          });
        } catch (error) {
          console.error("Error handling file offer:", error);
        }
      }
    };

    const handleFileAnswer = async (data: { userId: string; answer: RTCSessionDescriptionInit }) => {
      if (data.userId !== otherUserId) return;
      
      console.log("Received file transfer answer");
      
      if (peerConnection.current) {
        try {
          await peerConnection.current.setRemoteDescription(new RTCSessionDescription(data.answer));
        } catch (error) {
          console.error("Error handling file answer:", error);
        }
      }
    };

    const handleFileIceCandidate = async (data: { userId: string; candidate: RTCIceCandidateInit }) => {
      if (data.userId !== otherUserId) return;
      
      if (peerConnection.current && peerConnection.current.remoteDescription) {
        try {
          await peerConnection.current.addIceCandidate(new RTCIceCandidate(data.candidate));
        } catch (error) {
          console.error("Error adding file ICE candidate:", error);
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
  }, [socket, otherUserId, initializePeerConnection, handleIncomingDataChannel]);

  // Cleanup
  const cleanup = useCallback(() => {
    console.log("Cleaning up file transfer resources");
    
    if (dataChannel.current) {
      dataChannel.current.close();
      dataChannel.current = null;
    }
    
    if (peerConnection.current) {
      peerConnection.current.close();
      peerConnection.current = null;
    }
    
    setIsChannelReady(false);
    receivingFiles.current.clear();
    sendQueue.current = [];
    currentSendingFile.current = null;
  }, []);

  // Cleanup on unmount or user change
  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);

  // Queue file for sending
  const queueFile = useCallback((file: File, metadata: any = {}) => {
    if (file.size > 10 * 1024 * 1024) { // 10MB limit
      console.error("File too large. Maximum size is 10MB");
      return false;
    }
    
    sendQueue.current.push({ file, metadata });
    
    if (isChannelReady) {
      processSendQueue();
    } else {
      setupDataChannel();
    }
    
    return true;
  }, [isChannelReady, processSendQueue, setupDataChannel]);

  return {
    isChannelReady,
    sendFile: queueFile,
    transferProgress: Array.from(transferProgress.values()),
    cleanup,
  };
}