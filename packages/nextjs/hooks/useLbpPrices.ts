"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { formatUnits } from "viem";
import { graphqlRequest } from "~~/services/ponder/graphql";
import { LatestPriceByLbp, PoolStateByLbp, PricePoint, PriceSeries, PricesByLbp } from "~~/types/client_types";

const PAGE_LIMIT = 200;

const PRICE_HISTORY_GQL = /* GraphQL */ `
  query PriceHistory($lbps: [String!]!, $after: String, $limit: Int) {
    prices(where: { lbp_in: $lbps }, orderBy: "timestamp", orderDirection: "asc", after: $after, limit: $limit) {
      items {
        id
        lbp
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

const POOL_STATE_GQL = /* GraphQL */ `
  query PoolStates($lbps: [String!]!) {
    poolStates(where: { lbp_in: $lbps }) {
      items {
        lbp
        tokenReserve
        ethReserve
        weightToken
        weightEth
        priceWei
        lastUpdated
      }
    }
  }
`;

type PriceHistoryResponse = {
  prices: {
    items: Array<{
      id: string;
      lbp: string;
      value: string;
      timestamp: string;
    }>;
    pageInfo: {
      hasNextPage: boolean;
      endCursor: string | null;
    };
  };
};

type PoolStateResponse = {
  poolStates: {
    items: Array<{
      lbp: string;
      tokenReserve: string;
      ethReserve: string;
      weightToken: string;
      weightEth: string;
      priceWei: string;
      lastUpdated: string;
    }>;
  };
};

type PriceEntry = {
  id: string;
  lbp: `0x${string}`;
  point: PricePoint;
};

function normalizeAddress(address: string): `0x${string}` {
  return address.toLowerCase() as `0x${string}`;
}

function convertPriceItems(items: PriceHistoryResponse["prices"]["items"]): PriceEntry[] {
  return items
    .filter(item => {
      const timestampSeconds = Number(item.timestamp);

      // Validate timestamp
      if (!Number.isFinite(timestampSeconds)) {
        console.error(`Skipping price entry ${item.id}: Invalid timestamp ${item.timestamp}`);
        return false;
      }

      // Validate price value exists
      if (!item.value || item.value === "0") {
        console.error(`Skipping price entry ${item.id}: Invalid price value ${item.value}`);
        return false;
      }

      return true;
    })
    .map(item => {
      const lbp = normalizeAddress(item.lbp);
      const timestampSeconds = Number(item.timestamp);

      const priceWei = BigInt(item.value);
      const priceInEth = Number(formatUnits(priceWei, 18));

      return {
        id: item.id,
        lbp,
        point: {
          timestamp: timestampSeconds,
          price: priceInEth,
          priceWei,
        },
      };
    });
}

async function fetchPricePage(lbps: readonly `0x${string}`[], cursor?: string | null) {
  return graphqlRequest<PriceHistoryResponse>(PRICE_HISTORY_GQL, {
    lbps,
    after: cursor ?? null,
    limit: PAGE_LIMIT,
  });
}

export function useLbpPrices(lbps?: readonly `0x${string}`[]) {
  const normalizedLbps = useMemo(() => (lbps ?? []).map(addr => normalizeAddress(addr)), [lbps]);
  const sortedLbps = useMemo(() => [...normalizedLbps].sort(), [normalizedLbps]);
  const lbpKey = useMemo(() => sortedLbps.join(","), [sortedLbps]);
  const positionsExist = sortedLbps.length > 0;

  const [seriesByLbp, setSeriesByLbp] = useState<PricesByLbp>({});

  const initialQuery = useQuery({
    queryKey: ["lbpPrices", lbpKey, "initial"],
    enabled: positionsExist,
    staleTime: Infinity, // Keep cached data fresh - never auto-refetch
    queryFn: async () => {
      console.log("Fetching initial price data from beginning for lbps:", sortedLbps);
      const allItems: PriceHistoryResponse["prices"]["items"] = [];
      let cursor: string | null | undefined = null; // Always start from null
      let hasNext = true;
      let lastCursor: string | null = null;

      while (hasNext) {
        const { prices } = await fetchPricePage(sortedLbps, cursor);
        if (prices.items.length > 0) {
          allItems.push(...prices.items);
        }

        if (prices.pageInfo.endCursor) {
          lastCursor = prices.pageInfo.endCursor;
        }

        hasNext = prices.pageInfo.hasNextPage && prices.pageInfo.endCursor !== null;
        cursor = prices.pageInfo.endCursor;

        if (!hasNext) {
          break;
        }
      }

      console.log(`Fetched ${allItems.length} initial price entries, cursor: ${lastCursor}`);
      return {
        items: allItems,
        cursor: lastCursor,
      };
    },
  });

  useEffect(() => {
    if (initialQuery.data) {
      const { items } = initialQuery.data;
      console.log(`Processing ${items.length} price items from initial query`);
      const entries = convertPriceItems(items);
      console.log(`Converted to ${entries.length} valid entries`);

      if (entries.length > 0) {
        const newSeries: PricesByLbp = {};
        for (const entry of entries) {
          if (!newSeries[entry.lbp]) {
            newSeries[entry.lbp] = [];
          }
          newSeries[entry.lbp].push(entry.point);
        }
        console.log(
          `Setting series:`,
          Object.keys(newSeries).length,
          "LBPs",
          Object.values(newSeries).map(points => points.length),
        );
        setSeriesByLbp(newSeries);
      }
    }
  }, [initialQuery.data]);

  const tailQuery = useQuery({
    queryKey: ["lbpPrices", lbpKey, "tail"],
    enabled: positionsExist && initialQuery.isSuccess,
    refetchInterval: 10000,
    refetchIntervalInBackground: true,
    staleTime: 0,
    queryFn: async () => {
      const startCursor = initialQuery.data?.cursor ?? null;
      console.log(`Fetching tail prices from cursor: ${startCursor}`);

      const aggregated: PriceHistoryResponse["prices"]["items"] = [];
      let cursor = startCursor;
      let lastCursor = startCursor;

      const MAX_TAIL_PAGES = 50;
      let pageCount = 0;

      while (pageCount < MAX_TAIL_PAGES) {
        pageCount++;
        const { prices } = await fetchPricePage(sortedLbps, cursor);
        if (prices.items.length > 0) {
          aggregated.push(...prices.items);
        }

        if (!prices.pageInfo.hasNextPage || !prices.pageInfo.endCursor) {
          if (prices.pageInfo.endCursor) {
            lastCursor = prices.pageInfo.endCursor;
          }
          break;
        }

        cursor = prices.pageInfo.endCursor;
        lastCursor = cursor;
      }

      if (pageCount >= MAX_TAIL_PAGES) {
        console.warn(`Tail query hit max page limit (${MAX_TAIL_PAGES})`);
      }

      console.log(`Fetched ${aggregated.length} new tail entries`);
      return {
        items: aggregated,
        cursor: lastCursor,
      };
    },
  });

  useEffect(() => {
    if (tailQuery.data?.items) {
      const entries = convertPriceItems(tailQuery.data.items);
      console.log(`Processing ${entries.length} tail entries`);

      if (entries.length > 0) {
        setSeriesByLbp(prev => {
          const next = { ...prev };
          for (const entry of entries) {
            const existing = next[entry.lbp] ?? [];
            const exists = existing.some(p => p.timestamp === entry.point.timestamp);
            if (!exists) {
              next[entry.lbp] = [...existing, entry.point].sort((a, b) => a.timestamp - b.timestamp);
            }
          }
          return next;
        });
      }
    }
  }, [tailQuery.data]);

  const series: PriceSeries[] = useMemo(() => {
    if (!positionsExist) {
      console.log("Hook disabled - no LBP addresses provided");
      return [];
    }

    const result = sortedLbps.map(lbp => {
      const points = seriesByLbp[lbp] ?? [];
      const latestPoint = points.at(-1) ?? null;

      return {
        lbpAddress: lbp,
        points,
        latestPrice: latestPoint ? latestPoint.price : null,
        latestPriceWei: latestPoint ? latestPoint.priceWei : null,
      };
    });

    return result;
  }, [positionsExist, sortedLbps, seriesByLbp]);

  const latestPriceByLbp: LatestPriceByLbp = useMemo(() => {
    const map: LatestPriceByLbp = {} as LatestPriceByLbp;
    for (const entry of series) {
      map[entry.lbpAddress] = {
        price: entry.latestPrice,
        priceWei: entry.latestPriceWei,
      };
    }
    return map;
  }, [series]);

  // Query pool states
  const poolStateQuery = useQuery({
    queryKey: ["poolStates", lbpKey],
    enabled: positionsExist,
    refetchInterval: 10000, // Refresh every 10 seconds
    staleTime: 0,
    queryFn: async () => {
      console.log("Fetching pool states for lbps:", sortedLbps);
      const response = await graphqlRequest<PoolStateResponse>(POOL_STATE_GQL, {
        lbps: sortedLbps,
      });
      return response.poolStates.items;
    },
  });

  const poolStateByLbp: PoolStateByLbp = useMemo(() => {
    if (!poolStateQuery.data) return {} as PoolStateByLbp;

    const map: PoolStateByLbp = {} as PoolStateByLbp;
    for (const item of poolStateQuery.data) {
      const lbp = normalizeAddress(item.lbp);
      map[lbp] = {
        lbp,
        tokenReserve: BigInt(item.tokenReserve),
        ethReserve: BigInt(item.ethReserve),
        weightToken: BigInt(item.weightToken),
        weightEth: BigInt(item.weightEth),
        priceWei: BigInt(item.priceWei),
        lastUpdated: BigInt(item.lastUpdated),
      };
    }
    return map;
  }, [poolStateQuery.data]);

  return {
    series,
    isLoading: initialQuery.isLoading,
    isFetching: initialQuery.isFetching,
    latestPriceByLbp,
    poolStateByLbp,
  };
}
