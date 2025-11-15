"use client";

import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { erc20Abi, formatUnits, parseEther, parseUnits } from "viem";
import { useAccount, useBalance, useReadContract, useWriteContract } from "wagmi";
import { KNOWN_ABIS } from "~~/contracts/knownAbis";
import { useTransactor } from "~~/hooks/scaffold-eth";
import { useBalances } from "~~/hooks/useBalances";
import { useBondingPoolPrices } from "~~/hooks/useBondingPoolPrices";
import { useLatestRound } from "~~/hooks/useLatestRound";
import { useLbpPrices } from "~~/hooks/useLbpPrices";
import { PositionSummary } from "~~/types/client_types";
import { calculateSwapAmount } from "~~/utils/lbpMath";

const LBP_ABI = KNOWN_ABIS.LBP;
const ZERO_ADDRESS = `0x${"0".repeat(40)}` as `0x${string}`;
const WEI_PER_ETH = 10n ** 18n;
const SWAP_FEE_BPS = 50n; // 0.5% in basis points (50/10000)

type TradeMode = "buy" | "sell";

interface PositionTradeModalProps {
  mode: TradeMode;
  position: PositionSummary;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

function formatNumber(value: number | null, fractionDigits = 6) {
  if (value === null || !Number.isFinite(value)) return "-";
  return value.toFixed(fractionDigits);
}

function formatWeiForInput(value: bigint) {
  const formatted = formatUnits(value, 18);
  if (!formatted.includes(".")) return formatted;
  return formatted.replace(/\.?0+$/, "");
}

export function PositionTradeModal({ mode, position, isOpen, onClose, onSuccess }: PositionTradeModalProps) {
  const { address } = useAccount();
  const transactor = useTransactor();
  const { writeContractAsync } = useWriteContract();
  const queryClient = useQueryClient();

  const [amountInput, setAmountInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setAmountInput("");
      setError(null);
      setIsSubmitting(false);
    }
  }, [isOpen]);

  const {
    latestPriceByLbp,
    poolStateByLbp,
    isLoading: isPriceLoading,
  } = useLbpPrices(isOpen ? [position.lbpAddress] : undefined);
  const priceInfo = latestPriceByLbp[position.lbpAddress];
  const latestPrice = priceInfo?.price ?? null;
  const latestPriceWei = priceInfo?.priceWei ?? null;
  const poolState = poolStateByLbp[position.lbpAddress];

  const { data: latestRound } = useLatestRound();
  const bondingPoolAddress = latestRound?.bondingPool;
  const shouldLoadBondingPoolPrice = mode === "sell" && isOpen && Boolean(bondingPoolAddress);
  const { latestPriceWei: latestBctPriceWei } = useBondingPoolPrices(
    shouldLoadBondingPoolPrice ? (bondingPoolAddress as `0x${string}`) : undefined,
  );

  const shouldLoadEthBalance = mode === "buy" && isOpen && Boolean(address);
  const { data: ethBalanceData } = useBalance({
    address: shouldLoadEthBalance ? address : undefined,
  });
  const ethBalanceWei = shouldLoadEthBalance ? (ethBalanceData?.value ?? null) : null;

  const ethBalanceDisplay = useMemo(() => {
    if (ethBalanceWei === null) return null;
    return formatNumber(Number(formatUnits(ethBalanceWei, 18)), 4);
  }, [ethBalanceWei]);

  // Get token balance for sell mode using the same hook as Balances component
  const { data: balances = [] } = useBalances();
  const tokenBalanceWei = useMemo(() => {
    if (mode !== "sell") return null;
    const balance = balances.find(b => b.lbp === position.lbpAddress);
    return balance ? balance.balance : 0n;
  }, [mode, balances, position.lbpAddress]);

  const tokenBalanceDisplay = useMemo(() => {
    if (mode !== "sell" || tokenBalanceWei === null) return null;
    return formatNumber(Number(formatUnits(tokenBalanceWei, 18)), 4);
  }, [mode, tokenBalanceWei]);

  const amountEthWei = useMemo(() => {
    if (mode !== "buy" || !amountInput) return null;
    try {
      const parsed = parseEther(amountInput);
      return parsed > 0n ? parsed : null;
    } catch {
      return null;
    }
  }, [mode, amountInput]);

  const amountTokenWei = useMemo(() => {
    if (!amountInput) return null;

    try {
      if (mode === "buy") {
        // Use pool state and lbpMath for accurate calculation
        if (!amountEthWei || !poolState) return null;

        // Apply fee deduction
        const feeAmount = (amountEthWei * SWAP_FEE_BPS) / 10000n;
        const amountAfterFee = amountEthWei - feeAmount;

        // Calculate tokens using weighted constant product formula
        const tokensOut = calculateSwapAmount(
          poolState.ethReserve,
          poolState.tokenReserve,
          poolState.weightEth,
          poolState.weightToken,
          amountAfterFee,
        );

        return tokensOut > 0n ? tokensOut : null;
      }

      const parsed = parseUnits(amountInput, 18);
      return parsed > 0n ? parsed : null;
    } catch {
      return null;
    }
  }, [mode, amountInput, amountEthWei, poolState]);

  const estimatedTokens = useMemo(() => {
    if (mode !== "buy" || amountTokenWei === null) return null;
    return Number(formatUnits(amountTokenWei, 18));
  }, [mode, amountTokenWei]);

  const estimatedSellEthWei = useMemo(() => {
    if (mode !== "sell" || amountTokenWei === null || !poolState) return null;

    // Apply fee deduction
    const feeAmount = (amountTokenWei * SWAP_FEE_BPS) / 10000n;
    const amountAfterFee = amountTokenWei - feeAmount;

    // Calculate ETH using weighted constant product formula
    const ethOut = calculateSwapAmount(
      poolState.tokenReserve,
      poolState.ethReserve,
      poolState.weightToken,
      poolState.weightEth,
      amountAfterFee,
    );

    return ethOut > 0n ? ethOut : null;
  }, [mode, amountTokenWei, poolState]);

  const estimatedSellBctWei = useMemo(() => {
    if (mode !== "sell" || estimatedSellEthWei === null || latestBctPriceWei === null || latestBctPriceWei === 0n) {
      return null;
    }
    return (estimatedSellEthWei * WEI_PER_ETH) / latestBctPriceWei;
  }, [mode, estimatedSellEthWei, latestBctPriceWei]);

  const estimatedSellBct = useMemo(() => {
    if (estimatedSellBctWei === null) return null;
    return Number(formatUnits(estimatedSellBctWei, 18));
  }, [estimatedSellBctWei]);

  const {
    data: allowance = 0n,
    refetch: refetchAllowance,
    isFetching: isAllowanceFetching,
  } = useReadContract({
    abi: erc20Abi,
    address: position.tokenAddress,
    functionName: "allowance",
    args: [address ?? ZERO_ADDRESS, position.lbpAddress],
    query: {
      enabled: isOpen && mode === "sell" && Boolean(address),
    },
  });

  const needsApproval = mode === "sell" && amountTokenWei !== null && allowance < amountTokenWei;

  const primaryLabel =
    mode === "buy" ? "Buy" : needsApproval ? (isSubmitting ? "Approving..." : "Approve & Sell") : "Sell";

  const secondaryLabel = mode === "buy" ? "Cancel" : "Cancel";

  const exceedsEthBalance =
    mode === "buy" && ethBalanceWei !== null && amountEthWei !== null ? amountEthWei > ethBalanceWei : false;
  const exceedsTokenBalance =
    mode === "sell" && tokenBalanceWei !== null && amountTokenWei !== null ? amountTokenWei > tokenBalanceWei : false;
  const hasValidAmount =
    mode === "buy"
      ? amountEthWei !== null && !exceedsEthBalance && amountEthWei > 0n && ethBalanceWei !== null
      : amountTokenWei !== null && amountTokenWei > 0n && !exceedsTokenBalance;

  const isActionDisabled =
    !isOpen ||
    isSubmitting ||
    !hasValidAmount ||
    latestPrice === null ||
    latestPriceWei === null ||
    !poolState ||
    (mode === "sell" && !address) ||
    isPriceLoading ||
    (mode === "sell" && isAllowanceFetching);

  const handleMaxClick = () => {
    if (mode === "buy") {
      if (ethBalanceWei === null || ethBalanceWei === 0n) return;
      setAmountInput(formatWeiForInput(ethBalanceWei));
    } else {
      if (tokenBalanceWei === null || tokenBalanceWei === 0n) return;
      setAmountInput(formatWeiForInput(tokenBalanceWei));
    }
    setError(null);
  };

  const handleAmountChange = (value: string) => {
    if (mode === "buy" && ethBalanceWei !== null) {
      if (value) {
        try {
          const parsed = parseEther(value);
          if (parsed > ethBalanceWei) {
            setAmountInput(formatWeiForInput(ethBalanceWei));
            setError(null);
            return;
          }
        } catch {
          // Allow partial inputs like "0."
        }
      }
    }

    if (mode === "sell" && tokenBalanceWei !== null) {
      if (value) {
        try {
          const parsed = parseUnits(value, 18);
          if (parsed > tokenBalanceWei) {
            setAmountInput(formatWeiForInput(tokenBalanceWei));
            setError(null);
            return;
          }
        } catch {
          // Allow partial inputs like "0."
        }
      }
    }

    setAmountInput(value);
    setError(null);
  };

  const invalidateCachesAfterSwap = async () => {
    // Wait 1 second for Ponder to index the swap event
    await new Promise(resolve => setTimeout(resolve, 1000));

    console.log("[PositionTradeModal] Invalidating caches after swap");

    // Get current round for swap history invalidation
    const currentRound = latestRound;
    const roundId = currentRound?.id;

    // Buy/Sell Position Tokens invalidations
    await queryClient.invalidateQueries({ queryKey: ["userBalances"] });
    if (roundId) {
      await queryClient.invalidateQueries({ queryKey: ["swapHistory", address, roundId] });
    }
    await queryClient.invalidateQueries({ queryKey: ["lbpPrices"] });
    await queryClient.invalidateQueries({ queryKey: ["poolStates"] });

    // If selling (buyToken=false), also invalidate bonding pool prices since BCT is received
    if (mode === "sell" && bondingPoolAddress) {
      await queryClient.invalidateQueries({ queryKey: ["bondingPoolPrices", bondingPoolAddress, "tail"] });
    }

    console.log("[PositionTradeModal] Cache invalidation complete");
  };

  const handleConfirm = async () => {
    if (isActionDisabled) return;

    try {
      setIsSubmitting(true);
      setError(null);

      if (mode === "sell") {
        if (!address) {
          setError("Connect your wallet to sell.");
          return;
        }

        if (!amountTokenWei || amountTokenWei <= 0n) {
          setError("Enter a valid token amount.");
          return;
        }

        if (needsApproval) {
          await transactor(() =>
            writeContractAsync({
              abi: erc20Abi,
              address: position.tokenAddress,
              functionName: "approve",
              args: [position.lbpAddress, amountTokenWei],
            }),
          );
          await refetchAllowance();
        }

        await transactor(() =>
          writeContractAsync({
            abi: LBP_ABI,
            address: position.lbpAddress,
            functionName: "swap",
            args: [amountTokenWei, false],
          }),
        );
      } else {
        if (!amountEthWei || !latestPriceWei || amountEthWei <= 0n) {
          setError("Enter a valid ETH amount and ensure price data is available.");
          return;
        }
        if (ethBalanceWei === null || amountEthWei > ethBalanceWei) {
          setError("Insufficient balance.");
          return;
        }

        await transactor(() =>
          writeContractAsync({
            abi: LBP_ABI,
            address: position.lbpAddress,
            functionName: "swap",
            args: [0n, true],
            value: amountEthWei,
          }),
        );
      }

      // Invalidate caches after transaction (with 1s delay for Ponder indexing)
      await invalidateCachesAfterSwap();

      onSuccess?.();
      onClose();
    } catch (txError: any) {
      console.error("Trade failed:", txError);
      if (!txError?.message?.includes("User rejected")) {
        setError(txError?.message ?? "Transaction failed");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 backdrop-blur-sm bg-black/30" onClick={onClose} />
      <div className="relative bg-base-100 rounded-3xl p-6 shadow-xl max-w-md w-full mx-4">
        <h2 className="text-2xl font-semibold mb-4 capitalize">
          {mode} {position.symbol}
        </h2>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">
              {mode === "buy" ? "ETH to spend" : `Amount (${position.symbol})`}
            </label>
            <div className="relative">
              <input
                type="number"
                min="0"
                step="0.0001"
                value={amountInput}
                onChange={event => handleAmountChange(event.target.value)}
                placeholder="0.0"
                className="input input-bordered w-full pr-16"
                disabled={isSubmitting}
              />
              <button
                type="button"
                className="btn btn-ghost btn-xs absolute right-2 top-1/2 -translate-y-1/2"
                onClick={handleMaxClick}
                disabled={
                  isSubmitting ||
                  (mode === "buy"
                    ? ethBalanceWei === null || ethBalanceWei === 0n
                    : tokenBalanceWei === null || tokenBalanceWei === 0n)
                }
              >
                Max
              </button>
            </div>
            <div className="mt-1 text-xs text-base-content/70 flex justify-between">
              <span>Available</span>
              <span>
                {!address
                  ? "Connect wallet"
                  : mode === "buy"
                    ? ethBalanceWei === null
                      ? "..."
                      : `${ethBalanceDisplay} ETH`
                    : tokenBalanceWei === null
                      ? "..."
                      : `${tokenBalanceDisplay} ${position.symbol}`}
              </span>
            </div>
          </div>

          <div className="bg-base-200 rounded-xl p-4 text-sm">
            <div className="flex justify-between">
              <span className="text-base-content/70">
                {mode === "buy" ? `Estimated ${position.symbol}` : "Estimated BCT received"}
              </span>
              <span className="font-medium">
                {mode === "buy"
                  ? estimatedTokens !== null
                    ? `${formatNumber(estimatedTokens, 4)} ${position.symbol}`
                    : "-"
                  : estimatedSellBct !== null
                    ? `${formatNumber(estimatedSellBct, 4)} BCT`
                    : "-"}
              </span>
            </div>
          </div>

          {error && <p className="text-sm text-error">{error}</p>}

          <div className="flex gap-3 pt-2">
            <button onClick={onClose} className="btn btn-ghost flex-1" disabled={isSubmitting}>
              {secondaryLabel}
            </button>
            <button onClick={handleConfirm} className="btn btn-primary flex-1" disabled={isActionDisabled}>
              {isSubmitting ? (
                <>
                  <span className="loading loading-spinner loading-sm" />
                  {mode === "buy" ? "Buying..." : "Selling..."}
                </>
              ) : (
                primaryLabel
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
