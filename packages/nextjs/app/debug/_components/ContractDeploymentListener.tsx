"use client";

import { useEffect, useMemo } from "react";
import { ContractReadMethods } from "./contract/ContractReadMethods";
import { ContractWriteMethods } from "./contract/ContractWriteMethods";
import { useSessionStorage } from "usehooks-ts";
import { usePublicClient } from "wagmi";
import { Address } from "~~/components/scaffold-eth";
import { KNOWN_ABIS } from "~~/contracts/knownAbis";
import { useScaffoldWatchContractEvent } from "~~/hooks/scaffold-eth";

type DynamicContract = {
  name: string;
  address: `0x${string}`;
  abi: readonly any[];
};

type DynamicContractsMap = Record<string, DynamicContract>;

const storageKey = "scaffoldEth2.dynamicContracts";

export function ContractDeploymentListener() {
  const [dynamicContracts, setDynamicContracts] = useSessionStorage<DynamicContractsMap>(storageKey, {});
  const publicClient = usePublicClient();

  const addContract = (key: string, name: string, address: string, abiName: keyof typeof KNOWN_ABIS) => {
    if (!address || address === "0x0000000000000000000000000000000000000000") return;
    setDynamicContracts(prev => {
      const normalizedAddress = address as `0x${string}`;
      const existing = prev[key];
      if (existing && existing.address.toLowerCase() === normalizedAddress.toLowerCase()) {
        return prev;
      }
      return {
        ...prev,
        [key]: {
          name,
          address: normalizedAddress,
          abi: KNOWN_ABIS[abiName] as readonly any[],
        },
      };
    });
  };

  // Listen for new rounds to get the bonding pool (LinearBondingCurve) address
  useScaffoldWatchContractEvent({
    contractName: "RoundOrchestrator",
    eventName: "RoundStarted",
    onLogs: logs => {
      logs.forEach((log: any) => {
        const roundId = (log.args?.roundId || log.args?.[0]) as bigint | undefined;
        const bondingPool = (log.args?.bondingPool || log.args?.[3]) as string | undefined;
        if (roundId && bondingPool) {
          const rid = Number(roundId);
          addContract(
            `LinearBondingCurve-${rid}`,
            `LinearBondingCurve (Round ${rid})`,
            bondingPool,
            "LinearBondingCurve",
          );
        }
      });
    },
  });

  // Listen for positions created to track LBP and PositionToken addresses
  useScaffoldWatchContractEvent({
    contractName: "RoundOrchestrator",
    eventName: "PositionCreated",
    onLogs: logs => {
      logs.forEach((log: any) => {
        const roundId = (log.args?.roundId || log.args?.[0]) as bigint | undefined;
        const lbpAddress = (log.args?.lbpAddress || log.args?.[1]) as string | undefined;
        const tokenAddress = (log.args?.tokenAddress || log.args?.[3]) as string | undefined;
        if (roundId && lbpAddress) {
          const rid = Number(roundId);
          addContract(`LBP-${rid}-${lbpAddress}`, `LBP (Round ${rid})`, lbpAddress, "LBP");
        }
        if (roundId && tokenAddress) {
          const rid = Number(roundId);
          addContract(
            `PositionToken-${rid}-${tokenAddress}`,
            `PositionToken (Round ${rid})`,
            tokenAddress,
            "PositionToken",
          );
        }
      });
    },
  });

  // Detect chain restart and clear stale contracts
  useEffect(() => {
    if (!publicClient) return;

    const detectChainRestart = async () => {
      try {
        const blockNumber = await publicClient.getBlockNumber();
        // If block number is very low, chain likely restarted
        if (blockNumber < 100n) {
          const entries = Object.entries(dynamicContracts);
          if (entries.length > 0) {
            console.log(`Chain restart detected (block ${blockNumber}), clearing ${entries.length} stale contracts`);
            setDynamicContracts({});
          }
        }
      } catch {
        // Ignore errors during chain restart detection
      }
    };

    detectChainRestart();
  }, [publicClient, dynamicContracts, setDynamicContracts]);

  const entries = useMemo(() => Object.entries(dynamicContracts), [dynamicContracts]);

  if (entries.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-6 lg:gap-8 mt-6 w-full max-w-7xl px-6 lg:px-10">
      <h2 className="text-2xl font-semibold">Live Contracts (discovered at runtime)</h2>

      {entries.map(([key, c]) => (
        <div key={key} className="bg-base-100 border-base-300 border shadow-md rounded-3xl p-6">
          <div className="mb-4">
            <div className="font-bold">{c.name}</div>
            <Address address={c.address} onlyEnsOrAddress />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* We can reuse the read/write method forms by passing a compatible object */}
            <div className="bg-base-300 rounded-2xl p-4">
              <div className="mb-2 font-semibold">Read</div>
              <ContractReadMethods deployedContractData={{ address: c.address, abi: c.abi } as any} />
            </div>
            <div className="bg-base-300 rounded-2xl p-4">
              <div className="mb-2 font-semibold">Write</div>
              <ContractWriteMethods
                deployedContractData={{ address: c.address, abi: c.abi } as any}
                onChange={() => {}}
              />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
