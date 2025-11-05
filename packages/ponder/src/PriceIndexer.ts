import { desc, eq } from "ponder";
import { ponder } from "ponder:registry";
import { bondingPoolPrice, poolState, position, price, round, swap } from "ponder:schema";

const LBP_PRICE_ABI = [
  {
    type: "function",
    name: "getCurrentPrice",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
] as const;

const LBP_READ_TOKEN_AMOUNT_ABI = [
  {
    type: "function",
    name: "positionTokenAmount",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
] as const;

const LBP_POOL_STATE_ABI = [
  {
    type: "function",
    name: "getPoolState",
    inputs: [],
    outputs: [
      { name: "tokenReserve", type: "uint256" },
      { name: "ethReserve", type: "uint256" },
      { name: "weightToken", type: "uint256" },
      { name: "weightEth", type: "uint256" },
      { name: "priceWei", type: "uint256" },
    ],
    stateMutability: "view",
  },
] as const;

const LBP_SWAP_EVENT_ABI = [
  {
    type: "event",
    name: "Swap",
    inputs: [
      { name: "user", type: "address", indexed: true },
      { name: "buyToken", type: "bool", indexed: false },
      { name: "amountIn", type: "uint256", indexed: false },
      { name: "amountOut", type: "uint256", indexed: false },
    ],
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

ponder.on("priceSampler:block", async ({ event, context }) => {
  console.log("[PriceIndexer] Indexing prices for block", event.block.number);
  const { block } = event;

  const latestRound = await context.db.sql
    .select()
    .from(round)
    .orderBy(desc(round.id))
    .limit(1);

  if (latestRound.length === 0) {
    console.log("[PriceIndexer] No round started yet, skipping price indexing");
    return;
  }

  const currentRound = latestRound[0];
  if (!currentRound?.id) {
    console.error("[PriceIndexer] Latest round has no ID");
    return;
  }

  const roundId = currentRound.id;

  const lbps = await context.db.sql
    .select({ lbp: position.lbp })
    .from(position)
    .where(eq(position.roundId, roundId));

  if (lbps.length === 0) {
    console.log("[PriceIndexer] No positions found for round", roundId);
    return;
  }

  const blockNumber = BigInt(block.number);
  const timestamp = BigInt(block.timestamp);

  const bondingPoolAddress = currentRound.bondingPool as `0x${string}`;

  if (bondingPoolAddress) {
    console.log(`[PriceIndexer] Fetching bonding pool price for ${bondingPoolAddress.slice(0, 8)}...`);
    const bondingPoolValue = await safeReadContract(() =>
      context.client.readContract({
        address: bondingPoolAddress,
        abi: LBP_PRICE_ABI,
        functionName: "getCurrentPrice",
      }) as Promise<bigint>,
    );

    if (bondingPoolValue !== undefined) {
      const bondingPoolId = `${bondingPoolAddress}-${blockNumber.toString()}`;
      await context.db
        .insert(bondingPoolPrice)
        .values({
          id: bondingPoolId,
          roundId,
          bondingPool: bondingPoolAddress,
          value: bondingPoolValue,
          timestamp,
          blockNumber,
        })
        .onConflictDoNothing();

      console.log(
        `[PriceIndexer] Stored bonding pool price: round ${roundId}, pool ${bondingPoolAddress.slice(
          0,
          8,
        )}..., value ${bondingPoolValue}, timestamp ${timestamp}`,
      );
    } else {
      console.warn(`[PriceIndexer] Failed to read bonding pool price for ${bondingPoolAddress}`);
    }
  } else {
    console.warn("[PriceIndexer] Latest round missing bonding pool address");
  }

  for (const { lbp } of lbps) {
    console.log(`[PriceIndexer] Fetching price for LBP ${lbp.slice(0, 8)}`);
    const priceValue = await safeReadContract(() =>
      context.client.readContract({
        address: lbp,
        abi: LBP_PRICE_ABI,
        functionName: "getCurrentPrice",
      }) as Promise<bigint>,
    );

    if (priceValue === undefined) {
      console.warn(`[PriceIndexer] Failed to read price for LBP ${lbp}`);
      continue;
    }

    const id = `${lbp}-${blockNumber.toString()}`;

    await context.db
      .insert(price)
      .values({
        id,
        lbp,
        value: priceValue,
        timestamp,
      })
      .onConflictDoNothing();

    console.log(`[PriceIndexer] Stored price: LBP ${lbp.slice(0, 8)}..., value ${priceValue}, timestamp ${timestamp}`);

    // Cache pool state after storing price
    const poolStateData = await safeReadContract(() =>
      context.client.readContract({
        address: lbp,
        abi: LBP_POOL_STATE_ABI,
        functionName: "getPoolState",
      }) as Promise<readonly [bigint, bigint, bigint, bigint, bigint]>,
    );

    if (poolStateData) {
      const [tokenReserve, ethReserve, weightToken, weightEth, priceWei] = poolStateData;
      await context.db
        .insert(poolState)
        .values({
          lbp,
          tokenReserve,
          ethReserve,
          weightToken,
          weightEth,
          priceWei,
          lastUpdated: timestamp,
        })
        .onConflictDoUpdate({
          tokenReserve,
          ethReserve,
          weightToken,
          weightEth,
          priceWei,
          lastUpdated: timestamp,
        });

      console.log(
        `[PriceIndexer] Cached pool state: LBP ${lbp.slice(0, 8)}..., reserves [${tokenReserve}, ${ethReserve}], weights [${weightToken}, ${weightEth}]`,
      );
    } else {
      console.warn(`[PriceIndexer] Failed to read pool state for LBP ${lbp}`);
    }
  }
});
