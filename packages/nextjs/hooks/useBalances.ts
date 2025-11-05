"use client";

import { useMemo } from "react";
import { useLatestRound } from "./useLatestRound";
import { useRoundPositions } from "./useRoundPositions";
import { useQuery } from "@tanstack/react-query";
import { useAccount } from "wagmi";
import { graphqlRequest } from "~~/services/ponder/graphql";
import { UserBalance } from "~~/types/client_types";

const REFETCH_INTERVAL = parseInt(process.env.NEXT_PUBLIC_UI_REFETCH_INTERVAL ?? "10000", 10);

type BalanceItem = {
  lbp: string;
  balance: string;
};

type BalancesResponse = {
  userPositionBalances: {
    items: BalanceItem[];
  };
};

const USER_BALANCES_GQL = /* GraphQL */ `
  query UserBalances($user: String!, $lbps: [String!]!) {
    userPositionBalances(where: { user: $user, lbp_in: $lbps }) {
      items {
        lbp
        balance
      }
    }
  }
`;

export function useBalances() {
  const { address } = useAccount();
  const { data: currentRound } = useLatestRound();
  const { data: positionsMap } = useRoundPositions(currentRound?.id);

  // Build array of all LBP addresses (positions + bonding pool)
  const lbpAddresses = useMemo(() => {
    const addresses: `0x${string}`[] = [];

    if (positionsMap) {
      addresses.push(...Array.from(positionsMap.keys()));
    }

    if (currentRound?.bondingPool) {
      addresses.push(currentRound.bondingPool as `0x${string}`);
    }

    return addresses;
  }, [positionsMap, currentRound?.bondingPool]);

  const enabled = Boolean(address) && lbpAddresses.length > 0;

  return useQuery<BalancesResponse, Error, UserBalance[]>({
    queryKey: ["userBalances", address, lbpAddresses.join(",")],
    enabled,
    staleTime: 60_000,
    refetchInterval: REFETCH_INTERVAL,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    queryFn: () => {
      console.log(`Fetching balances for user: ${address}, ${lbpAddresses.length} addresses`);
      return graphqlRequest<BalancesResponse>(USER_BALANCES_GQL, {
        user: address,
        lbps: lbpAddresses,
      });
    },
    select: data => {
      const balances: UserBalance[] = data.userPositionBalances.items.map(item => {
        const lbp = item.lbp as `0x${string}`;
        const position = positionsMap?.get(lbp);

        // Check if this is the bonding pool
        const isBondingPool = lbp === currentRound?.bondingPool;

        return {
          lbp,
          symbol: isBondingPool ? "BCT" : (position?.symbol ?? "???"),
          imageURI: isBondingPool ? undefined : position?.imageURI,
          balance: BigInt(item.balance),
        };
      });

      // Sort: positions first, BCT last
      return balances.sort((a, b) => {
        if (a.symbol === "BCT") return 1;
        if (b.symbol === "BCT") return -1;
        return 0;
      });
    },
  });
}
