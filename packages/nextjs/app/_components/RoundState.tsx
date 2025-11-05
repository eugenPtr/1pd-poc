"use client";

import { Address } from "~~/components/scaffold-eth";
import { useLatestRound } from "~~/hooks/useLatestRound";
import { formatTimestamp, isUsableAddress } from "~~/utils/utils";

export function RoundState() {
  const { data: currentRound, isLoading, isError } = useLatestRound();

  return (
    <section className="bg-base-100 border border-base-300 rounded-3xl p-4 shadow-md">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xl font-semibold">Current Round</h3>
        {isLoading ? (
          <span className="loading loading-spinner loading-sm" />
        ) : currentRound ? (
          <span className="badge badge-primary badge-outline">ID {currentRound.id}</span>
        ) : (
          <span className="text-sm opacity-70">No data</span>
        )}
      </div>
      {isError && <p className="text-error text-sm">Failed to load round data.</p>}
      {currentRound && (
        <dl className="grid grid-cols-1 gap-3 text-sm">
          <div className="flex items-center justify-between">
            <dt className="opacity-70">Start</dt>
            <dd className="font-medium">{formatTimestamp(currentRound.startTime)}</dd>
          </div>
          <div className="flex items-center justify-between">
            <dt className="opacity-70">End</dt>
            <dd className="font-medium">{formatTimestamp(currentRound.endTime)}</dd>
          </div>
          <div className="flex items-center justify-between">
            <dt className="opacity-70">Duration</dt>
            <dd className="font-medium">{Number(currentRound.duration)}s</dd>
          </div>
          <div className="flex items-center justify-between">
            <dt className="opacity-70">Bonding Pool</dt>
            <dd>
              {isUsableAddress(currentRound.bondingPool) ? (
                <Address address={currentRound.bondingPool} onlyEnsOrAddress />
              ) : (
                <span className="opacity-70">-</span>
              )}
            </dd>
          </div>
          <div className="flex items-center justify-between">
            <dt className="opacity-70">Settled</dt>
            <dd className={`badge ${currentRound.settled ? "badge-success" : "badge-warning"}`}>
              {currentRound.settled ? "Yes" : "No"}
            </dd>
          </div>
          {currentRound.settled && (
            <div className="flex items-center justify-between">
              <dt className="opacity-70">Winner LBP</dt>
              <dd>
                {isUsableAddress(currentRound.winnerLbp) ? (
                  <Address address={currentRound.winnerLbp as `0x${string}`} onlyEnsOrAddress />
                ) : (
                  <span className="opacity-70">-</span>
                )}
              </dd>
            </div>
          )}
        </dl>
      )}
    </section>
  );
}
