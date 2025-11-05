"use client";

import { useQuery } from "@tanstack/react-query";
import { graphqlRequest } from "~~/services/ponder/graphql";

type LatestRoundItem = {
  id: string;
  startTime: string;
  duration: string;
  endTime: string;
  bondingPool: `0x${string}`;
  settled: boolean;
  winnerLbp?: `0x${string}` | null;
};

type LatestRoundQuery = {
  rounds: {
    items: LatestRoundItem[];
  };
};

const LATEST_ROUND_GQL = /* GraphQL */ `
  query LatestRound($orderBy: String = "id", $orderDirection: String = "desc") {
    rounds(limit: 1, orderBy: $orderBy, orderDirection: $orderDirection) {
      items {
        id
        startTime
        duration
        endTime
        bondingPool
        settled
        winnerLbp
      }
    }
  }
`;

export function useLatestRound() {
  const parsedInterval = Number.parseInt(process.env.NEXT_PUBLIC_UI_REFETCH_INTERVAL ?? "", 10);
  const refetchInterval = Number.isFinite(parsedInterval) && parsedInterval > 0 ? parsedInterval : 10000;

  return useQuery({
    queryKey: ["latestRound"],
    queryFn: () => graphqlRequest<LatestRoundQuery>(LATEST_ROUND_GQL, {}),
    select: data => (data.rounds.items.length ? data.rounds.items[0] : null),
    // Polling for near-real-time updates; configurable via NEXT_PUBLIC_UI_REFETCH_INTERVAL
    refetchInterval,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });
}
