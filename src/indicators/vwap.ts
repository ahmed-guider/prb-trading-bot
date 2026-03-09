import type { Candle } from "../types.js";

/**
 * Calculate running VWAP for a series of intraday candles.
 * VWAP = cumulative(typical_price * volume) / cumulative(volume)
 * where typical_price = (high + low + close) / 3
 *
 * Returns array of VWAP values, one per candle.
 */
export function calculateVWAP(candles: Candle[]): number[] {
  if (candles.length === 0) return [];

  const vwap: number[] = new Array(candles.length);
  let cumulativeTPV = 0; // cumulative (typical_price * volume)
  let cumulativeVolume = 0;

  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    const typicalPrice = (c.high + c.low + c.close) / 3;
    cumulativeTPV += typicalPrice * c.volume;
    cumulativeVolume += c.volume;

    vwap[i] = cumulativeVolume > 0 ? cumulativeTPV / cumulativeVolume : typicalPrice;
  }

  return vwap;
}
