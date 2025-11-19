"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { formatUnits } from "viem";
import { graphqlRequest } from "~~/services/ponder/graphql";
import { PositionSummary } from "~~/types/client_types";

const ZERO_ADDRESS = `0x${"0".repeat(40)}` as `0x${string}`;
const REFETCH_INTERVAL = parseInt(process.env.NEXT_PUBLIC_UI_REFETCH_INTERVAL ?? "10000", 10);

type PositionItem = {
  lbp: `0x${string}`;
  tokenAddress: `0x${string}`;
  tokenName?: string | null;
  tokenSymbol?: string | null;
  tokenTotalSupply?: string | null;
  tokenAmountInPool?: string | null;
  imageURI?: string | null;
  initialPrice?: string | null;
  liquidationPrice?: string | null;
  isLiquidated?: boolean | null;
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
        initialPrice
        liquidationPrice
        isLiquidated
      }
    }
  }
`;

function withPercentages(positions: PositionSummary[]): PositionSummary[] {
  const activeOwnedSupply = positions.reduce((sum, position) => {
    if (position.isLiquidated) return sum;
    return sum + position.ownedSupply;
  }, 0n);

  if (activeOwnedSupply === 0n) {
    return positions.map(position => ({ ...position, percentage: 0 }));
  }

  return positions.map(position => {
    if (position.isLiquidated) {
      return { ...position, percentage: 0 };
    }

    const scaled = position.ownedSupply * 10000n;
    const percentage = Number(scaled / activeOwnedSupply) / 100;
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

        // Parse prices from string to bigint
        const initialPrice = item.initialPrice ? BigInt(item.initialPrice) : 0n;
        const liquidationPrice = item.liquidationPrice ? BigInt(item.liquidationPrice) : 0n;
        const isLiquidated = Boolean(item.isLiquidated);

        // Calculate market caps: totalSupply × price (in ETH)
        const totalSupplyInEth = Number(formatUnits(totalSupply, 18));
        const initialPriceInEth = Number(formatUnits(initialPrice, 18));
        const liquidationPriceInEth = Number(formatUnits(liquidationPrice, 18));

        const initialMarketCap = totalSupplyInEth * initialPriceInEth;
        const liquidationMarketCap = totalSupplyInEth * liquidationPriceInEth;

        return {
          lbpAddress: item.lbp,
          tokenAddress,
          name: item.tokenName ?? `Position ${item.lbp.slice(0, 8)}...`,
          symbol: item.tokenSymbol ?? item.tokenName ?? "???",
          totalSupply,
          tokenAmountInPool: amountInPool,
          ownedSupply,
          isLiquidated,
          percentage: 0,
          imageURI,
          initialPrice,
          liquidationPrice,
          initialMarketCap,
          liquidationMarketCap,
        };
      });

      return withPercentages(base);
    },
    refetchInterval: REFETCH_INTERVAL,
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
