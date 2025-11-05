import { and, eq } from "ponder";
import { ponder } from "ponder:registry";
import { swap, position, userPositionBalance } from "ponder:schema";

const LBP_READ_ABI = [
  {
    type: "function",
    name: "positionTokenAmount",
    inputs: [],
    outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
    stateMutability: "view",
  },
] as const;

ponder.on("LBP:Swap", async ({ event, context }) => {
  const id = `${event.transaction.hash}-${event.log.logIndex.toString()}`;
  const lbp = event.log.address;
  const user = event.args.user;
  const buyToken = event.args.buyToken;
  const amountIn = event.args.amountIn;
  const amountOut = event.args.amountOut;
  const blockNumber = BigInt(event.block.number);
  const timestamp = BigInt(event.block.timestamp);
  const transactionHash = event.transaction.hash;

  // Insert swap event
  await context.db
    .insert(swap)
    .values({
      id,
      lbp,
      user,
      buyToken,
      amountIn,
      amountOut,
      blockNumber,
      timestamp,
      transactionHash,
    })
    .onConflictDoNothing();

  console.log(`[SwapIndexer] Stored swap ${id} for LBP ${lbp.slice(0, 8)}...`);

  // Update position's tokenAmountInPool
  try {
    const currentAmount = await context.client.readContract({
      address: lbp,
      abi: LBP_READ_ABI,
      functionName: "positionTokenAmount",
    });

    await context.db
      .update(position, { lbp })
      .set({ tokenAmountInPool: currentAmount });

    console.log(`[SwapIndexer] Updated tokenAmountInPool for LBP ${lbp.slice(0, 8)}... to ${currentAmount}`);
  } catch (error) {
    console.error(`[SwapIndexer] Failed to update position for LBP ${lbp}:`, error);
  }

  // Update user's position token balance
  const balanceId = `${user}-${lbp}`;
  const tokenAmount = buyToken ? amountOut : amountIn;

  const existing = await context.db.sql
    .select()
    .from(userPositionBalance)
    .where(and(eq(userPositionBalance.user, user), eq(userPositionBalance.lbp, lbp)))
    .limit(1);

  const currentBalance = existing.length > 0 ? existing[0].balance : 0n;
  const newBalance = buyToken ? currentBalance + tokenAmount : currentBalance - tokenAmount;

  await context.db
    .insert(userPositionBalance)
    .values({
      id: balanceId,
      user,
      lbp,
      balance: newBalance,
    })
    .onConflictDoUpdate({
      balance: newBalance,
    });

  console.log(`[SwapIndexer] Updated user balance for ${user.slice(0, 8)}...: ${newBalance}`);
});
