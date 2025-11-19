"use client";

import { useEffect, useMemo, useState } from "react";
import { CreatePositionModal } from "./CreatePositionModal";
import { PositionTradeModal } from "./PositionTradeModal";
import { useQueryClient } from "@tanstack/react-query";
import { formatEther, formatUnits } from "viem";
import { useScaffoldWriteContract } from "~~/hooks/scaffold-eth";
import { useCachedImage } from "~~/hooks/useCachedImage";
import { useLatestRound } from "~~/hooks/useLatestRound";
import { useLbpPrices } from "~~/hooks/useLbpPrices";
import { useRoundPositions } from "~~/hooks/useRoundPositions";
import { PositionSummary } from "~~/types/client_types";
import { formatMarketCap, getMarketCapColor } from "~~/utils/marketCap";

const FALLBACK_IMAGE_URL = "https://placehold.co/256x256?text=No+Image";

function LoadingState() {
  return (
    <div className="flex items-center justify-center h-32">
      <span className="loading loading-spinner" />
    </div>
  );
}

function EmptyState() {
  return <div className="flex items-center justify-center h-32 text-base-content/70">No positions yet</div>;
}

type PositionImageProps = {
  imageURI: string;
  alt: string;
};

function PositionImage({ imageURI, alt }: PositionImageProps) {
  const [hasErrored, setHasErrored] = useState(false);

  const normalizedUrl = useMemo(() => {
    if (!imageURI) return undefined;
    return imageURI.startsWith("ipfs://")
      ? `https://gateway.pinata.cloud/ipfs/${imageURI.slice("ipfs://".length)}`
      : imageURI;
  }, [imageURI]);

  const { data: cachedImage, isLoading, isError } = useCachedImage(normalizedUrl);

  useEffect(() => {
    setHasErrored(false);
  }, [normalizedUrl]);

  const src = hasErrored || isError ? FALLBACK_IMAGE_URL : (cachedImage ?? normalizedUrl ?? FALLBACK_IMAGE_URL);

  const showSkeleton = isLoading && !cachedImage && !hasErrored && !isError;

  return (
    <div className="flex-shrink-0 w-20 h-20 relative">
      {showSkeleton && <div className="absolute inset-0 rounded-2xl bg-base-200 animate-pulse" />}
      <img
        src={src}
        alt={alt}
        className={`h-full w-full rounded-2xl object-cover transition-opacity duration-300 ${
          showSkeleton ? "opacity-0" : "opacity-100"
        }`}
        onError={() => {
          if (!hasErrored) {
            setHasErrored(true);
          }
        }}
      />
    </div>
  );
}

