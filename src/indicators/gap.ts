import type { GapAnalysis } from "../types.js";

/**
 * Calculate the pre-market gap between the previous session close
 * and the pre-market high.
 */
export function calculateGap(previousClose: number, premarketHigh: number): GapAnalysis {
  const gapDollar = premarketHigh - previousClose;
  const gapPercent = previousClose !== 0 ? (gapDollar / previousClose) * 100 : 0;

  return { gapPercent, gapDollar };
}

/**
 * Determine whether a stock shows relative strength vs. SPY.
 *
 * Relative strength = stock gap is at least 1.5% more than SPY gap,
 * OR SPY is flat/down while the stock gaps up.
 */
export function hasRelativeStrength(
  stockGapPercent: number,
  spyGapPercent: number,
): boolean {
  // Stock must be gapping up
  if (stockGapPercent <= 0) return false;
  // Either SPY is flat/down, or the stock significantly outperforms SPY
  return spyGapPercent < 0.5 || (stockGapPercent - spyGapPercent) >= 1.5;
}

/**
 * Validate that a gap is actionable: gap exceeds the percentage threshold
 * AND pre-market volume meets the minimum requirement.
 */
export function isValidGap(
  gapPercent: number,
  threshold: number,
  volume: number,
  minVolume: number,
): boolean {
  return gapPercent >= threshold && volume >= minVolume;
}
