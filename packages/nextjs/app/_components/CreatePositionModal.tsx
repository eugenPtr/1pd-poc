"use client";

import { useEffect, useMemo, useState } from "react";
import { parseEther } from "viem";
import { IPFSImageUpload } from "~~/components/IPFSImageUpload";
import { useScaffoldWriteContract } from "~~/hooks/scaffold-eth";

interface CreatePositionModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function CreatePositionModal({ isOpen, onClose }: CreatePositionModalProps) {
  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [tokenAmountInput, setTokenAmountInput] = useState("10000");
  const [ethAmountInput, setEthAmountInput] = useState("1");
  const [isCreating, setIsCreating] = useState(false);
  const [imageIpfsUri, setImageIpfsUri] = useState<string | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [isImageUploading, setIsImageUploading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const { writeContractAsync } = useScaffoldWriteContract({
    contractName: "RoundOrchestrator",
  });

  useEffect(() => {
    if (!isOpen) {
      setName("");
      setSymbol("");
      setTokenAmountInput("10000");
      setEthAmountInput("1");
      setImageIpfsUri(null);
      setImagePreviewUrl(null);
      setIsImageUploading(false);
      setIsCreating(false);
      setFormError(null);
    }
  }, [isOpen]);

  const handleUploadComplete = (ipfsUri: string, url: string) => {
    setImageIpfsUri(ipfsUri);
    setImagePreviewUrl(url);
  };

  const tokenAmountWei = useMemo(() => {
    try {
      if (!tokenAmountInput) return null;
      const parsed = parseEther(tokenAmountInput);
      return parsed > 0n ? parsed : null;
    } catch {
      return null;
    }
  }, [tokenAmountInput]);

  const ethAmountWei = useMemo(() => {
    try {
      if (!ethAmountInput) return null;
      const parsed = parseEther(ethAmountInput);
      return parsed > 0n ? parsed : null;
    } catch {
      return null;
    }
  }, [ethAmountInput]);

  // TODO: Fetch these values from RoundOrchestrator contract constants (MIN_POSITION_ETH, MAX_POSITION_ETH)
  const MIN_ETH = parseEther("0.0001");
  const MAX_ETH = parseEther("100");

  const isTokenAmountValid = tokenAmountWei !== null;
  const isEthAmountValid = ethAmountWei !== null && ethAmountWei >= MIN_ETH && ethAmountWei <= MAX_ETH;

  const handleCreate = async () => {
    if (!name || !symbol || !imageIpfsUri) {
      setFormError("Please fill in all fields and upload an image.");
      return;
    }
    if (!isTokenAmountValid) {
      setFormError("Enter a valid token supply greater than 0.");
      return;
    }
    if (!isEthAmountValid) {
      setFormError("ETH deposit must be between 0.0001 and 100.");
      return;
    }

    setIsCreating(true);
    setFormError(null);
    try {
      await writeContractAsync({
        functionName: "createPosition",
        args: [name, symbol, tokenAmountWei!, imageIpfsUri],
        value: ethAmountWei!,
      });

      setName("");
      setSymbol("");
      setTokenAmountInput("10000");
      setEthAmountInput("1");
      setImageIpfsUri(null);
      setImagePreviewUrl(null);
      onClose();
    } catch (error) {
      console.error("Failed to create position:", error);
      setFormError("Failed to create position. Please try again.");
    } finally {
      setIsCreating(false);
    }
  };

  const canSubmit =
    !isCreating &&
    !isImageUploading &&
    Boolean(name) &&
    Boolean(symbol) &&
    Boolean(imageIpfsUri) &&
    isTokenAmountValid &&
    isEthAmountValid;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 backdrop-blur-sm bg-black/30" onClick={onClose} />
      <div className="relative bg-base-100 rounded-3xl p-6 shadow-xl max-w-md w-full mx-4">
        <h2 className="text-2xl font-semibold mb-4">Create Position</h2>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">Position Name</label>
            <input
              type="text"
              value={name}
              onChange={e => {
                setName(e.target.value);
                setFormError(null);
              }}
              placeholder="e.g., Awesome Token"
              className="input input-bordered w-full"
              disabled={isCreating || isImageUploading}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Symbol</label>
            <input
              type="text"
              value={symbol}
              onChange={e => {
                setSymbol(e.target.value.toUpperCase());
                setFormError(null);
              }}
              placeholder="e.g., AWE"
              className="input input-bordered w-full"
              maxLength={10}
              disabled={isCreating || isImageUploading}
            />
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium">Position Image</label>
            <IPFSImageUpload
              currentImageUrl={imagePreviewUrl ?? undefined}
              onUploadComplete={handleUploadComplete}
              onUploadingChange={setIsImageUploading}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Total Token Supply</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={tokenAmountInput}
              onChange={event => {
                setTokenAmountInput(event.target.value);
                setFormError(null);
              }}
              placeholder="e.g., 10000"
              className="input input-bordered w-full"
              disabled={isCreating || isImageUploading}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Initial ETH Liquidity</label>
            <input
              type="number"
              min="0.0001"
              max="100"
              step="0.0001"
              value={ethAmountInput}
              onChange={event => {
                setEthAmountInput(event.target.value);
                setFormError(null);
              }}
              placeholder="e.g., 0.01"
              className="input input-bordered w-full"
              disabled={isCreating || isImageUploading}
            />
            <p className="mt-1 text-xs text-base-content/70">Allowed range: 0.0001 – 100 ETH</p>
          </div>

          <div className="bg-base-200 rounded-xl p-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-base-content/70">Token Amount:</span>
              <span className="font-medium">{tokenAmountInput ? `${tokenAmountInput} tokens` : "-"}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-base-content/70">ETH Amount:</span>
              <span className="font-medium">{ethAmountInput ? `${ethAmountInput} ETH` : "-"}</span>
            </div>
          </div>

          {formError && <p className="text-sm text-error">{formError}</p>}

          <div className="flex gap-3 pt-2">
            <button onClick={onClose} className="btn btn-ghost flex-1" disabled={isCreating}>
              Cancel
            </button>
            <button onClick={handleCreate} className="btn btn-primary flex-1" disabled={!canSubmit}>
              {isCreating ? (
                <>
                  <span className="loading loading-spinner loading-sm" />
                  Creating...
                </>
              ) : (
                "Create Position"
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
