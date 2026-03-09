import type { Candle, TrendAnalysis } from "../types.js";

/**
 * Calculate Exponential Moving Average for a series of closing prices.
 * Returns an array the same length as `closes`, with NaN for indices
 * before the EMA can be computed (i.e., before `period` data points).
 */
export function calculateEMA(closes: number[], period: number): number[] {
  if (closes.length === 0 || period <= 0) return [];

  const ema: number[] = new Array(closes.length).fill(NaN);
  const multiplier = 2 / (period + 1);

  // Seed EMA with SMA of the first `period` values
  if (closes.length < period) return ema;

  let sum = 0;
  for (let i = 0; i < period; i++) {
    sum += closes[i];
  }
  ema[period - 1] = sum / period;

  for (let i = period; i < closes.length; i++) {
    ema[i] = (closes[i] - ema[i - 1]) * multiplier + ema[i - 1];
  }

  return ema;
}

/**
 * Determine whether candles indicate an uptrend.
 *
 * Uptrend criteria:
 *   1. Fast EMA > Slow EMA (at the most recent bar)
 *   2. Fast EMA slope is positive (linear direction over the last 3 values)
 *   3. Higher highs and higher lows over the last 10 candles (confirmation)
 */
export function isUptrend(
  candles: Candle[],
  fastPeriod: number,
  slowPeriod: number,
): TrendAnalysis {
  const closes = candles.map((c) => c.close);
  const emaFastArr = calculateEMA(closes, fastPeriod);
  const emaSlowArr = calculateEMA(closes, slowPeriod);

  const lastIdx = closes.length - 1;
  const emaFast = emaFastArr[lastIdx];
  const emaSlow = emaSlowArr[lastIdx];

  // Calculate slope from last 3 EMA-fast values
  const slopeWindow = 3;
  let slope = 0;
  if (lastIdx >= slopeWindow - 1) {
    const recent = emaFastArr.slice(lastIdx - (slopeWindow - 1), lastIdx + 1);
    if (recent.every((v) => !Number.isNaN(v))) {
      // Average per-bar change over the window
      slope = (recent[recent.length - 1] - recent[0]) / (slopeWindow - 1);
    }
  }

  // Higher highs & higher lows over last 10 candles
  const confirmWindow = Math.min(10, candles.length);
  const tail = candles.slice(candles.length - confirmWindow);
  let higherHighs = true;
  let higherLows = true;
  for (let i = 1; i < tail.length; i++) {
    if (tail[i].high < tail[i - 1].high) higherHighs = false;
    if (tail[i].low < tail[i - 1].low) higherLows = false;
  }

  const crossoverBullish = !Number.isNaN(emaFast) && !Number.isNaN(emaSlow) && emaFast > emaSlow;
  const slopePositive = slope > 0;
  const structureBullish = higherHighs && higherLows;

  // Uptrend = EMA crossover + positive slope. Structure is optional confirmation
  // (requiring 10 consecutive higher highs/lows is too strict for daily candles).
  return {
    uptrend: crossoverBullish && slopePositive,
    emaFast: Number.isNaN(emaFast) ? 0 : emaFast,
    emaSlow: Number.isNaN(emaSlow) ? 0 : emaSlow,
    slope,
  };
}
