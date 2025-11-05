"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { graphqlRequest } from "~~/services/ponder/graphql";
import { PositionSummary } from "~~/types/client_types";

const ZERO_ADDRESS = `0x${"0".repeat(40)}` as `0x${string}`;

type PositionItem = {
  lbp: `0x${string}`;
  tokenAddress: `0x${string}`;
  tokenName?: string | null;
  tokenSymbol?: string | null;
  tokenTotalSupply?: string | null;
  tokenAmountInPool?: string | null;
  imageURI?: string | null;
};

type RoundPositionsResponse = {
  positions: {
    items: PositionItem[];
  };
};

const ROUND_POSITIONS_GQL = /* GraphQL */ `
  query RoundPositions($roundId: BigInt!) {
    positions(where: { roundId: $roundId }, orderBy: "createdAt", orderDirection: "asc") {
      items {
        lbp
        tokenAddress
        tokenName
        tokenSymbol
        tokenTotalSupply
        tokenAmountInPool
        imageURI
      }
    }
  }
`;

function withPercentages(positions: PositionSummary[]): PositionSummary[] {
  const totalOwned = positions.reduce((sum, position) => sum + position.ownedSupply, 0n);
  if (totalOwned === 0n) {
    return positions.map(position => ({ ...position, percentage: 0 }));
  }

  return positions.map(position => {
    const scaled = position.ownedSupply * 10000n;
    const percentage = Number(scaled / totalOwned) / 100;
    return { ...position, percentage };
  });
}

export function useRoundPositions(roundId?: string | null) {
  const enabled = Boolean(roundId);

  const query = useQuery<RoundPositionsResponse, Error, PositionSummary[]>({
    queryKey: ["roundPositions", roundId],
    enabled,
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    placeholderData: previousData => previousData,
    queryFn: () => {
      return graphqlRequest<RoundPositionsResponse>(ROUND_POSITIONS_GQL, {
        roundId,
      });
    },
    select: data => {
      const base: PositionSummary[] = data.positions.items.map(item => {
        const totalSupply = item.tokenTotalSupply ? BigInt(item.tokenTotalSupply) : 0n;
        const amountInPool = item.tokenAmountInPool ? BigInt(item.tokenAmountInPool) : 0n;
        const ownedSupply = totalSupply > amountInPool ? totalSupply - amountInPool : 0n;
        const imageURI = item.imageURI ?? "";
        const tokenAddress = item.tokenAddress ?? ZERO_ADDRESS;

        return {
          lbpAddress: item.lbp,
          tokenAddress,
          name: item.tokenName ?? `Position ${item.lbp.slice(0, 8)}...`,
          symbol: item.tokenSymbol ?? item.tokenName ?? "???",
          totalSupply,
          tokenAmountInPool: amountInPool,
          ownedSupply,
          percentage: 0,
          imageURI,
        };
      });

      return withPercentages(base);
    },
    refetchInterval: 10000,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });

  // Transform the data to a Map while preserving React Query reactivity
  const positionsMap = useMemo(() => {
    if (!query.data) return new Map<`0x${string}`, PositionSummary>();
    const map = new Map<`0x${string}`, PositionSummary>();
    query.data.forEach(position => {
      map.set(position.lbpAddress, position);
    });
    return map;
  }, [query.data]);

  // Return the query result with transformed data
  return {
    ...query,
    data: positionsMap,
  };
}
