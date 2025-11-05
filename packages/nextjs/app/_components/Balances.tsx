"use client";

import { useEffect, useMemo, useState } from "react";
import { formatEther } from "viem";
import { useBalances } from "~~/hooks/useBalances";

const FALLBACK_IMAGE_URL = "https://placehold.co/256x256?text=No+Image";

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
      <div className="flex items-center justify-center h-32 text-base-content/70">Connect wallet to view balances</div>
    );
  }
  return <div className="flex items-center justify-center h-32 text-base-content/70">No balances yet</div>;
}

type BalanceImageProps = {
  imageURI?: string;
  alt: string;
};

function BalanceImage({ imageURI, alt }: BalanceImageProps) {
  const [hasErrored, setHasErrored] = useState(false);

  const normalizedUrl = useMemo(() => {
    if (!imageURI) return undefined;
    return imageURI.startsWith("ipfs://")
      ? `https://gateway.pinata.cloud/ipfs/${imageURI.slice("ipfs://".length)}`
      : imageURI;
  }, [imageURI]);

  useEffect(() => {
    setHasErrored(false);
  }, [normalizedUrl]);

  const src = hasErrored ? FALLBACK_IMAGE_URL : (normalizedUrl ?? FALLBACK_IMAGE_URL);

  return (
    <img
      src={src}
      alt={alt}
      className="h-8 w-8 rounded-full object-cover flex-shrink-0"
      onError={() => {
        if (!hasErrored) {
          setHasErrored(true);
        }
      }}
    />
  );
}

export function Balances() {
  const { data: balances = [], isLoading, isFetching } = useBalances();

  const hasBalances = useMemo(() => balances.length > 0, [balances]);
  const showSpinner = isLoading;
  const showEmpty = !showSpinner && !hasBalances;

  return (
    <section className="bg-base-100 border border-base-300 rounded-3xl p-6 shadow-md">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-2xl font-semibold">Balances</h3>
        {isFetching && !isLoading ? <span className="loading loading-spinner loading-sm" /> : null}
      </div>

      {showSpinner ? (
        <LoadingState />
      ) : showEmpty ? (
        <EmptyState hasWallet={true} />
      ) : (
        <div className="flex flex-col gap-3">
          {balances.map(balance => {
            const isBCT = balance.symbol === "BCT";
            const formattedBalance = Number(formatEther(balance.balance)).toFixed(4);

            return (
              <div key={balance.lbp} className="flex items-center gap-3 p-3 bg-base-200 rounded-2xl">
                {!isBCT && balance.imageURI && <BalanceImage imageURI={balance.imageURI} alt={balance.symbol} />}
                <div className={`flex-1 font-mono text-sm ${isBCT ? "font-semibold" : ""}`}>
                  {formattedBalance} ${balance.symbol}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
