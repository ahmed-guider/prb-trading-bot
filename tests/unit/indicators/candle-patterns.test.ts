import { describe, it, expect } from 'vitest';
import {
  getCandleMetrics,
  isMomentumCandle,
  isBreakoutCandle,
} from '../../../src/indicators/candle-patterns.js';
import type { Candle } from '../../../src/types.js';
import { momentumCandle, dojiCandle, bearishCandle } from '../../fixtures/sample-candles.js';

describe('getCandleMetrics', () => {
  it('computes correct metrics for a bullish candle', () => {
    const candle: Candle = {
      timestamp: Date.now(),
      open: 100,
      high: 112,
      low: 98,
      close: 110,
      volume: 1_000_000,
    };

    const metrics = getCandleMetrics(candle);

    expect(metrics.range).toBe(14); // 112 - 98
    expect(metrics.isBullish).toBe(true);
    expect(metrics.bodyPercent).toBeCloseTo(10 / 14, 5); // body = 110 - 100 = 10
    expect(metrics.upperWickPercent).toBeCloseTo(2 / 14, 5); // 112 - 110 = 2
    expect(metrics.lowerWickPercent).toBeCloseTo(2 / 14, 5); // 100 - 98 = 2
  });

  it('computes correct metrics for a bearish candle', () => {
    const candle: Candle = {
      timestamp: Date.now(),
      open: 110,
      high: 112,
      low: 98,
      close: 100,
      volume: 1_000_000,
    };

    const metrics = getCandleMetrics(candle);

    expect(metrics.isBullish).toBe(false);
    expect(metrics.bodyPercent).toBeCloseTo(10 / 14, 5); // |100 - 110| = 10
    expect(metrics.upperWickPercent).toBeCloseTo(2 / 14, 5); // 112 - max(110,100) = 2
    expect(metrics.lowerWickPercent).toBeCloseTo(2 / 14, 5); // min(110,100) - 98 = 2
  });

  it('handles zero-range candle (open=high=low=close)', () => {
    const candle: Candle = {
      timestamp: Date.now(),
      open: 100,
      high: 100,
      low: 100,
      close: 100,
      volume: 1_000_000,
    };

    const metrics = getCandleMetrics(candle);

    expect(metrics.range).toBe(0);
    expect(metrics.bodyPercent).toBe(0);
    expect(metrics.upperWickPercent).toBe(0);
    expect(metrics.lowerWickPercent).toBe(0);
  });

  it('computes metrics for the momentum candle fixture', () => {
    const metrics = getCandleMetrics(momentumCandle);

    // momentumCandle: open=100, high=110.5, low=99.5, close=110
    // range = 11, body = 10, upper wick = 0.5, lower wick = 0.5
    expect(metrics.range).toBeCloseTo(11, 5);
    expect(metrics.bodyPercent).toBeCloseTo(10 / 11, 3);
    expect(metrics.upperWickPercent).toBeCloseTo(0.5 / 11, 3);
    expect(metrics.isBullish).toBe(true);
  });

  it('computes metrics for the doji candle fixture', () => {
    const metrics = getCandleMetrics(dojiCandle);

    // dojiCandle: open=100, high=102, low=98, close=100.1
    // range = 4, body = 0.1
    expect(metrics.range).toBeCloseTo(4, 5);
    expect(metrics.bodyPercent).toBeCloseTo(0.1 / 4, 3);
  });
});

describe('isMomentumCandle', () => {
  it('returns true for a big green candle (large body, small wick)', () => {
    expect(isMomentumCandle(momentumCandle)).toBe(true);
  });

  it('returns false for a doji (tiny body)', () => {
    expect(isMomentumCandle(dojiCandle)).toBe(false);
  });

  it('returns false for a red (bearish) candle', () => {
    expect(isMomentumCandle(bearishCandle)).toBe(false);
  });

  it('returns false for a zero-range candle', () => {
    const flat: Candle = {
      timestamp: Date.now(),
      open: 100,
      high: 100,
      low: 100,
      close: 100,
      volume: 500_000,
    };
    expect(isMomentumCandle(flat)).toBe(false);
  });

  it('respects custom bodyRatio threshold', () => {
    // momentumCandle body% ≈ 90.9%
    // Require 95% → should fail
    expect(isMomentumCandle(momentumCandle, 0.95, 0.15)).toBe(false);
    // Require 50% → should pass
    expect(isMomentumCandle(momentumCandle, 0.5, 0.15)).toBe(true);
  });

  it('respects custom maxWickRatio threshold', () => {
    // momentumCandle upper wick% ≈ 4.5%
    // Allow max 3% → should fail
    expect(isMomentumCandle(momentumCandle, 0.7, 0.03)).toBe(false);
    // Allow max 10% → should pass
    expect(isMomentumCandle(momentumCandle, 0.7, 0.10)).toBe(true);
  });

  it('returns true for a candle with almost no upper wick', () => {
    const candle: Candle = {
      timestamp: Date.now(),
      open: 100,
      high: 110,
      low: 99,
      close: 110, // close = high, no upper wick
      volume: 1_000_000,
    };
    expect(isMomentumCandle(candle)).toBe(true);
  });
});

describe('isBreakoutCandle', () => {
  it('returns true when momentum candle closes above resistance', () => {
    // momentumCandle closes at 110
    expect(isBreakoutCandle(momentumCandle, 105)).toBe(true);
  });

  it('returns false when momentum candle closes below resistance', () => {
    // momentumCandle closes at 110, resistance at 115
    expect(isBreakoutCandle(momentumCandle, 115)).toBe(false);
  });

  it('returns false when candle is not a momentum candle (doji)', () => {
    // dojiCandle closes at 100.1
    expect(isBreakoutCandle(dojiCandle, 99)).toBe(false);
  });

  it('returns false when candle is bearish even if it closes above resistance', () => {
    // bearishCandle closes at 101
    expect(isBreakoutCandle(bearishCandle, 100)).toBe(false);
  });

  it('returns false when close equals resistance exactly (not above)', () => {
    // momentumCandle closes at 110
    expect(isBreakoutCandle(momentumCandle, 110)).toBe(false);
  });

  it('respects custom body/wick ratio parameters', () => {
    // With very strict requirements, even momentum candle might fail
    expect(isBreakoutCandle(momentumCandle, 105, 0.95, 0.01)).toBe(false);
    // With relaxed requirements, it passes
    expect(isBreakoutCandle(momentumCandle, 105, 0.5, 0.10)).toBe(true);
  });
});
