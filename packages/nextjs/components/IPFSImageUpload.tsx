"use client";

import { useRef } from "react";
import { useIPFSUpload } from "~~/hooks/useIPFSUpload";

interface IPFSImageUploadProps {
  onUploadComplete?: (ipfsUri: string, url: string) => void;
  onUploadingChange?: (uploading: boolean) => void;
  currentImageUrl?: string;
}

export function IPFSImageUpload({ onUploadComplete, onUploadingChange, currentImageUrl }: IPFSImageUploadProps) {
  const { uploadToIPFS, uploading, progress, error, result } = useIPFSUpload();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      onUploadingChange?.(true);
      const uploadResult = await uploadToIPFS(file);
      onUploadComplete?.(uploadResult.ipfsUri, uploadResult.url);
    } catch (err) {
      // Error is handled by the hook
      console.error("Upload failed:", err);
    } finally {
      onUploadingChange?.(false);
    }
  };

  const handleButtonClick = () => {
    fileInputRef.current?.click();
  };

  const displayUrl = result?.url || currentImageUrl;

  return (
    <div className="flex flex-col gap-4">
      <div
        role="button"
        tabIndex={0}
        onClick={!uploading ? handleButtonClick : undefined}
        onKeyDown={event => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            if (!uploading) {
              handleButtonClick();
            }
          }
        }}
        className={`relative w-full h-64 rounded-2xl border border-dashed border-base-300 bg-base-200 transition hover:border-base-400 focus-visible:border-primary focus-visible:outline-none flex flex-col items-center justify-center gap-3 text-center overflow-hidden ${
          uploading ? "cursor-wait opacity-80" : "cursor-pointer"
        }`}
        aria-disabled={uploading}
      >
        {displayUrl && (
          <>
            <img src={displayUrl} alt="Position preview" className="absolute inset-0 h-full w-full object-cover" />
            <div className="absolute inset-0 bg-base-200/75 backdrop-blur-[1px]" />
          </>
        )}

        <button
          type="button"
          onClick={e => {
            e.stopPropagation();
            handleButtonClick();
          }}
          disabled={uploading}
          className={`btn btn-sm md:btn-md ${displayUrl ? "btn-secondary" : "btn-primary"} z-10 pointer-events-auto`}
        >
          {uploading ? (
            <>
              <span className="loading loading-spinner loading-sm" />
              Uploading... {progress}%
            </>
          ) : (
            <>{displayUrl ? "Change image" : "Upload image"}</>
          )}
        </button>
        <p className="text-xs text-base-content/70 max-w-[14rem] leading-snug z-10">
          PNG, JPG, GIF, SVG or WebP. Max 2&nbsp;MB.
        </p>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/jpg,image/gif,image/svg+xml,image/webp"
        onChange={handleFileChange}
        disabled={uploading}
        className="hidden"
      />

      {/* Progress Bar */}
      {uploading && <progress className="progress progress-primary w-full" value={progress} max={100} />}

      {/* Error Message */}
      {error && (
        <div className="alert alert-error">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="stroke-current shrink-0 h-6 w-6"
            fill="none"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <span>{error}</span>
        </div>
      )}

      {/* Success Message */}
      {result && !uploading && (
        <div className="alert alert-success">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="stroke-current shrink-0 h-6 w-6"
            fill="none"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <div className="flex flex-col gap-1">
            <span className="font-semibold">Upload successful!</span>
            <span className="text-xs break-all opacity-70">{result.cid}</span>
          </div>
        </div>
      )}
    </div>
  );
}