export function Positions() {
  const { data: currentRound } = useLatestRound();
  const roundId = currentRound?.id;
  const [isManualRefresh] = useState(false);
  const [hasLoadedInitial, setHasLoadedInitial] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [tradeContext, setTradeContext] = useState<{ mode: "buy" | "sell"; position: PositionSummary } | null>(null);
  const [pendingLiquidation, setPendingLiquidation] = useState<`0x${string}` | null>(null);

  const queryClient = useQueryClient();
  const { writeContractAsync: writeOrchestrator } = useScaffoldWriteContract({
    contractName: "RoundOrchestrator",
  });

  const { data: positionsMap, isLoading, isFetching, refetch } = useRoundPositions(roundId);

  const positions = useMemo(() => {
    if (!positionsMap) return [];
    return Array.from(positionsMap.values());
  }, [positionsMap]);

  // Get LBP addresses for price fetching
  const lbpAddresses = useMemo(() => positions.map(p => p.lbpAddress), [positions]);

  // Fetch latest prices for all positions
  const { latestPriceByLbp } = useLbpPrices(lbpAddresses.length > 0 ? lbpAddresses : undefined);

  useEffect(() => {
    setHasLoadedInitial(false);
  }, [roundId]);

  useEffect(() => {
    if (isLoading || isFetching) return;
    setHasLoadedInitial(prev => (prev ? prev : true));
  }, [isLoading, isFetching]);

  const hasPositions = useMemo(() => positions.length > 0, [positions]);
  const showInitialSpinner = !hasLoadedInitial && (isLoading || isFetching);
  const showManualSpinner = isManualRefresh && isFetching;
  const showSpinner = showInitialSpinner || showManualSpinner;
  const showEmpty = !showSpinner && !hasPositions;

  const invalidateAfterLiquidation = async () => {
    await new Promise(resolve => setTimeout(resolve, 1000));
    if (roundId) {
      await queryClient.invalidateQueries({ queryKey: ["roundPositions", roundId] });
    }
    await queryClient.invalidateQueries({ queryKey: ["lbpPrices"] });
    await queryClient.invalidateQueries({ queryKey: ["poolStates"] });
  };

  const handleLiquidate = async (position: PositionSummary) => {
    if (position.isLiquidated || pendingLiquidation === position.lbpAddress) return;

    try {
      setPendingLiquidation(position.lbpAddress);
      await writeOrchestrator({
        functionName: "liquidatePosition",
        args: [position.lbpAddress],
      });

      await invalidateAfterLiquidation();
      await refetch();
    } catch (error) {
      console.error(`Failed to liquidate position ${position.lbpAddress}:`, error);
    } finally {
      setPendingLiquidation(null);
    }
  };

  return (
    <section className="flex flex-col gap-4">
      <div className="bg-base-100 border border-base-300 rounded-3xl p-6 shadow-md flex flex-col gap-4">
        <h3 className="text-xl font-semibold">Positions</h3>
        {showSpinner ? (
          <LoadingState />
        ) : showEmpty ? (
          <EmptyState />
        ) : (
          <div className="flex flex-col gap-6">
            {positions.map(position => {
              // Get latest price for this position
              const priceInfo = latestPriceByLbp[position.lbpAddress];
              const latestPrice = priceInfo?.price ?? null;

              // Calculate current market cap: totalSupply × latestPrice
              const totalSupplyInEth = Number(formatUnits(position.totalSupply, 18));
              const currentMarketCap = latestPrice !== null ? totalSupplyInEth * latestPrice : null;

              // Get color for current market cap
              const marketCapColor =
                currentMarketCap !== null
                  ? getMarketCapColor(currentMarketCap, position.liquidationMarketCap, position.initialMarketCap)
                  : "text-base-content/60";
              const isLiquidating = pendingLiquidation === position.lbpAddress;
              const canLiquidateNow =
                currentMarketCap !== null &&
                currentMarketCap <= position.liquidationMarketCap &&
                !position.isLiquidated;
              const isLiquidateDisabled = !canLiquidateNow || isLiquidating;
              const cardStyles = position.isLiquidated ? "opacity-60 grayscale" : "";

              return (
                <div key={position.lbpAddress} className={`flex gap-4 p-4 rounded-2xl ${cardStyles}`}>
                  <PositionImage imageURI={position.imageURI} alt={position.name} />

                  <div className="flex-1 flex flex-col justify-center gap-1">
                    <div className="font-medium text-lg">
                      {position.name} - ${position.symbol}
                    </div>
                    <div className="relative">
                      {/* Position Percentage - Right side above progress bar */}
                      <span className="absolute -top-5 right-0 text-xs text-base-content/70">
                        {position.percentage.toFixed(2)}%
                      </span>
                      <progress className="progress progress-primary w-full" value={position.percentage} max={100} />
                    </div>
                    <div className="flex justify-between items-center text-xs">
                      {/* Owned Supply / Total - Left side */}
                      <span className="text-base-content/60">
                        Owned supply: {Number(formatEther(position.ownedSupply)).toFixed(4)} / Total:{" "}
                        {Number(formatEther(position.totalSupply)).toFixed(4)}
                      </span>
                      {/* Market Caps - Right side: Liquidation | Current */}
                      <span className="flex gap-2 items-center">
                        <span className="text-base-content/60">
                          Liq. {formatMarketCap(position.liquidationMarketCap)}
                        </span>
                        <span className="text-base-content/60">|</span>
                        <span className={`font-semibold ${marketCapColor}`}>
                          {currentMarketCap !== null ? formatMarketCap(currentMarketCap) : "Loading..."}
                        </span>
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-col gap-2 justify-center">
                    <button
                      type="button"
                      className="btn btn-sm btn-secondary"
                      onClick={() => setTradeContext({ mode: "buy", position })}
                      disabled={position.isLiquidated}
                    >
                      Buy
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm btn-outline"
                      onClick={() => setTradeContext({ mode: "sell", position })}
                      disabled={position.isLiquidated}
                    >
                      Sell
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm btn-error"
                      disabled={isLiquidateDisabled}
                      onClick={() => handleLiquidate(position)}
                    >
                      {isLiquidating ? (
                        <>
                          <span className="loading loading-spinner loading-xs" />
                          <span>Liquidating</span>
                        </>
                      ) : (
                        "Liquidate"
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      <button className="btn btn-primary w-full" onClick={() => setIsModalOpen(true)} disabled={!roundId}>
        Create Position
      </button>

      <CreatePositionModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
      {tradeContext && (
        <PositionTradeModal
          mode={tradeContext.mode}
          position={tradeContext.position}
          isOpen={Boolean(tradeContext)}
          onClose={() => setTradeContext(null)}
          onSuccess={() => {
            setTradeContext(null);
            refetch();
          }}
        />
      )}
    </section>
  );
}
