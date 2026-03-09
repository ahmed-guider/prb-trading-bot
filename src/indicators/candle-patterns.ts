import type { Candle, CandleMetrics } from "../types.js";

/**
 * Compute body, wick, and directionality metrics for a single candle.
 */
export function getCandleMetrics(candle: Candle): CandleMetrics {
  const range = candle.high - candle.low;
  const isBullish = candle.close > candle.open;

  if (range === 0) {
    return {
      bodyPercent: 0,
      upperWickPercent: 0,
      lowerWickPercent: 0,
      isBullish,
      range: 0,
    };
  }

  const body = Math.abs(candle.close - candle.open);
  const upperWick = candle.high - Math.max(candle.open, candle.close);
  const lowerWick = Math.min(candle.open, candle.close) - candle.low;

  return {
    bodyPercent: body / range,
    upperWickPercent: upperWick / range,
    lowerWickPercent: lowerWick / range,
    isBullish,
    range,
  };
}

/**
 * Detect a bullish momentum candle.
 *
 * Criteria:
 *   - Bullish (close > open)
 *   - Body occupies at least `bodyRatio` of the total range
 *   - Upper wick is less than `maxWickRatio` of the total range
 */
export function isMomentumCandle(
  candle: Candle,
  bodyRatio: number = 0.7,
  maxWickRatio: number = 0.15,
): boolean {
  const metrics = getCandleMetrics(candle);

  if (!metrics.isBullish || metrics.range === 0) return false;

  return metrics.bodyPercent >= bodyRatio && metrics.upperWickPercent <= maxWickRatio;
}

/**
 * Detect a breakout candle: a momentum candle that closes above a
 * given resistance level.
 */
export function isBreakoutCandle(
  candle: Candle,
  resistanceLevel: number,
  bodyRatio: number = 0.7,
  maxWickRatio: number = 0.15,
): boolean {
  return (
    isMomentumCandle(candle, bodyRatio, maxWickRatio) &&
    candle.close > resistanceLevel
  );
}
