import { describe, it, expect } from 'vitest';
import { findResistanceLevels, getNearestResistance } from '../../../src/indicators/resistance.js';
import type { Candle } from '../../../src/types.js';
import { makeResistanceCandles } from '../../fixtures/sample-candles.js';

/**
 * Helper: create candles where multiple highs cluster at a given price.
 */
function makeCandlesWithHighsAt(
  prices: { high: number; timestamp: number }[],
): Candle[] {
  return prices.map((p) => ({
    timestamp: p.timestamp,
    open: p.high - 2,
    high: p.high,
    low: p.high - 3,
    close: p.high - 1,
    volume: 100_000,
  }));
}

describe('findResistanceLevels', () => {
  it('returns empty array for empty candles', () => {
    expect(findResistanceLevels([])).toEqual([]);
  });

  it('detects resistance when multiple highs cluster at the same level', () => {
    const candles = makeCandlesWithHighsAt([
      { high: 150.0, timestamp: 1000 },
      { high: 150.1, timestamp: 2000 },
      { high: 149.9, timestamp: 3000 },
      { high: 150.05, timestamp: 4000 },
      { high: 130.0, timestamp: 5000 }, // unrelated
    ]);

    // tolerance = 0.002 → 150 * 0.002 = 0.3 band
    const levels = findResistanceLevels(candles, 0.002, 3);

    expect(levels.length).toBeGreaterThanOrEqual(1);
    // The detected level should be near $150
    expect(levels[0].price).toBeCloseTo(150, 0);
    expect(levels[0].touches).toBeGreaterThanOrEqual(3);
  });

  it('returns no levels when highs are spread out (no clustering)', () => {
    const candles = makeCandlesWithHighsAt([
      { high: 100, timestamp: 1000 },
      { high: 120, timestamp: 2000 },
      { high: 140, timestamp: 3000 },
      { high: 160, timestamp: 4000 },
      { high: 180, timestamp: 5000 },
    ]);

    // Very tight tolerance, nothing should cluster
    const levels = findResistanceLevels(candles, 0.001, 3);
    expect(levels).toEqual([]);
  });

  it('finds multiple resistance levels sorted by strength', () => {
    // Two clusters: one at ~200 (4 touches, more recent) and one at ~150 (3 touches, older)
    const candles = makeCandlesWithHighsAt([
      // Cluster at ~150 (older)
      { high: 150.0, timestamp: 1000 },
      { high: 150.1, timestamp: 2000 },
      { high: 149.95, timestamp: 3000 },
      // Cluster at ~200 (newer, more touches)
      { high: 200.0, timestamp: 4000 },
      { high: 200.1, timestamp: 5000 },
      { high: 199.9, timestamp: 6000 },
      { high: 200.05, timestamp: 7000 },
    ]);

    const levels = findResistanceLevels(candles, 0.002, 3);

    expect(levels.length).toBe(2);
    // Sorted by strength descending → the one with more touches and recency first
    expect(levels[0].touches).toBeGreaterThanOrEqual(levels[1].touches);
  });

  it('respects minTouches parameter', () => {
    const candles = makeCandlesWithHighsAt([
      { high: 150.0, timestamp: 1000 },
      { high: 150.1, timestamp: 2000 },
      // only 2 touches
    ]);

    const withMin2 = findResistanceLevels(candles, 0.002, 2);
    const withMin3 = findResistanceLevels(candles, 0.002, 3);

    expect(withMin2.length).toBe(1);
    expect(withMin3.length).toBe(0);
  });

  it('respects tolerance parameter — tighter tolerance excludes more', () => {
    const candles = makeCandlesWithHighsAt([
      { high: 150.0, timestamp: 1000 },
      { high: 150.5, timestamp: 2000 }, // 0.33% away
      { high: 150.2, timestamp: 3000 }, // 0.13% away
    ]);

    // Tolerance 0.005 (0.5%) → all cluster together
    const loose = findResistanceLevels(candles, 0.005, 3);
    expect(loose.length).toBe(1);

    // Tolerance 0.001 (0.1%) → 150.5 is too far from 150.0
    const tight = findResistanceLevels(candles, 0.001, 3);
    expect(tight.length).toBe(0);
  });

  it('works with realistic fixture data', () => {
    const candles = makeResistanceCandles();
    const levels = findResistanceLevels(candles, 0.002, 3);

    // Should detect at least one level near $150
    expect(levels.length).toBeGreaterThanOrEqual(1);
    const near150 = levels.find(
      (l) => Math.abs(l.price - 150) < 1,
    );
    expect(near150).toBeDefined();
  });
});

describe('getNearestResistance', () => {
  it('returns the nearest resistance level ABOVE current price', () => {
    const candles = makeCandlesWithHighsAt([
      { high: 150.0, timestamp: 1000 },
      { high: 150.1, timestamp: 2000 },
      { high: 149.9, timestamp: 3000 },
      { high: 200.0, timestamp: 4000 },
      { high: 200.1, timestamp: 5000 },
      { high: 199.9, timestamp: 6000 },
    ]);

    const result = getNearestResistance(candles, 140, 0.002);

    expect(result).not.toBeNull();
    // Should return the level closest to and above 140 → ~150
    expect(result!.price).toBeCloseTo(150, 0);
  });

  it('returns null when no resistance exists above current price', () => {
    const candles = makeCandlesWithHighsAt([
      { high: 100.0, timestamp: 1000 },
      { high: 100.1, timestamp: 2000 },
      { high: 99.9, timestamp: 3000 },
    ]);

    // Current price is above all resistance levels
    const result = getNearestResistance(candles, 200, 0.002);
    expect(result).toBeNull();
  });

  it('returns null for empty candles', () => {
    const result = getNearestResistance([], 100, 0.002);
    expect(result).toBeNull();
  });

  it('skips resistance levels below current price', () => {
    const candles = makeCandlesWithHighsAt([
      // Cluster at ~100
      { high: 100.0, timestamp: 1000 },
      { high: 100.1, timestamp: 2000 },
      { high: 99.9, timestamp: 3000 },
      // Cluster at ~200
      { high: 200.0, timestamp: 4000 },
      { high: 200.1, timestamp: 5000 },
      { high: 199.9, timestamp: 6000 },
    ]);

    // Price at 150 → should skip ~100, return ~200
    const result = getNearestResistance(candles, 150, 0.002);

    expect(result).not.toBeNull();
    expect(result!.price).toBeGreaterThan(150);
    expect(result!.price).toBeCloseTo(200, 0);
  });
});
