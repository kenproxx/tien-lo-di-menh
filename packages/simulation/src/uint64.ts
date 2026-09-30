export const U64_MAX = 18446744073709551615n;
export function parseU64(value: string): bigint {
  if (!/^(0|[1-9][0-9]*)$/.test(value) || value.length > 20)
    throw new Error("INVALID_UINT64");
  const n = BigInt(value);
  if (n > U64_MAX) throw new Error("UINT64_OVERFLOW");
  return n;
}
export function clampU64(value: bigint): bigint {
  return value < 0n ? 0n : value > U64_MAX ? U64_MAX : value;
}
export function mulRatio(
  value: bigint,
  n: bigint,
  d: bigint,
  rounding: "floor" | "ceil",
): bigint {
  if (d <= 0n || value < 0n || n < 0n) throw new Error("INVALID_RATIO");
  return clampU64((value * n + (rounding === "ceil" ? d - 1n : 0n)) / d);
}
export const capReduction = (bps: number) =>
  Math.min(9900, Math.max(0, Math.trunc(bps)));
export const adjustCost = (base: bigint, reduction: number) =>
  base === 0n
    ? 0n
    : mulRatio(base, BigInt(10000 - capReduction(reduction)), 10000n, "ceil");
export const durationTicks = (base: number, increase: number) =>
  base === 0
    ? 0
    : Math.max(1, Math.ceil((base * 10000) / (10000 + Math.max(0, increase))));
