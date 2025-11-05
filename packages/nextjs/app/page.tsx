"use client";

import { AccessGate } from "./_components/AccessGate";
import { Balances } from "./_components/Balances";
import { BondingPoolCard } from "./_components/BondingPoolCard";
import { Positions } from "./_components/Positions";
import { PriceChart } from "./_components/PriceChart";
import { RoundState } from "./_components/RoundState";
import { SwapHistory } from "./_components/SwapHistory";
import type { NextPage } from "next";
import { useLatestRound } from "~~/hooks/useLatestRound";

const Home: NextPage = () => {
  const { data: currentRound, isLoading } = useLatestRound();
  const accessCode = process.env.NEXT_PUBLIC_ACCESS_CODE;
  const gateEnabled = process.env.NEXT_PUBLIC_ACCESS_GATE_ENABLED === "true";

  return (
    <AccessGate requiredCode={accessCode} enabled={gateEnabled}>
      <div className="w-full px-6 lg:px-10 py-8 lg:py-12">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
          <div className="lg:col-span-2 flex flex-col gap-8">
            <section>
              {isLoading || !currentRound?.id ? (
                <div className="bg-base-100 border border-base-300 rounded-3xl p-6 shadow-md">
                  <div className="flex items-center justify-center h-56">
                    <span className="loading loading-spinner" />
                  </div>
                </div>
              ) : (
                <PriceChart roundId={currentRound.id} />
              )}
            </section>
            {isLoading || !currentRound?.id ? (
              <div className="bg-base-100 border border-base-300 rounded-3xl p-6 shadow-md">
                <div className="flex items-center justify-center h-56">
                  <span className="loading loading-spinner" />
                </div>
              </div>
            ) : (
              <Positions />
            )}
          </div>
          <div className="flex flex-col gap-6">
            {isLoading ? (
              <div className="bg-base-100 border border-base-300 rounded-3xl p-6 shadow-md">
                <div className="flex items-center justify-center h-40">
                  <span className="loading loading-spinner" />
                </div>
              </div>
            ) : (
              <BondingPoolCard bondingPool={currentRound?.bondingPool ?? null} />
            )}
            <Balances />
            <SwapHistory />
            <RoundState />
          </div>
        </div>
      </div>
    </AccessGate>
  );
};

export default Home;
