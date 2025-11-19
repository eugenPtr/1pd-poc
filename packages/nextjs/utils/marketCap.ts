/**
 * Format market cap value with K/M/B suffix
 * @param value - Market cap value in ETH
 * @returns Formatted string like "$34.13K", "$1.25M", "$5.67B"
 */
export function formatMarketCap(value: number): string {
  if (!Number.isFinite(value) || value < 0) return "$0.00";

  const absValue = Math.abs(value);

  if (absValue >= 1_000_000_000) {
    return `$${(value / 1_000_000_000).toFixed(2)}B`;
  } else if (absValue >= 1_000_000) {
    return `$${(value / 1_000_000).toFixed(2)}M`;
  } else if (absValue >= 1_000) {
    return `$${(value / 1_000).toFixed(2)}K`;
  } else {
    return `$${value.toFixed(2)}`;
  }
}

/**
 * Calculate color for current market cap based on its position
 * between liquidation and initial market cap
 *
 * Formula: (current - liquidation) / (initial - liquidation) × 100
 *
 * Color mapping:
 * - 80-100%: Green (#10b981)
 * - 50-80%: Yellow (#eab308)
 * - 20-50%: Orange (#f97316)
 * - 0-20%: Red (#ef4444)
 *
 * @param currentMcap - Current market cap in ETH
 * @param liquidationMcap - Liquidation market cap in ETH
 * @param initialMcap - Initial market cap in ETH
 * @returns Tailwind color class
 */
export function getMarketCapColor(currentMcap: number, liquidationMcap: number, initialMcap: number): string {
  // Handle edge cases
  if (!Number.isFinite(currentMcap) || !Number.isFinite(liquidationMcap) || !Number.isFinite(initialMcap)) {
    return "text-base-content";
  }

  if (initialMcap <= liquidationMcap) {
    // If initial <= liquidation, something is wrong, use neutral color
    return "text-base-content";
  }

  if (currentMcap <= liquidationMcap) {
    // At or below liquidation threshold
    return "text-red-500";
  }

  if (currentMcap >= initialMcap) {
    // At or above initial price
    return "text-green-500";
  }

  // Calculate percentage: (current - liquidation) / (initial - liquidation) × 100
  const range = initialMcap - liquidationMcap;
  const position = currentMcap - liquidationMcap;
  const percentage = (position / range) * 100;

  if (percentage >= 80) {
    return "text-green-500"; // #10b981
  } else if (percentage >= 50) {
    return "text-yellow-500"; // #eab308
  } else if (percentage >= 20) {
    return "text-orange-500"; // #f97316
  } else {
    return "text-red-500"; // #ef4444
  }
}
