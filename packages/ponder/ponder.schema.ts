import { onchainTable } from "ponder";



// RoundOrchestrator data
export const round = onchainTable("round", (t) => ({
  id: t.bigint().primaryKey(),
  startTime: t.bigint().notNull(),
  duration: t.bigint().notNull(),
  endTime: t.bigint().notNull(),
  bondingPool: t.hex().notNull(),
  settled: t.boolean().notNull(),
  winnerLbp: t.hex(),
}));

export const position = onchainTable("position", (t) => ({
  lbp: t.hex().primaryKey(),
  roundId: t.bigint().notNull(),
  creator: t.hex().notNull(),
  tokenAddress: t.hex().notNull(),
  ethAmount: t.bigint().notNull(),
  tokenTotalSupply: t.bigint().notNull(),
  tokenAmountInPool: t.bigint().notNull(),
  tokenName: t.text(),
  tokenSymbol: t.text(),
  imageURI: t.text().notNull(),
  createdAt: t.bigint().notNull(),
}));

export const liquidationEvent = onchainTable("liquidation_event", (t) => ({
  id: t.text().primaryKey(),
  lbp: t.hex().notNull(),
  timestamp: t.bigint().notNull(),
}));

export const price = onchainTable("price", (t) => ({
  id: t.text().primaryKey(),
  lbp: t.hex().notNull(),
  value: t.bigint().notNull(),
  timestamp: t.bigint().notNull(),
}));

export const bondingPoolPrice = onchainTable("bonding_pool_price", (t) => ({
  id: t.text().primaryKey(),
  roundId: t.bigint().notNull(),
  bondingPool: t.hex().notNull(),
  value: t.bigint().notNull(),
  timestamp: t.bigint().notNull(),
  blockNumber: t.bigint().notNull(),
}));

export const swap = onchainTable("swap", (t) => ({
  id: t.text().primaryKey(),
  lbp: t.hex().notNull(),
  user: t.hex().notNull(),
  buyToken: t.boolean().notNull(),
  amountIn: t.bigint().notNull(),
  amountOut: t.bigint().notNull(),
  blockNumber: t.bigint().notNull(),
  timestamp: t.bigint().notNull(),
  transactionHash: t.hex().notNull(),
}));

export const userPositionBalance = onchainTable("user_position_balance", (t) => ({
  id: t.text().primaryKey(),
  user: t.hex().notNull(),
  lbp: t.hex().notNull(),
  balance: t.bigint().notNull(),
}));

export const poolState = onchainTable("pool_state", (t) => ({
  lbp: t.hex().primaryKey(),
  tokenReserve: t.bigint().notNull(),
  ethReserve: t.bigint().notNull(),
  weightToken: t.bigint().notNull(),
  weightEth: t.bigint().notNull(),
  priceWei: t.bigint().notNull(),
  lastUpdated: t.bigint().notNull(),
}));
