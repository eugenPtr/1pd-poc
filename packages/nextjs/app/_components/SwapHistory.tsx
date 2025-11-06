"use client";

import { useMemo } from "react";
import { format } from "date-fns";
import { formatEther } from "viem";
import { useAccount, useChainId } from "wagmi";
import { useLatestRound } from "~~/hooks/useLatestRound";
import { useRoundPositions } from "~~/hooks/useRoundPositions";
import { useSwapHistory } from "~~/hooks/useSwapHistory";
import { getBlockExplorerTxLink } from "~~/utils/scaffold-eth/networks";

function LoadingState() {
  return (
    <div className="flex items-center justify-center h-32">
      <span className="loading loading-spinner" />
    </div>
  );
}

function EmptyState({ hasWallet }: { hasWallet: boolean }) {
  if (!hasWallet) {
    return (
      <div className="flex items-center justify-center h-32 text-base-content/70">
        Connect wallet to view swap history
      </div>
    );
  }
  return <div className="flex items-center justify-center h-32 text-base-content/70">No swap history yet</div>;
}

export function SwapHistory() {
  const { address } = useAccount();
  const chainId = useChainId();
  const { data: currentRound } = useLatestRound();
  const roundId = currentRound?.id;
  const { data: positionsMap } = useRoundPositions(roundId);
  const { data: swaps = [], isLoading, isFetching } = useSwapHistory();

  const hasSwaps = useMemo(() => swaps.length > 0, [swaps]);
  const showSpinner = address && (isLoading || (!hasSwaps && isFetching));
  const showEmpty = !showSpinner && !hasSwaps;

  return (
    <section className="bg-base-100 border border-base-300 rounded-3xl p-6 shadow-md">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-2xl font-semibold">Swap History</h3>
          <p className="text-sm text-base-content/70">Your recent trades</p>
        </div>
        {isFetching && !isLoading ? <span className="loading loading-spinner loading-sm" /> : null}
      </div>

      {showSpinner ? (
        <LoadingState />
      ) : showEmpty ? (
        <EmptyState hasWallet={Boolean(address)} />
      ) : (
        <div className="flex flex-col gap-3">
          {swaps.map(swap => {
            // Check if this is a BCT burn (bonding pool swap) or a position token swap
            const isBctSwap = swap.lbp === currentRound?.bondingPool;
            const position = isBctSwap ? null : positionsMap?.get(swap.lbp);
            const tokenSymbol = isBctSwap ? "BCT" : (position?.symbol ?? "???");

            const timestampSeconds = Number(swap.timestamp);
            const formattedDate = format(new Date(timestampSeconds * 1000), "PPpp");

            const isBuy = swap.buyToken;
            const tokenAmount = isBuy ? swap.amountOut : swap.amountIn;
            const ethAmount = isBuy ? swap.amountIn : swap.amountOut;

            const formattedTokenAmount = Number(formatEther(tokenAmount)).toFixed(4);
            const formattedEthAmount = Number(formatEther(ethAmount)).toFixed(4);

            // For BCT swaps (burns), always show ETH in parentheses
            // For position token swaps, show ETH for buys, BCT for sells
            const displayText = isBuy
              ? `+${formattedTokenAmount} $${tokenSymbol} (${formattedEthAmount} ETH)`
              : isBctSwap
                ? `-${formattedTokenAmount} $${tokenSymbol} (${formattedEthAmount} ETH)`
                : `-${formattedTokenAmount} $${tokenSymbol} (${formattedEthAmount} $BCT)`;

            const colorClass = isBuy ? "text-green-500" : "text-red-500";
            const blockExplorerLink = getBlockExplorerTxLink(chainId, swap.transactionHash);

            return (
              <a
                key={swap.id}
                href={blockExplorerLink}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between p-4 bg-base-200 rounded-2xl hover:bg-base-300 transition-colors cursor-pointer"
              >
                <div className="flex-1">
                  <div className={`font-mono text-sm ${colorClass}`}>{displayText}</div>
                  <div className="text-xs text-base-content/60 mt-1">{formattedDate}</div>
                </div>
              </a>
            );
          })}
        </div>
      )}
    </section>
  );
}
