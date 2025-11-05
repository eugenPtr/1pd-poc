"use client";

import { useState } from "react";
import imageCompression from "browser-image-compression";

const MAX_FILE_SIZE_MB = 2;
const TARGET_SIZE_PX = 256;
const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/jpg", "image/gif", "image/svg+xml", "image/webp"];

type UploadResult = {
  cid: string;
  url: string;
  ipfsUri: string;
};

export function useIPFSUpload() {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<UploadResult | null>(null);

  const uploadToIPFS = async (file: File): Promise<UploadResult> => {
    try {
      setUploading(true);
      setProgress(0);
      setError(null);

      // Validate file type
      if (!ALLOWED_TYPES.includes(file.type)) {
        throw new Error("Invalid file type. Please upload an image (PNG, JPG, GIF, SVG, or WebP).");
      }

      // Validate file size
      const fileSizeMB = file.size / 1024 / 1024;
      if (fileSizeMB > MAX_FILE_SIZE_MB) {
        throw new Error(`File size (${fileSizeMB.toFixed(2)}MB) exceeds maximum of ${MAX_FILE_SIZE_MB}MB.`);
      }

      setProgress(10);

      // Resize image to 256x256px (unless it's SVG)
      let processedFile = file;
      if (file.type !== "image/svg+xml") {
        try {
          const options = {
            maxSizeMB: 1,
            maxWidthOrHeight: TARGET_SIZE_PX,
            useWebWorker: true,
            onProgress: (progressPercent: number) => {
              // Map 0-100 to 10-40 range for resize progress
              setProgress(10 + (progressPercent * 30) / 100);
            },
          };

          processedFile = await imageCompression(file, options);
          setProgress(40);
        } catch (resizeError) {
          console.warn("Image resize failed, uploading original:", resizeError);
          // Continue with original file if resize fails
        }
      } else {
        setProgress(40);
      }

      // Get one-time JWT from server
      setProgress(50);
      const jwtRes = await fetch("/api/ipfs-upload-jwt", {
        method: "POST",
      });

      if (!jwtRes.ok) {
        throw new Error("Failed to get upload token from server");
      }

      const { jwt } = await jwtRes.json();
      setProgress(60);

      // Upload to IPFS via Pinata
      const formData = new FormData();
      formData.append("file", processedFile);

      const uploadRes = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${jwt}`,
        },
        body: formData,
      });

      if (!uploadRes.ok) {
        const errorText = await uploadRes.text();
        console.error("Pinata upload failed:", errorText);
        throw new Error("Upload to IPFS failed");
      }

      setProgress(90);

      const { IpfsHash } = await uploadRes.json();

      const uploadResult: UploadResult = {
        cid: IpfsHash,
        url: `https://gateway.pinata.cloud/ipfs/${IpfsHash}`,
        ipfsUri: `ipfs://${IpfsHash}`,
      };

      setResult(uploadResult);
      setProgress(100);

      return uploadResult;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Upload failed";
      setError(message);
      throw err;
    } finally {
      setUploading(false);
    }
  };

  const reset = () => {
    setResult(null);
    setError(null);
    setProgress(0);
  };

  return {
    uploadToIPFS,
    uploading,
    progress,
    error,
    result,
    reset,
  };
}
