const ONE_18 = 10n ** 18n;

function toNumberScaled(value: bigint): number {
  return Number(value) / 1e18;
}

function fromNumberScaled(value: number): bigint {
  if (!Number.isFinite(value) || value <= 0) {
    return 0n;
  }
  return BigInt(Math.round(value * 1e18));
}

/**
 * Calculate swap output using the weighted constant product formula.
 * This mirrors the Solidity implementation in LBP.sol.
 *
 * @param reserveIn - current reserve of the input asset (wei)
 * @param reserveOut - current reserve of the output asset (wei)
 * @param weightIn - weight for input asset (basis points)
 * @param weightOut - weight for output asset (basis points)
 * @param amountIn - amount of input after fees (wei)
 */
export function calculateSwapAmount(
  reserveIn: bigint,
  reserveOut: bigint,
  weightIn: bigint,
  weightOut: bigint,
  amountIn: bigint,
): bigint {
  if (amountIn <= 0n || reserveIn <= 0n || reserveOut <= 0n || weightIn <= 0n || weightOut <= 0n) {
    return 0n;
  }

  const newReserveIn = reserveIn + amountIn;
  if (newReserveIn <= 0n) {
    return 0n;
  }

  const ratio = (reserveIn * ONE_18) / newReserveIn;
  const weightRatio = (weightIn * ONE_18) / weightOut;

  const ratioFloat = toNumberScaled(ratio);
  const weightFloat = toNumberScaled(weightRatio);

  if (ratioFloat <= 0 || ratioFloat >= 1 || weightFloat <= 0) {
    return 0n;
  }

  const ratioPowerFloat = Math.pow(ratioFloat, weightFloat);
  const ratioPower = fromNumberScaled(ratioPowerFloat);

  if (ratioPower >= ONE_18) {
    return 0n;
  }

  return (reserveOut * (ONE_18 - ratioPower)) / ONE_18;
}
