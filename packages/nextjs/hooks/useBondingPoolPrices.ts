"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { formatUnits } from "viem";
import { graphqlRequest } from "~~/services/ponder/graphql";
import { BondingPoolPriceSeries, PricePoint } from "~~/types/client_types";

const PAGE_LIMIT = 200;
const REFRESH_INTERVAL_MS = 10000;

const BONDING_POOL_PRICE_GQL = /* GraphQL */ `
  query BondingPoolPrices($bondingPool: String!, $after: String, $limit: Int) {
    bondingPoolPrices(
      where: { bondingPool: $bondingPool }
      orderBy: "timestamp"
      orderDirection: "asc"
      after: $after
      limit: $limit
    ) {
      items {
        id
        bondingPool
        value
        timestamp
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

type BondingPoolPriceResponse = {
  bondingPoolPrices: {
    items: Array<{
      id: string;
      bondingPool: string;
      value: string;
      timestamp: string;
    }>;
    pageInfo: {
      hasNextPage: boolean;
      endCursor: string | null;
    };
  };
};

function normalizeAddress(address: string): `0x${string}` {
  return address.toLowerCase() as `0x${string}`;
}

function convertItems(items: BondingPoolPriceResponse["bondingPoolPrices"]["items"]): PricePoint[] {
  return items
    .map(item => {
      const timestampSeconds = Number(item.timestamp);
      if (!Number.isFinite(timestampSeconds)) {
        console.warn(`[useBondingPoolPrices] Skipping invalid timestamp ${item.timestamp} for ${item.id}`);
        return null;
      }

      const rawValue = item.value ? BigInt(item.value) : undefined;
      if (!rawValue) {
        console.warn(`[useBondingPoolPrices] Skipping invalid value for ${item.id}`);
        return null;
      }

      return {
        timestamp: timestampSeconds,
        price: Number(formatUnits(rawValue, 18)),
      };
    })
    .filter((point): point is PricePoint => point !== null)
    .sort((a, b) => a.timestamp - b.timestamp);
}

async function fetchPage(bondingPool: `0x${string}`, cursor?: string | null) {
  return graphqlRequest<BondingPoolPriceResponse>(BONDING_POOL_PRICE_GQL, {
    bondingPool,
    after: cursor ?? null,
    limit: PAGE_LIMIT,
  });
}

export function useBondingPoolPrices(bondingPool?: `0x${string}`) {
  const normalizedPool = useMemo(() => (bondingPool ? normalizeAddress(bondingPool) : undefined), [bondingPool]);

  const [points, setPoints] = useState<PricePoint[]>([]);
  const [latestPrice, setLatestPrice] = useState<number | null>(null);
  const [latestPriceWei, setLatestPriceWei] = useState<bigint | null>(null);

  useEffect(() => {
    if (!normalizedPool) {
      setPoints([]);
      setLatestPrice(null);
      setLatestPriceWei(null);
    }
  }, [normalizedPool]);

  const initialQuery = useQuery({
    queryKey: ["bondingPoolPrices", normalizedPool, "initial"],
    enabled: Boolean(normalizedPool),
    staleTime: Infinity,
    queryFn: async () => {
      if (!normalizedPool) {
        return { items: [] as BondingPoolPriceResponse["bondingPoolPrices"]["items"], cursor: null };
      }

      const aggregated: BondingPoolPriceResponse["bondingPoolPrices"]["items"] = [];
      let cursor: string | null | undefined = null;
      let lastCursor: string | null = null;

      while (true) {
        const { bondingPoolPrices } = await fetchPage(normalizedPool, cursor);
        if (bondingPoolPrices.items.length > 0) {
          aggregated.push(...bondingPoolPrices.items);
        }

        if (!bondingPoolPrices.pageInfo.hasNextPage || !bondingPoolPrices.pageInfo.endCursor) {
          lastCursor = bondingPoolPrices.pageInfo.endCursor;
          break;
        }

        cursor = bondingPoolPrices.pageInfo.endCursor;
        lastCursor = cursor;
      }

      return { items: aggregated, cursor: lastCursor };
    },
  });

  useEffect(() => {
    if (!initialQuery.data) return;
    const converted = convertItems(initialQuery.data.items);
    setPoints(converted);
    if (converted.length > 0) {
      const last = converted[converted.length - 1]!;
      setLatestPrice(last.price);
      setLatestPriceWei(BigInt(initialQuery.data.items[initialQuery.data.items.length - 1]!.value));
    } else {
      setLatestPrice(null);
      setLatestPriceWei(null);
    }
  }, [initialQuery.data]);

  const tailQuery = useQuery({
    queryKey: ["bondingPoolPrices", normalizedPool, "tail"],
    enabled: Boolean(normalizedPool) && initialQuery.isSuccess,
    refetchInterval: REFRESH_INTERVAL_MS,
    refetchIntervalInBackground: true,
    staleTime: 0,
    queryFn: async () => {
      if (!normalizedPool) {
        return { items: [] as BondingPoolPriceResponse["bondingPoolPrices"]["items"], cursor: null };
      }

      const startCursor = initialQuery.data?.cursor ?? null;
      const aggregated: BondingPoolPriceResponse["bondingPoolPrices"]["items"] = [];
      let cursor = startCursor;
      let lastCursor = startCursor;

      while (true) {
        const { bondingPoolPrices } = await fetchPage(normalizedPool, cursor);
        if (bondingPoolPrices.items.length > 0) {
          aggregated.push(...bondingPoolPrices.items);
        }

        if (!bondingPoolPrices.pageInfo.hasNextPage || !bondingPoolPrices.pageInfo.endCursor) {
          if (bondingPoolPrices.pageInfo.endCursor) {
            lastCursor = bondingPoolPrices.pageInfo.endCursor;
          }
          break;
        }

        cursor = bondingPoolPrices.pageInfo.endCursor;
        lastCursor = cursor;
      }

      return { items: aggregated, cursor: lastCursor };
    },
  });

  useEffect(() => {
    if (!tailQuery.data?.items || tailQuery.data.items.length === 0) return;
    const incomingItems = tailQuery.data.items;
    const incomingPoints = convertItems(incomingItems);
    if (incomingPoints.length === 0) return;

    setPoints(prev => {
      const seen = new Set(prev.map(point => point.timestamp));
      const merged = [...prev];

      for (let i = 0; i < incomingPoints.length; i++) {
        const point = incomingPoints[i]!;
        if (!seen.has(point.timestamp)) {
          merged.push(point);
        }
      }

      merged.sort((a, b) => a.timestamp - b.timestamp);

      const lastPoint = merged[merged.length - 1]!;
      setLatestPrice(lastPoint.price);
      const lastItem = incomingItems[incomingItems.length - 1];
      if (lastItem?.value) {
        setLatestPriceWei(BigInt(lastItem.value));
      }

      return merged;
    });
  }, [tailQuery.data]);

  const series: BondingPoolPriceSeries | null = normalizedPool
    ? {
        bondingPool: normalizedPool,
        points,
        latestPrice,
        latestPriceWei,
      }
    : null;

  return {
    series,
    latestPrice,
    latestPriceWei,
    isLoading: initialQuery.isLoading,
    isFetching: initialQuery.isFetching || tailQuery.isFetching,
  };
}
