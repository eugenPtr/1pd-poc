import { createConfig, factory } from "ponder";
import { http, parseAbiItem } from "viem";
import deployedContracts from "../nextjs/contracts/deployedContracts";
import { KNOWN_ABIS } from "../nextjs/contracts/knownAbis";
import scaffoldConfig from "../nextjs/scaffold.config";

const targetNetwork = scaffoldConfig.targetNetworks[0];
const priceSamplerInterval = Number(process.env.PRICE_SAMPLER_INTERVAL ?? "1");

const networks = {
  [targetNetwork.name]: {
    chainId: targetNetwork.id,
    transport: http(process.env[`PONDER_RPC_URL_${targetNetwork.id}`]),
  },
};

const contractNames = Object.keys(deployedContracts[targetNetwork.id]);

const contracts = Object.fromEntries(contractNames.map((contractName) => {
  return [contractName, {
    network: targetNetwork.name as string,
    abi: deployedContracts[targetNetwork.id][contractName].abi,
    address: deployedContracts[targetNetwork.id][contractName].address,
    startBlock: deployedContracts[targetNetwork.id][contractName].deployedOnBlock || 0,
  }];
}));

// Add LBP contract with factory pattern for dynamic discovery
contracts.LBP = {
  network: targetNetwork.name as string,
  abi: KNOWN_ABIS.LBP,
  address: factory({
    address: deployedContracts[targetNetwork.id].RoundOrchestrator.address,
    event: parseAbiItem("event PositionCreated(uint256 indexed roundId, address indexed lbpAddress, address indexed creator, address tokenAddress, uint256 ethAmount, uint256 tokenSupply, string name, string symbol, string imageURI)"),
    parameter: "lbpAddress",
  }),
  startBlock: deployedContracts[targetNetwork.id].RoundOrchestrator.deployedOnBlock || 0,
};

// Add LinearBondingCurve contract with factory pattern for bonding pool discovery
contracts.LinearBondingCurve = {
  network: targetNetwork.name as string,
  abi: KNOWN_ABIS.LinearBondingCurve,
  address: factory({
    address: deployedContracts[targetNetwork.id].RoundOrchestrator.address,
    event: parseAbiItem("event RoundStarted(uint256 indexed roundId, uint256 startTime, uint256 duration, address indexed bondingPool)"),
    parameter: "bondingPool",
  }),
  startBlock: deployedContracts[targetNetwork.id].RoundOrchestrator.deployedOnBlock || 0,
};

const blocks = {
  priceSampler: {
    network: targetNetwork.name as string,
    interval: Number.isFinite(priceSamplerInterval) && priceSamplerInterval > 0 ? priceSamplerInterval : 1,
  },
};

export default createConfig({
  networks: networks,
  contracts: contracts,
  blocks: blocks,
});
