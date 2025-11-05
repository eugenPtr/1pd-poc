"use client";

import { useMemo, useState } from "react";
import { format } from "date-fns";
import ReactECharts from "echarts-for-react";
import { formatEther, parseEther } from "viem";
import { useWriteContract } from "wagmi";
import { KNOWN_ABIS } from "~~/contracts/knownAbis";
import { useTransactor } from "~~/hooks/scaffold-eth";
import { useBalances } from "~~/hooks/useBalances";
import { useBondingPoolPrices } from "~~/hooks/useBondingPoolPrices";
import { PricePoint } from "~~/types/client_types";

const COLORS = ["#39FF14"]; // fluorescent green

function formatPrice(value: number): string {
  if (!Number.isFinite(value)) return "-";
  if (value >= 1) return value.toFixed(2);
  if (value >= 0.01) return value.toFixed(4);
  return value.toPrecision(3);
}

function buildChartOptions(points: PricePoint[]) {
  if (points.length === 0) return null;

  const timestamps = points.map(point => point.timestamp);
  const prices = points.map(point => point.price);

  return {
    grid: {
      left: 48,
      right: 24,
      top: 32,
      bottom: 40,
    },
    tooltip: {
      trigger: "axis",
      backgroundColor: "rgba(15, 23, 42, 0.85)",
      borderColor: "#1f2937",
      textStyle: {
        color: "#f9fafb",
        fontSize: 12,
      },
      formatter: (params: any) => {
        if (!params || params.length === 0) return "";
        const timestamp = timestamps[params[0].dataIndex];
        const timeStr = format(new Date(timestamp * 1000), "PPpp");
        const value = params[0].value;

        return `<div style="display: flex; flex-direction: column; gap: 6px;">
            <span style="font-weight: 600;">${timeStr}</span>
            <span style="font-family: monospace;">Price: ${formatPrice(value)}</span>
          </div>`;
      },
    },
    xAxis: {
      type: "category",
      data: timestamps.map(ts => format(new Date(ts * 1000), "HH:mm:ss")),
      axisLine: {
        lineStyle: {
          color: "#475569",
        },
      },
      axisLabel: {
        color: "#94a3b8",
        fontSize: 11,
      },
    },
    yAxis: {
      type: "value",
      axisLine: {
        lineStyle: {
          color: "#475569",
        },
      },
      axisLabel: {
        color: "#94a3b8",
        fontSize: 11,
        formatter: (value: number) => formatPrice(value),
      },
      splitLine: {
        lineStyle: {
          color: "#475569",
          opacity: 0.2,
          type: "dashed",
        },
      },
    },
    series: [
      {
        name: "Bonding Pool",
        type: "line",
        data: prices,
        smooth: true,
        showSymbol: false,
        lineStyle: {
          width: 2,
          color: COLORS[0],
        },
        areaStyle: {
          color: {
            type: "linear",
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: `${COLORS[0]}40` },
              { offset: 1, color: `${COLORS[0]}00` },
            ],
          },
        },
      },
    ],
  };
}

type BondingPoolCardProps = {
  bondingPool?: `0x${string}` | null;
};

export function BondingPoolCard({ bondingPool }: BondingPoolCardProps) {
  const { series, latestPrice, isLoading, isFetching } = useBondingPoolPrices(bondingPool ?? undefined);
  const points = series?.points ?? [];
  const chartOptions = useMemo(() => buildChartOptions(points), [points]);

  // Sell functionality state
  const [sellAmount, setSellAmount] = useState("");
  const { data: balances = [], refetch: refetchBalances } = useBalances();
  const transactor = useTransactor();
  const { writeContractAsync, isPending } = useWriteContract();

  // Get BCT balance
  const bctBalance = useMemo(() => {
    const bctEntry = balances.find(b => b.symbol === "BCT");
    return bctEntry?.balance ?? 0n;
  }, [balances]);

  const formattedBalance = Number(formatEther(bctBalance)).toFixed(4);

  // Validation
  const sellAmountBigInt = useMemo(() => {
    try {
      return sellAmount && parseFloat(sellAmount) > 0 ? parseEther(sellAmount) : 0n;
    } catch {
      return 0n;
    }
  }, [sellAmount]);

  // Estimate ETH output using cached price
  const estimatedEthWei = useMemo(() => {
    if (!sellAmountBigInt || sellAmountBigInt === 0n || !latestPrice) return null;
    // Simple linear approximation using current price
    // For more accuracy, could query bonding curve's calculateEthAmount
    return (sellAmountBigInt * parseEther(latestPrice.toString())) / parseEther("1");
  }, [sellAmountBigInt, latestPrice]);

  const estimatedEth = useMemo(() => {
    if (!estimatedEthWei) return null;
    return Number(formatEther(estimatedEthWei)).toFixed(6);
  }, [estimatedEthWei]);

  const isValidSell = sellAmountBigInt > 0n && sellAmountBigInt <= bctBalance && !isPending;

  const handleMax = () => {
    setSellAmount(formatEther(bctBalance));
  };

  const handleSell = async () => {
    if (!isValidSell || !bondingPool) return;

    try {
      await transactor(() =>
        writeContractAsync({
          address: bondingPool,
          abi: KNOWN_ABIS.LinearBondingCurve,
          functionName: "burnBct",
          args: [sellAmountBigInt],
        }),
      );

      // Reset and refetch on success
      setSellAmount("");
      await refetchBalances();
    } catch (error) {
      console.error("Failed to burn BCT:", error);
    }
  };

  return (
    <section className="bg-base-100 border border-base-300 rounded-3xl shadow-md p-6 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Bonding Pool</h3>
          {latestPrice !== null && (
            <p className="text-base font-semibold text-base-content">{formatPrice(latestPrice)} ETH</p>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-40">
          <span className="loading loading-spinner" />
        </div>
      ) : !bondingPool ? (
        <div className="flex items-center justify-center h-40 text-base-content/60 text-sm">
          Bonding pool not available for the current round.
        </div>
      ) : points.length === 0 ? (
        <div className="flex items-center justify-center h-40 text-base-content/60 text-sm">
          No bonding pool price data yet.
        </div>
      ) : chartOptions ? (
        <ReactECharts option={chartOptions} notMerge lazyUpdate style={{ height: "240px" }} showLoading={isFetching} />
      ) : null}

      {/* Sell functionality */}
      {bondingPool && (
        <div className="flex flex-col gap-2 pt-4 border-t border-base-300">
          <label className="text-sm font-medium">Sell bonding curve tokens</label>
          <div className="flex gap-2">
            <input
              type="number"
              value={sellAmount}
              onChange={e => setSellAmount(e.target.value)}
              placeholder="0.0000"
              step="0.0001"
              className="input input-bordered flex-1"
              disabled={isPending}
            />
            <button
              type="button"
              onClick={handleMax}
              className="btn btn-sm btn-ghost"
              disabled={isPending || bctBalance === 0n}
            >
              Max
            </button>
            <button type="button" onClick={handleSell} className="btn btn-primary" disabled={!isValidSell}>
              {isPending ? <span className="loading loading-spinner loading-sm" /> : "Sell"}
            </button>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-base-content/60">Balance {formattedBalance} BCT</span>
            {estimatedEth && <span className="text-base-content/60">Est. {estimatedEth} ETH</span>}
          </div>
        </div>
      )}
    </section>
  );
}
