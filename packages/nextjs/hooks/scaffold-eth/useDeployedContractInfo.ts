import { useEffect, useMemo, useState } from "react";
import { useSessionStorage } from "usehooks-ts";
import { useIsMounted } from "usehooks-ts";
import { usePublicClient } from "wagmi";
import { useSelectedNetwork } from "~~/hooks/scaffold-eth";
import {
  Contract,
  ContractCodeStatus,
  ContractName,
  UseDeployedContractConfig,
  contracts,
} from "~~/utils/scaffold-eth/contract";

type DeployedContractData<TContractName extends ContractName> = {
  data: Contract<TContractName> | undefined;
  isLoading: boolean;
};

/**
 * Gets the matching contract info for the provided contract name from the contracts present in deployedContracts.ts
 * and externalContracts.ts corresponding to targetNetworks configured in scaffold.config.ts
 */
export function useDeployedContractInfo<TContractName extends ContractName>(
  config: UseDeployedContractConfig<TContractName>,
): DeployedContractData<TContractName>;
/**
 * @deprecated Use object parameter version instead: useDeployedContractInfo({ contractName: "YourContract" })
 */
export function useDeployedContractInfo<TContractName extends ContractName>(
  contractName: TContractName,
): DeployedContractData<TContractName>;

export function useDeployedContractInfo<TContractName extends ContractName>(
  configOrName: UseDeployedContractConfig<TContractName> | TContractName,
): DeployedContractData<TContractName> {
  const isMounted = useIsMounted();

  const finalConfig: UseDeployedContractConfig<TContractName> =
    typeof configOrName === "string" ? { contractName: configOrName } : (configOrName as any);

  useEffect(() => {
    if (typeof configOrName === "string") {
      console.warn(
        "Using `useDeployedContractInfo` with a string parameter is deprecated. Please use the object parameter version instead.",
      );
    }
  }, [configOrName]);
  const { contractName, chainId } = finalConfig;
  const selectedNetwork = useSelectedNetwork(chainId);
  const deployedContract = contracts?.[selectedNetwork.id]?.[contractName as ContractName] as Contract<TContractName>;

  // Also check dynamic contracts discovered at runtime (from session storage)
  const [dynamicRaw] = useSessionStorage<Record<string, { name: string; address: `0x${string}`; abi: readonly any[] }>>(
    "scaffoldEth2.dynamicContracts",
    {},
    { initializeWithValue: false },
  );
  const dynamicContract = useMemo(() => {
    if (!dynamicRaw) return undefined;
    const byName = Object.values(dynamicRaw).find(entry => entry.name === (contractName as unknown as string));
    if (!byName) return undefined;
    return {
      address: byName.address as any,
      abi: byName.abi as any,
    } as Contract<TContractName>;
  }, [dynamicRaw, contractName]);
  const [status, setStatus] = useState<ContractCodeStatus>(ContractCodeStatus.LOADING);
  const publicClient = usePublicClient({ chainId: selectedNetwork.id });

  useEffect(() => {
    const checkContractDeployment = async () => {
      try {
        if (!isMounted() || !publicClient) return;

        const candidate = deployedContract || dynamicContract;
        if (!candidate) {
          setStatus(ContractCodeStatus.NOT_FOUND);
          return;
        }

        const code = await publicClient.getBytecode({
          address: candidate.address,
        });

        // If contract code is `0x` => no contract deployed on that address
        if (code === "0x") {
          setStatus(ContractCodeStatus.NOT_FOUND);
          return;
        }
        setStatus(ContractCodeStatus.DEPLOYED);
      } catch (e) {
        console.error(e);
        setStatus(ContractCodeStatus.NOT_FOUND);
      }
    };

    checkContractDeployment();
  }, [isMounted, contractName, deployedContract, dynamicContract, publicClient]);

  return {
    data: status === ContractCodeStatus.DEPLOYED ? deployedContract || dynamicContract : undefined,
    isLoading: status === ContractCodeStatus.LOADING,
  };
}
