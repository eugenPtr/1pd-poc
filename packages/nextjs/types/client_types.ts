export type PositionSummary = {
  lbpAddress: `0x${string}`;
  tokenAddress: `0x${string}`;
  name: string;
  symbol: string;
  totalSupply: bigint;
  tokenAmountInPool: bigint;
  ownedSupply: bigint;
  percentage: number;
  imageURI: string;
};

export type PricePoint = {
  timestamp: number;
  price: number;
  priceWei: bigint;
};

export type PriceSeries = {
  lbpAddress: `0x${string}`;
  points: PricePoint[];
  latestPrice: number | null;
  latestPriceWei: bigint | null;
};

export type PricesByLbp = Record<`0x${string}`, PricePoint[]>;

export type BondingPoolPriceSeries = {
  bondingPool: `0x${string}`;
  points: PricePoint[];
  latestPrice: number | null;
  latestPriceWei: bigint | null;
};

export type LatestPriceByLbp = Record<
  `0x${string}`,
  {
    price: number | null;
    priceWei: bigint | null;
  }
>;

export type SwapEvent = {
  id: string;
  lbp: `0x${string}`;
  user: `0x${string}`;
  buyToken: boolean;
  amountIn: bigint;
  amountOut: bigint;
  blockNumber: bigint;
  timestamp: bigint;
  transactionHash: `0x${string}`;
};

export type UserBalance = {
  lbp: `0x${string}`;
  symbol: string;
  imageURI?: string;
  balance: bigint;
};

export type PoolState = {
  lbp: `0x${string}`;
  tokenReserve: bigint;
  ethReserve: bigint;
  weightToken: bigint;
  weightEth: bigint;
  priceWei: bigint;
  lastUpdated: bigint;
};

export type PoolStateByLbp = Record<`0x${string}`, PoolState>;
