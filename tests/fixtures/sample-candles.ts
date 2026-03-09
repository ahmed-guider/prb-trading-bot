import type { Candle } from '../../src/types.js';

/**
 * 60 daily candles showing a clear uptrend.
 * Each day opens slightly above the previous close and closes higher,
 * with higher highs and higher lows throughout.
 */
export function makeUptrendCandles(count: number = 60): Candle[] {
  const candles: Candle[] = [];
  let basePrice = 100;
  const baseTimestamp = Date.now() - count * 86_400_000;

  for (let i = 0; i < count; i++) {
    const open = basePrice + Math.random() * 0.2;
    const close = open + 0.5 + Math.random() * 0.5; // always closes higher
    const high = close + Math.random() * 0.3;
    const low = open - Math.random() * 0.2;

    candles.push({
      timestamp: baseTimestamp + i * 86_400_000,
      open: +open.toFixed(2),
      high: +high.toFixed(2),
      low: +low.toFixed(2),
      close: +close.toFixed(2),
      volume: 1_000_000 + Math.floor(Math.random() * 500_000),
    });

    basePrice = close;
  }

  return candles;
}

/**
 * 60 daily candles showing a clear downtrend.
 * Each day closes lower than it opens with lower highs and lower lows.
 */
export function makeDowntrendCandles(count: number = 60): Candle[] {
  const candles: Candle[] = [];
  let basePrice = 200;
  const baseTimestamp = Date.now() - count * 86_400_000;

  for (let i = 0; i < count; i++) {
    const open = basePrice - Math.random() * 0.2;
    const close = open - 0.5 - Math.random() * 0.5; // always closes lower
    const high = open + Math.random() * 0.3;
    const low = close - Math.random() * 0.2;

    candles.push({
      timestamp: baseTimestamp + i * 86_400_000,
      open: +open.toFixed(2),
      high: +high.toFixed(2),
      low: +low.toFixed(2),
      close: +close.toFixed(2),
      volume: 1_000_000 + Math.floor(Math.random() * 500_000),
    });

    basePrice = close;
  }

  return candles;
}

/**
 * 5-minute candles with a clear resistance level at $150.
 * At least 4 candles have highs that touch $150 +/- 0.2% tolerance.
 */
export function makeResistanceCandles(): Candle[] {
  const candles: Candle[] = [];
  const baseTimestamp = Date.now() - 100 * 5 * 60_000;

  for (let i = 0; i < 100; i++) {
    const ts = baseTimestamp + i * 5 * 60_000;

    // Place resistance touches at candles 20, 40, 60, 80
    if (i === 20 || i === 40 || i === 60 || i === 80) {
      candles.push({
        timestamp: ts,
        open: 148.0,
        high: 150.0 + (Math.random() * 0.2 - 0.1), // ~150 within tight band
        low: 147.5,
        close: 149.5,
        volume: 500_000,
      });
    } else {
      // Normal candles trading below resistance
      const mid = 146 + Math.random() * 3;
      candles.push({
        timestamp: ts,
        open: +(mid - 0.5).toFixed(2),
        high: +(mid + 0.8).toFixed(2),
        low: +(mid - 0.8).toFixed(2),
        close: +(mid + 0.3).toFixed(2),
        volume: 200_000 + Math.floor(Math.random() * 100_000),
      });
    }
  }

  return candles;
}

/**
 * Single bullish momentum candle: big body, small wicks.
 * Body is ~80% of range, upper wick ~5%.
 */
export const momentumCandle: Candle = {
  timestamp: Date.now(),
  open: 100.0,
  high: 110.5,
  low: 99.5,
  close: 110.0, // body = 10, range = 11, body% = 90.9%, upper wick = 0.5/11 = 4.5%
  volume: 2_000_000,
};

/**
 * Doji candle: tiny body relative to range.
 */
export const dojiCandle: Candle = {
  timestamp: Date.now(),
  open: 100.0,
  high: 102.0,
  low: 98.0,
  close: 100.1, // body = 0.1, range = 4, body% = 2.5%
  volume: 500_000,
};

/**
 * Bearish (red) candle.
 */
export const bearishCandle: Candle = {
  timestamp: Date.now(),
  open: 110.0,
  high: 111.0,
  low: 100.0,
  close: 101.0,
  volume: 1_500_000,
};

/**
 * Pre-market candles showing a 5% gap up from previous close of $100.
 */
export function makeGapUpCandles(previousClose: number = 100): Candle[] {
  const gapOpen = previousClose * 1.05; // 5% gap
  const baseTimestamp = Date.now() - 10 * 5 * 60_000;
  const candles: Candle[] = [];

  for (let i = 0; i < 10; i++) {
    const open = gapOpen + i * 0.2;
    candles.push({
      timestamp: baseTimestamp + i * 5 * 60_000,
      open: +open.toFixed(2),
      high: +(open + 0.5).toFixed(2),
      low: +(open - 0.3).toFixed(2),
      close: +(open + 0.3).toFixed(2),
      volume: 300_000 + Math.floor(Math.random() * 200_000),
    });
  }

  return candles;
}

/**
 * Deterministic uptrend candles for EMA verification.
 * Each candle strictly has a higher high and higher low than the previous.
 */
export function makeDeterministicUptrendCandles(count: number): Candle[] {
  const candles: Candle[] = [];
  const baseTimestamp = Date.now() - count * 86_400_000;

  for (let i = 0; i < count; i++) {
    const base = 100 + i * 1;
    candles.push({
      timestamp: baseTimestamp + i * 86_400_000,
      open: base,
      high: base + 1.5,
      low: base - 0.5,
      close: base + 1,
      volume: 1_000_000,
    });
  }

  return candles;
}

/**
 * Sideways / choppy candles for non-trending tests.
 */
export function makeSidewaysCandles(count: number = 60): Candle[] {
  const candles: Candle[] = [];
  const baseTimestamp = Date.now() - count * 86_400_000;

  for (let i = 0; i < count; i++) {
    // Oscillate around 150, alternating up and down
    const direction = i % 2 === 0 ? 1 : -1;
    const base = 150 + direction * (Math.random() * 2);
    candles.push({
      timestamp: baseTimestamp + i * 86_400_000,
      open: +base.toFixed(2),
      high: +(base + 1).toFixed(2),
      low: +(base - 1).toFixed(2),
      close: +(base + direction * 0.5).toFixed(2),
      volume: 1_000_000,
    });
  }

  return candles;
}
