"use client";

import { useQuery } from "@tanstack/react-query";
import { useAccount } from "wagmi";
import { graphqlRequest } from "~~/services/ponder/graphql";
import { SwapEvent } from "~~/types/client_types";

const REFETCH_INTERVAL = parseInt(process.env.NEXT_PUBLIC_UI_REFETCH_INTERVAL ?? "10000", 10);

type SwapHistoryItem = {
  id: string;
  lbp: string;
  user: string;
  buyToken: boolean;
  amountIn: string;
  amountOut: string;
  blockNumber: string;
  timestamp: string;
  transactionHash: string;
};

type SwapHistoryResponse = {
  swaps: {
    items: SwapHistoryItem[];
  };
};

const SWAP_HISTORY_GQL = /* GraphQL */ `
  query SwapHistory($user: String!) {
    swaps(where: { user: $user }, orderBy: "timestamp", orderDirection: "desc") {
      items {
        id
        lbp
        user
        buyToken
        amountIn
        amountOut
        blockNumber
        timestamp
        transactionHash
      }
    }
  }
`;

export function useSwapHistory() {
  const { address } = useAccount();
  const enabled = Boolean(address);

  return useQuery<SwapHistoryResponse, Error, SwapEvent[]>({
    queryKey: ["swapHistory", address],
    enabled,
    staleTime: 60_000,
    refetchInterval: REFETCH_INTERVAL,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    queryFn: () => {
      console.log(`Fetching swap history for user: ${address}`);
      return graphqlRequest<SwapHistoryResponse>(SWAP_HISTORY_GQL, {
        user: address,
      });
    },
    select: data => {
      console.log(`Swap history query returned ${data.swaps.items.length} items`);
      return data.swaps.items.map(item => ({
        id: item.id,
        lbp: item.lbp as `0x${string}`,
        user: item.user as `0x${string}`,
        buyToken: item.buyToken,
        amountIn: BigInt(item.amountIn),
        amountOut: BigInt(item.amountOut),
        blockNumber: BigInt(item.blockNumber),
        timestamp: BigInt(item.timestamp),
        transactionHash: item.transactionHash as `0x${string}`,
      }));
    },
  });
}
