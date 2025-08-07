"use client";

import { useState, useEffect } from "react";
import {
  FileText,
  Download,
  File,
  Image,
  Music,
  Video,
  Archive,
  Code,
  Check,
  AlertCircle,
} from "lucide-react";

interface FileMessageProps {
  fileName: string;
  fileSize: number;
  fileType: string;
  fileData?: File;
  isOwn: boolean;
  onDownload?: () => void;
  transferProgress?: {
    percentage: number;
    status: "pending" | "transferring" | "completed" | "failed";
  };
}

export default function FileMessage({
  fileName,
  fileSize,
  fileType,
  fileData,
  isOwn,
  onDownload,
  transferProgress,
}: FileMessageProps) {
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);

  useEffect(() => {
    // Create download URL if file data is available
    if (fileData) {
      const url = URL.createObjectURL(fileData);
      setDownloadUrl(url);

      return () => {
        URL.revokeObjectURL(url);
      };
    }
  }, [fileData]);

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
  };

  const getFileIcon = () => {
    if (fileType.startsWith("image/")) return <Image className="w-5 h-5" />;
    if (fileType.startsWith("video/")) return <Video className="w-5 h-5" />;
    if (fileType.startsWith("audio/")) return <Music className="w-5 h-5" />;
    if (fileType.includes("pdf")) return <FileText className="w-5 h-5" />;
    if (fileType.includes("zip") || fileType.includes("rar"))
      return <Archive className="w-5 h-5" />;
    if (
      fileType.includes("javascript") ||
      fileType.includes("typescript") ||
      fileType.includes("python") ||
      fileType.includes("java")
    )
      return <Code className="w-5 h-5" />;
    return <File className="w-5 h-5" />;
  };

  const handleDownload = () => {
    if (downloadUrl && fileData) {
      const a = document.createElement("a");
      a.href = downloadUrl;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } else if (onDownload) {
      onDownload();
    }
  };

  const isImageFile = fileType.startsWith("image/");
  const showPreview = isImageFile && downloadUrl;

  // Determine the status message
  const getStatusMessage = () => {
    if (isOwn) {
      if (fileData) {
        return "Sent";
      }
      if (transferProgress?.status === "transferring") {
        return "Sending...";
      }
      if (transferProgress?.status === "failed") {
        return "Failed to send";
      }
      return "Sent";
    } else {
      if (fileData) {
        return "Received";
      }
      if (transferProgress?.status === "transferring") {
        return "Receiving...";
      }
      if (transferProgress?.status === "failed") {
        return "Failed to receive";
      }
      return "File not available";
    }
  };

  return (
    <div
      className={`max-w-xs sm:max-w-md lg:max-w-lg xl:max-w-xl rounded-lg ${
        isOwn ? "bg-blue-600 text-white" : "bg-gray-200 text-gray-900"
      }`}
    >
      {showPreview && (
        <div className="p-2">
          <img
            src={downloadUrl}
            alt={fileName}
            className="rounded-lg max-h-64 w-full object-contain cursor-pointer"
            onClick={handleDownload}
            onError={(e) => {
              e.currentTarget.style.display = "none";
            }}
          />
        </div>
      )}

      <div className="px-4 py-3">
        <div className="flex items-start space-x-3">
          <div
            className={`flex-shrink-0 p-2 rounded-lg ${
              isOwn ? "bg-blue-700" : "bg-gray-300"
            }`}
          >
            {getFileIcon()}
          </div>

          <div className="flex-1 min-w-0">
            <p className="font-medium text-sm truncate" title={fileName}>
              {fileName}
            </p>
            <p
              className={`text-xs mt-1 ${
                isOwn ? "text-blue-100" : "text-gray-600"
              }`}
            >
              {formatFileSize(fileSize)}
            </p>

            {transferProgress && transferProgress.status === "transferring" && (
              <div className="mt-2">
                <div className="w-full bg-gray-300 rounded-full h-1.5">
                  <div
                    className={`h-1.5 rounded-full transition-all ${
                      isOwn ? "bg-white" : "bg-blue-600"
                    }`}
                    style={{ width: `${transferProgress.percentage}%` }}
                  />
                </div>
                <p
                  className={`text-xs mt-1 ${
                    isOwn ? "text-blue-100" : "text-gray-600"
                  }`}
                >
                  {transferProgress.percentage}%
                </p>
              </div>
            )}

            {/* Status indicator */}
            <div
              className={`flex items-center space-x-1 mt-2 text-xs ${
                isOwn ? "text-blue-100" : "text-gray-600"
              }`}
            >
              {fileData ? (
                <Check className="w-3 h-3" />
              ) : transferProgress?.status === "failed" ? (
                <AlertCircle className="w-3 h-3" />
              ) : null}
              <span>{getStatusMessage()}</span>
            </div>

            {/* Download button - shown for both sender and receiver when file is available */}
            {fileData && downloadUrl && (
              <button
                onClick={handleDownload}
                className={`mt-2 flex items-center space-x-1 text-xs font-medium ${
                  isOwn
                    ? "text-blue-100 hover:text-white"
                    : "text-blue-600 hover:text-blue-700"
                }`}
              >
                <Download className="w-3 h-3" />
                <span>Download</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
