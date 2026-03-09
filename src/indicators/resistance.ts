import type { Candle, ResistanceLevel } from "../types.js";

/**
 * Find horizontal resistance levels where candle highs cluster within
 * a tolerance band. Levels are scored by touch count weighted toward recency.
 *
 * @param candles  - Array of 5-minute candles
 * @param tolerance - Percentage tolerance for clustering highs (0.002 = 0.2%)
 * @param minTouches - Minimum number of touches to qualify as resistance
 */
export function findResistanceLevels(
  candles: Candle[],
  tolerance: number = 0.002,
  minTouches: number = 3,
): ResistanceLevel[] {
  if (candles.length === 0) return [];

  const highs = candles.map((c) => ({ price: c.high, timestamp: c.timestamp }));
  const used = new Array<boolean>(highs.length).fill(false);
  const levels: ResistanceLevel[] = [];

  // Most recent timestamp for recency weighting
  const latestTimestamp = Math.max(...candles.map((c) => c.timestamp));
  // Full time span for normalising recency (avoid division by zero)
  const timeSpan = latestTimestamp - Math.min(...candles.map((c) => c.timestamp)) || 1;

  // Sort highs descending so we process the most prominent peaks first
  const sortedIndices = highs
    .map((_, i) => i)
    .sort((a, b) => highs[b].price - highs[a].price);

  for (const idx of sortedIndices) {
    if (used[idx]) continue;

    const anchor = highs[idx].price;
    const band = anchor * tolerance;
    const clusterIndices: number[] = [];

    // Gather all highs within the tolerance band of the anchor
    for (let j = 0; j < highs.length; j++) {
      if (used[j]) continue;
      if (Math.abs(highs[j].price - anchor) <= band) {
        clusterIndices.push(j);
      }
    }

    if (clusterIndices.length < minTouches) continue;

    // Mark as consumed
    for (const ci of clusterIndices) {
      used[ci] = true;
    }

    // Average price across the cluster
    const avgPrice =
      clusterIndices.reduce((sum, ci) => sum + highs[ci].price, 0) / clusterIndices.length;

    const lastTouch = Math.max(...clusterIndices.map((ci) => highs[ci].timestamp));

    // Strength = touches * recency weight (0..1, 1 = most recent)
    const recency = (lastTouch - (latestTimestamp - timeSpan)) / timeSpan;
    const strength = clusterIndices.length * recency;

    levels.push({
      price: avgPrice,
      touches: clusterIndices.length,
      lastTouch,
      strength,
    });
  }

  // Sort by strength descending
  levels.sort((a, b) => b.strength - a.strength);

  return levels;
}

/**
 * Find the nearest resistance level ABOVE the current price.
 * Returns null if no resistance exists above.
 */
export function getNearestResistance(
  candles: Candle[],
  currentPrice: number,
  tolerance: number = 0.002,
): ResistanceLevel | null {
  const levels = findResistanceLevels(candles, tolerance);

  const above = levels.filter((l) => l.price > currentPrice);
  if (above.length === 0) return null;

  // Closest above by price distance
  above.sort((a, b) => a.price - b.price);
  return above[0];
}
