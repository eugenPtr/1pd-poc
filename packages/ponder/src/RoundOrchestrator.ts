import { ponder } from "ponder:registry";
import { round, position, liquidationEvent } from "ponder:schema";

const ERC20_METADATA_ABI = [
  {
    type: "function",
    name: "name",
    inputs: [],
    outputs: [{ name: "", type: "string" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "symbol",
    inputs: [],
    outputs: [{ name: "", type: "string" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "totalSupply",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
] as const;

async function safeReadContract<T>(fn: () => Promise<T>): Promise<T | undefined> {
  try {
    return await fn();
  } catch (error) {
    console.warn("readContract failed", error);
    return undefined;
  }
}

// Index RoundStarted to upsert round data
ponder.on("RoundOrchestrator:RoundStarted", async ({ event, context }) => {
  const id = event.args.roundId as bigint;
  const startTime = event.args.startTime as bigint;
  const duration = event.args.duration as bigint;
  const bondingPool = event.args.bondingPool as `0x${string}`;

  console.log(`Event RoundStarted: roundId=${id}, startTime=${startTime}, duration=${duration}`);

  await context.db
    .insert(round)
    .values({
      id,
      startTime,
      duration,
      endTime: startTime + duration,
      bondingPool,
      settled: false,
    })
    .onConflictDoNothing();

  console.log(`Stored round ${id} in database`);
});

// Index PositionCreated to insert positions keyed by LBP address
ponder.on("RoundOrchestrator:PositionCreated", async ({ event, context }) => {
  const lbpAddress = event.args.lbpAddress as `0x${string}`;
  const roundId = event.args.roundId as bigint;
  const tokenAddress = event.args.tokenAddress as `0x${string}`;

  console.log(`Event PositionCreated: roundId=${roundId}, lbp=${lbpAddress}, token=${tokenAddress}`);

  const [tokenName, tokenSymbol, tokenTotalSupply] = await Promise.all([
    safeReadContract(() =>
      context.client.readContract({
        address: tokenAddress,
        abi: ERC20_METADATA_ABI,
        functionName: "name",
      }) as Promise<string>,
    ),
    safeReadContract(() =>
      context.client.readContract({
        address: tokenAddress,
        abi: ERC20_METADATA_ABI,
        functionName: "symbol",
      }) as Promise<string>,
    ),
    safeReadContract(() =>
      context.client.readContract({
        address: tokenAddress,
        abi: ERC20_METADATA_ABI,
        functionName: "totalSupply",
      }) as Promise<bigint>,
    ),
  ]);

  console.log(`Token metadata: name=${tokenName}, symbol=${tokenSymbol}, totalSupply=${tokenTotalSupply}`);

  await context.db
    .insert(position)
    .values({
      lbp: lbpAddress,
      roundId,
      creator: event.args.creator as `0x${string}`,
      tokenAddress,
      ethAmount: event.args.ethAmount as bigint,
      tokenTotalSupply: tokenTotalSupply ?? 0n,
      tokenAmountInPool: tokenTotalSupply ?? 0n,
      tokenName: tokenName ?? null,
      tokenSymbol: tokenSymbol ?? null,
      imageURI: event.args.imageURI as string,
      createdAt: BigInt(event.block.timestamp),
    })
    .onConflictDoNothing();

  console.log(`Stored position ${lbpAddress} in database`);
});

// Index RoundSettled to mark the round as settled and persist the winner without disturbing other fields
ponder.on("RoundOrchestrator:RoundSettled", async ({ event, context }) => {
  const roundId = event.args.roundId as bigint;
  const winner = event.args.winnerLbp as `0x${string}`;

  console.log(`Event RoundSettled: roundId=${roundId}, winner=${winner}`);

  const existingRound = await context.db.find(round, { id: roundId });

  if (!existingRound) {
    console.warn(`RoundSettled received for unknown round ${roundId.toString()}; skipping update`);
    return;
  }

  await context.db.update(round, { id: roundId }).set({ settled: true, winnerLbp: winner });

  console.log(`Updated round ${roundId} as settled with winner ${winner}`);
});

// Index PositionLiquidated to log liquidations
ponder.on("RoundOrchestrator:PositionLiquidated", async ({ event, context }) => {
  const lbpAddress = event.args.lbpAddress as `0x${string}`;
  const timestamp = BigInt(event.block.timestamp);

  console.log(`Event PositionLiquidated: lbp=${lbpAddress}, timestamp=${timestamp}`);

  await context.db.insert(liquidationEvent).values({
    id: event.log.id,
    lbp: lbpAddress,
    timestamp,
  });

  console.log(`Stored liquidation event for ${lbpAddress}`);
});
