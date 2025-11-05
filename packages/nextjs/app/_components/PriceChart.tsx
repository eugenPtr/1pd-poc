"use client";

import { useMemo } from "react";
import { format } from "date-fns";
import ReactECharts from "echarts-for-react";
import { useLbpPrices } from "~~/hooks/useLbpPrices";
import { useRoundPositions } from "~~/hooks/useRoundPositions";

const COLORS = ["#6366F1", "#EC4899", "#22C55E", "#F97316", "#0EA5E9", "#8B5CF6", "#F59E0B", "#14B8A6"];
const FALLBACK_IMAGE_URL = "https://placehold.co/100";

const IMAGE_SYMBOL_SIZE = 50;

function formatPrice(value: number): string {
  if (!Number.isFinite(value)) return "-";
  if (value >= 1) return value.toFixed(2);
  if (value >= 0.01) return value.toFixed(4);
  return value.toPrecision(3);
}

interface PriceChartProps {
  roundId: string;
}

export function PriceChart({ roundId }: PriceChartProps) {
  const {
    data: positionsMap,
    isLoading: isPositionsLoading,
    isFetching: isPositionsFetching,
  } = useRoundPositions(roundId);

  const positions = useMemo(() => {
    if (!positionsMap) return [];
    return Array.from(positionsMap.values());
  }, [positionsMap]);

  const lbpAddresses = useMemo(() => positions.map(position => position.lbpAddress), [positions]);
  const metadataByLbp = useMemo(() => {
    const normalizeImageUrl = (imageURI: string) => {
      if (!imageURI) return FALLBACK_IMAGE_URL;
      return imageURI.startsWith("ipfs://")
        ? `https://gateway.pinata.cloud/ipfs/${imageURI.slice("ipfs://".length)}`
        : imageURI;
    };

    return positions.reduce<Record<`0x${string}`, { name: string; symbol: string; imageUrl: string }>>(
      (acc, position) => {
        acc[position.lbpAddress] = {
          name: position.name,
          symbol: position.symbol,
          imageUrl: normalizeImageUrl(position.imageURI),
        };
        return acc;
      },
      {},
    );
  }, [positions]);

  const { series, isLoading: isPricesLoading, isFetching: isPricesFetching } = useLbpPrices(lbpAddresses);

  const isLoading = (isPositionsLoading || isPricesLoading) && series.length === 0;
  const isRefreshing = isPositionsFetching || isPricesFetching;
  const isEmpty = !isLoading && series.every(s => s.points.length === 0);

  const option = useMemo(() => {
    if (series.length === 0 || isEmpty) {
      return null;
    }

    const allTimestamps = new Set<number>();
    series.forEach(line => {
      line.points.forEach(point => allTimestamps.add(point.timestamp));
    });
    const sortedTimestamps = [...allTimestamps].sort((a, b) => a - b);

    const seriesData = series.map((line, index) => {
      const metadata = metadataByLbp[line.lbpAddress];
      const name = metadata ? metadata.symbol || metadata.name : line.lbpAddress.slice(0, 8);

      const data = sortedTimestamps.map(timestamp => {
        const point = line.points.find(p => p.timestamp === timestamp);
        return point ? point.price : null;
      });

      const imageUrl = metadata?.imageUrl ?? FALLBACK_IMAGE_URL;

      return {
        name,
        type: "line",
        data,
        smooth: true,
        showSymbol: false,
        markPoint:
          data.length > 0 && data[data.length - 1] !== null
            ? {
                data: [
                  {
                    coord: [data.length - 1, data[data.length - 1]],
                    symbol: `image://${imageUrl}`,
                    symbolSize: IMAGE_SYMBOL_SIZE,
                    symbolOffset: [0, 0],
                    symbolKeepAspect: true,
                  },
                ],
                label: {
                  show: false,
                },
                tooltip: {
                  show: false,
                },
              }
            : undefined,
        lineStyle: {
          width: 2,
          color: COLORS[index % COLORS.length],
        },
        areaStyle: {
          color: {
            type: "linear",
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              {
                offset: 0,
                color: `${COLORS[index % COLORS.length]}40`,
              },
              {
                offset: 1,
                color: `${COLORS[index % COLORS.length]}00`,
              },
            ],
          },
        },
      };
    });

    return {
      tooltip: {
        trigger: "axis",
        backgroundColor: "rgba(0, 0, 0, 0.8)",
        borderColor: "#4b5563",
        textStyle: {
          color: "#fff",
          fontSize: 12,
        },
        formatter: (params: any) => {
          if (!params || params.length === 0) return "";
          const timestamp = sortedTimestamps[params[0].dataIndex];
          const timeStr = format(new Date(timestamp * 1000), "PPpp");
          let tooltip = `<div style="font-weight: 500; margin-bottom: 8px;">${timeStr}</div>`;
          params.forEach((param: any) => {
            if (param.value !== null) {
              tooltip += `<div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
                <span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: ${param.color};"></span>
                <span style="font-weight: 500;">${param.seriesName}</span>
                <span style="margin-left: auto; font-family: monospace;">${formatPrice(param.value)}</span>
              </div>`;
            }
          });
          return tooltip;
        },
      },
      legend: {
        data: seriesData.map(s => s.name),
        textStyle: {
          color: "#9ca3af",
          fontSize: 12,
        },
        top: 0,
      },
      grid: {
        left: 60,
        right: 24,
        top: 40,
        bottom: 40,
      },
      xAxis: {
        type: "category",
        data: sortedTimestamps.map(ts => format(new Date(ts * 1000), "HH:mm:ss")),
        axisLine: {
          lineStyle: {
            color: "#4b5563",
          },
        },
        axisLabel: {
          color: "#9ca3af",
          fontSize: 12,
        },
      },
      yAxis: {
        type: "value",
        axisLine: {
          lineStyle: {
            color: "#4b5563",
          },
        },
        axisLabel: {
          color: "#9ca3af",
          fontSize: 12,
          formatter: (value: number) => formatPrice(value),
        },
        splitLine: {
          lineStyle: {
            color: "#4b5563",
            opacity: 0.2,
            type: "dashed",
          },
        },
      },
      series: seriesData,
    };
  }, [series, isEmpty, metadataByLbp]);

  return (
    <section className="bg-base-100 border border-base-300 rounded-3xl p-6 shadow-md">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-2xl font-semibold">Price Overview</h3>
          <p className="text-sm text-base-content/70">Position tokens prices</p>
        </div>
        {isRefreshing && !isLoading ? <span className="loading loading-spinner loading-sm" /> : null}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-72">
          <span className="loading loading-spinner" />
        </div>
      ) : isEmpty ? (
        <div className="flex items-center justify-center h-72 text-sm text-base-content/60">
          Price history will appear once positions are created.
        </div>
      ) : (
        <div className="h-72">
          <ReactECharts option={option!} style={{ height: "100%", width: "100%" }} />
        </div>
      )}
    </section>
  );
}
