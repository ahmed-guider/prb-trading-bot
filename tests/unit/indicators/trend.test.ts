import { describe, it, expect } from 'vitest';
import { calculateEMA, isUptrend } from '../../../src/indicators/trend.js';
import {
  makeDeterministicUptrendCandles,
  makeDowntrendCandles,
  makeSidewaysCandles,
} from '../../fixtures/sample-candles.js';

describe('calculateEMA', () => {
  it('returns empty array for empty input', () => {
    expect(calculateEMA([], 10)).toEqual([]);
  });

  it('returns empty array for period <= 0', () => {
    expect(calculateEMA([1, 2, 3], 0)).toEqual([]);
    expect(calculateEMA([1, 2, 3], -1)).toEqual([]);
  });

  it('returns all NaN when there are fewer data points than the period', () => {
    const result = calculateEMA([10, 20], 5);
    expect(result).toHaveLength(2);
    expect(result.every((v) => Number.isNaN(v))).toBe(true);
  });

  it('seeds with SMA of the first `period` values', () => {
    // period=3, first 3 values: 10, 20, 30 → SMA = 20
    const result = calculateEMA([10, 20, 30, 40, 50], 3);
    expect(result[0]).toBeNaN();
    expect(result[1]).toBeNaN();
    expect(result[2]).toBe(20); // SMA of first 3
  });

  it('computes correct EMA values against manual calculation', () => {
    const closes = [10, 20, 30, 40, 50];
    const period = 3;
    const multiplier = 2 / (period + 1); // 0.5

    const result = calculateEMA(closes, period);

    // ema[2] = SMA(10,20,30) = 20
    expect(result[2]).toBe(20);

    // ema[3] = (40 - 20) * 0.5 + 20 = 30
    expect(result[3]).toBeCloseTo(30, 10);

    // ema[4] = (50 - 30) * 0.5 + 30 = 40
    expect(result[4]).toBeCloseTo(40, 10);
  });

  it('handles flat prices (all same value)', () => {
    const closes = [50, 50, 50, 50, 50];
    const result = calculateEMA(closes, 3);
    // SMA of 50,50,50 = 50; EMA stays at 50 for flat input
    expect(result[2]).toBe(50);
    expect(result[3]).toBeCloseTo(50, 10);
    expect(result[4]).toBeCloseTo(50, 10);
  });

  it('returns array same length as input', () => {
    const closes = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const result = calculateEMA(closes, 5);
    expect(result).toHaveLength(10);
  });

  it('has NaN for indices before period - 1', () => {
    const result = calculateEMA([1, 2, 3, 4, 5, 6], 4);
    expect(result[0]).toBeNaN();
    expect(result[1]).toBeNaN();
    expect(result[2]).toBeNaN();
    expect(result[3]).not.toBeNaN(); // SMA seed at index 3
  });
});

describe('isUptrend', () => {
  it('detects a clear uptrend with deterministic ascending prices', () => {
    // Deterministic candles with strictly higher highs and higher lows
    const candles = makeDeterministicUptrendCandles(60);
    const result = isUptrend(candles, 9, 21);

    expect(result.uptrend).toBe(true);
    expect(result.emaFast).toBeGreaterThan(result.emaSlow);
    expect(result.slope).toBeGreaterThan(0);
  });

  it('detects a clear downtrend as NOT uptrend', () => {
    const candles = makeDowntrendCandles(60);
    const result = isUptrend(candles, 9, 21);

    expect(result.uptrend).toBe(false);
    // In a downtrend, fast EMA should be below slow EMA
    expect(result.emaFast).toBeLessThan(result.emaSlow);
  });

  it('detects sideways/choppy as NOT uptrend', () => {
    const candles = makeSidewaysCandles(60);
    const result = isUptrend(candles, 9, 21);

    // Sideways markets lack the higher-highs/higher-lows structure
    expect(result.uptrend).toBe(false);
  });

  it('handles insufficient data points (fewer than slow period)', () => {
    const candles = makeDeterministicUptrendCandles(5);
    const result = isUptrend(candles, 9, 21);

    // Not enough data for slow EMA → emaSlow should be 0
    expect(result.emaSlow).toBe(0);
    expect(result.uptrend).toBe(false);
  });

  it('returns zero EMAs when data is shorter than fast period', () => {
    const candles = makeDeterministicUptrendCandles(3);
    const result = isUptrend(candles, 9, 21);

    expect(result.emaFast).toBe(0);
    expect(result.emaSlow).toBe(0);
    expect(result.uptrend).toBe(false);
  });

  it('returns slope of 0 when EMA values are all NaN in the slope window', () => {
    // Only 5 candles, fast period = 5 → only one non-NaN EMA value
    // Slope window needs 3 non-NaN values
    const candles = makeDeterministicUptrendCandles(5);
    const result = isUptrend(candles, 5, 21);

    // Only index 4 has a valid EMA fast → slope window has NaNs
    expect(result.slope).toBe(0);
  });
});
