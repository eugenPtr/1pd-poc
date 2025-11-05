import { and, eq } from "ponder";
import { ponder } from "ponder:registry";
import { swap, userPositionBalance } from "ponder:schema";

// TokensMinted: Track BCT balance when minted (from selling position tokens)
// NOTE: We do NOT create swap entries here to avoid duplicates with LBP swaps
// This listener ONLY updates user BCT balance
ponder.on("LinearBondingCurve:TokensMinted", async ({ event, context }) => {
  const bondingPool = event.log.address;
  const user = event.args.recipient;
  const bctAmount = event.args.bctAmount;

  console.log(`[BondingPoolIndexer] TokensMinted: user ${user.slice(0, 8)}... received ${bctAmount} BCT`);

  // Update user BCT balance (no swap entry)
  const balanceId = `${user}-${bondingPool}`;
  const existing = await context.db.sql
    .select()
    .from(userPositionBalance)
    .where(and(eq(userPositionBalance.user, user), eq(userPositionBalance.lbp, bondingPool)))
    .limit(1);

  const currentBalance = existing.length > 0 ? existing[0].balance : 0n;
  const newBalance = currentBalance + bctAmount;

  await context.db
    .insert(userPositionBalance)
    .values({
      id: balanceId,
      user,
      lbp: bondingPool,
      balance: newBalance,
    })
    .onConflictDoUpdate({
      balance: newBalance,
    });

  console.log(`[BondingPoolIndexer] Updated BCT balance for ${user.slice(0, 8)}...: ${newBalance}`);
});

// TokensBurned: user sells BCT for ETH
ponder.on("LinearBondingCurve:TokensBurned", async ({ event, context }) => {
  const bondingPool = event.log.address;
  const user = event.args.burner;
  const bctAmount = event.args.bctAmount;
  const ethAmount = event.args.ethAmount;
  const blockNumber = BigInt(event.block.number);
  const timestamp = BigInt(event.block.timestamp);
  const transactionHash = event.transaction.hash;

  const swapId = `${transactionHash}-${event.log.logIndex.toString()}`;

  // Insert swap event
  await context.db
    .insert(swap)
    .values({
      id: swapId,
      lbp: bondingPool,
      user,
      buyToken: false,
      amountIn: bctAmount,
      amountOut: ethAmount,
      blockNumber,
      timestamp,
      transactionHash,
    })
    .onConflictDoNothing();

  console.log(`[BondingPoolIndexer] TokensBurned: user ${user.slice(0, 8)}... sold ${bctAmount} BCT`);

  // Update user balance
  const balanceId = `${user}-${bondingPool}`;
  const existing = await context.db.sql
    .select()
    .from(userPositionBalance)
    .where(and(eq(userPositionBalance.user, user), eq(userPositionBalance.lbp, bondingPool)))
    .limit(1);

  const currentBalance = existing.length > 0 ? existing[0].balance : 0n;
  const newBalance = currentBalance - bctAmount;

  await context.db
    .insert(userPositionBalance)
    .values({
      id: balanceId,
      user,
      lbp: bondingPool,
      balance: newBalance,
    })
    .onConflictDoUpdate({
      balance: newBalance,
    });

  console.log(`[BondingPoolIndexer] Updated balance for ${user.slice(0, 8)}...: ${newBalance}`);
});
