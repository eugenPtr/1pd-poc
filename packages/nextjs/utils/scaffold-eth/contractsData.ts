import { useSessionStorage } from "usehooks-ts";
import { useTargetNetwork } from "~~/hooks/scaffold-eth";
import { GenericContractsDeclaration, contracts } from "~~/utils/scaffold-eth/contract";

const DEFAULT_ALL_CONTRACTS: GenericContractsDeclaration[number] = {};

export function useAllContracts() {
  const { targetNetwork } = useTargetNetwork();
  const contractsData = contracts?.[targetNetwork.id] || DEFAULT_ALL_CONTRACTS;

  // Merge in dynamic contracts discovered at runtime (from session storage)
  // These are written by ContractDeploymentListener under this key
  const storageKey = "scaffoldEth2.dynamicContracts";
  const [dynamicRaw] = useSessionStorage<Record<string, { name: string; address: `0x${string}`; abi: readonly any[] }>>(
    storageKey,
    {},
    { initializeWithValue: false },
  );

  if (!dynamicRaw || Object.keys(dynamicRaw).length === 0) {
    return contractsData;
  }

  // Transform runtime map (keyed by unique ids) into a name-keyed map expected by the debug UI
  const dynamicByName = Object.values(dynamicRaw).reduce<GenericContractsDeclaration[number]>((acc, entry) => {
    acc[entry.name] = {
      address: entry.address as any,
      abi: entry.abi as any,
    } as any;
    return acc;
  }, {});

  // Merge static and dynamic; dynamic names can coexist alongside static ones
  return { ...contractsData, ...dynamicByName };
}
