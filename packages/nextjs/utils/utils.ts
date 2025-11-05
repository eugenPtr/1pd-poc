import { isAddress } from "viem";
import { ZERO_ADDRESS, isZeroAddress } from "~~/utils/scaffold-eth/common";

const timestampFormatter = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "short",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
  timeZone: "UTC",
});

// Formats a Unix timestamp (seconds) into a deterministic UTC datetime string
export function formatTimestamp(seconds?: string): string {
  if (!seconds) return "-";
  const n = Number(seconds);
  if (!Number.isFinite(n)) return seconds;
  return `${timestampFormatter.format(new Date(n * 1000))} UTC`;
}

// Returns true when the value looks like a usable EVM address (and not zero/placeholder)
export function isUsableAddress(addr?: string | null): addr is `0x${string}` {
  if (!addr) return false;
  if (addr === "0x") return false;
  if (isZeroAddress(addr)) return false;
  return isAddress(addr as `0x${string}`);
}

// Lightweight short formatter when you don't want to render the Address component
export function formatAddressShort(addr?: string | null, chars = { start: 6, end: 4 }): string {
  if (!isUsableAddress(addr)) return "-";
  const s = addr as string;
  return `${s.slice(0, chars.start)}...${s.slice(-chars.end)}`;
}

export const ADDR_ZERO = ZERO_ADDRESS;
