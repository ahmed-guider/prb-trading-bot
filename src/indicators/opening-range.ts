import type { Candle } from "../types.js";

export interface OpeningRange {
  high: number;
  low: number;
  width: number;         // high - low
  widthPercent: number;  // width / midpoint * 100
  midpoint: number;
  totalVolume: number;   // sum of volume in the OR period
  avgVolume: number;     // average volume per candle in OR
  candleCount: number;
}

/**
 * Calculate the opening range from 5-min candles.
 * @param candles - 5-min candles for the trading day (should start at market open 9:30 AM ET)
 * @param periodMinutes - Opening range period in minutes (default 15 = first 3 candles)
 */
export function calculateOpeningRange(candles: Candle[], periodMinutes: number = 15): OpeningRange | null {
  const candlesNeeded = Math.floor(periodMinutes / 5);
  if (candlesNeeded <= 0 || candles.length < candlesNeeded) {
    return null;
  }

  const orCandles = candles.slice(0, candlesNeeded);

  let high = -Infinity;
  let low = Infinity;
  let totalVolume = 0;

  for (const c of orCandles) {
    if (c.high > high) high = c.high;
    if (c.low < low) low = c.low;
    totalVolume += c.volume;
  }

  const width = high - low;
  const midpoint = (high + low) / 2;
  const widthPercent = midpoint > 0 ? (width / midpoint) * 100 : 0;
  const avgVolume = totalVolume / orCandles.length;

  return {
    high,
    low,
    width,
    widthPercent,
    midpoint,
    totalVolume,
    avgVolume,
    candleCount: orCandles.length,
  };
}

/**
 * Check if opening range width is within acceptable bounds.
 * Too narrow = noise/chop, too wide = too much risk.
 */
export function isValidOpeningRange(or: OpeningRange, minWidthPct: number = 0.3, maxWidthPct: number = 1.5): boolean {
  return or.widthPercent >= minWidthPct && or.widthPercent <= maxWidthPct;
}

/**
 * Detect a breakout from the opening range.
 * Returns 'long' if candle closes above OR high, 'short' if below OR low, null if inside.
 * Also requires the breakout candle to have strong body (> bodyRatio of its range)
 * and volume above average.
 */
export function detectBreakout(
  candle: Candle,
  openingRange: OpeningRange,
  bodyRatio: number = 0.5,
  volumeMultiplier: number = 1.0,
): 'long' | 'short' | null {
  const range = candle.high - candle.low;
  if (range === 0) return null;

  const body = Math.abs(candle.close - candle.open);
  const bodyPct = body / range;

  // Body must be strong enough
  if (bodyPct < bodyRatio) return null;

  // Volume must exceed the OR average volume * multiplier
  if (candle.volume < openingRange.avgVolume * volumeMultiplier) return null;

  // Check for long breakout: close above OR high with bullish candle
  if (candle.close > openingRange.high && candle.close > candle.open) {
    return 'long';
  }

  // Check for short breakdown: close below OR low with bearish candle
  if (candle.close < openingRange.low && candle.close < candle.open) {
    return 'short';
  }

  return null;
}
