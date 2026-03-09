import { describe, it, expect } from 'vitest';
import { calculateGap, hasRelativeStrength, isValidGap } from '../../../src/indicators/gap.js';

describe('calculateGap', () => {
  it('calculates a 2% gap up correctly', () => {
    const result = calculateGap(100, 102);

    expect(result.gapDollar).toBe(2);
    expect(result.gapPercent).toBeCloseTo(2.0, 10);
  });

  it('calculates a gap down as negative', () => {
    const result = calculateGap(100, 97);

    expect(result.gapDollar).toBe(-3);
    expect(result.gapPercent).toBeCloseTo(-3.0, 10);
  });

  it('returns 0% gap when prices are equal', () => {
    const result = calculateGap(100, 100);

    expect(result.gapDollar).toBe(0);
    expect(result.gapPercent).toBe(0);
  });

  it('handles zero previous close without division error', () => {
    const result = calculateGap(0, 50);

    expect(result.gapPercent).toBe(0);
    expect(result.gapDollar).toBe(50);
  });

  it('calculates fractional gaps correctly', () => {
    const result = calculateGap(200, 203);

    expect(result.gapPercent).toBeCloseTo(1.5, 10);
    expect(result.gapDollar).toBe(3);
  });
});

describe('hasRelativeStrength', () => {
  it('returns true when stock gaps up and SPY is down', () => {
    // stock +3%, SPY -0.5%
    expect(hasRelativeStrength(3, -0.5)).toBe(true);
  });

  it('returns false when stock gaps up but SPY is also up significantly', () => {
    // stock +3%, SPY +2% → SPY >= 0.5, so false
    expect(hasRelativeStrength(3, 2)).toBe(false);
  });

  it('returns true when stock gaps up and SPY is flat (< 0.5%)', () => {
    expect(hasRelativeStrength(2, 0.3)).toBe(true);
    expect(hasRelativeStrength(1, 0.0)).toBe(true);
  });

  it('returns false when stock gaps up and SPY is exactly 0.5%', () => {
    // spyGapPercent < 0.5 required, so 0.5 returns false
    expect(hasRelativeStrength(3, 0.5)).toBe(false);
  });

  it('returns false when stock is down regardless of SPY', () => {
    expect(hasRelativeStrength(-1, -2)).toBe(false);
    expect(hasRelativeStrength(0, -1)).toBe(false);
  });

  it('returns false when stock is exactly 0%', () => {
    expect(hasRelativeStrength(0, -1)).toBe(false);
  });
});

describe('isValidGap', () => {
  it('returns true when gap meets threshold and volume meets minimum', () => {
    expect(isValidGap(3.0, 2.0, 500_000, 100_000)).toBe(true);
  });

  it('returns false when gap is below threshold', () => {
    expect(isValidGap(1.5, 2.0, 500_000, 100_000)).toBe(false);
  });

  it('returns false when volume is below minimum', () => {
    expect(isValidGap(3.0, 2.0, 50_000, 100_000)).toBe(false);
  });

  it('returns false when both gap and volume are below thresholds', () => {
    expect(isValidGap(1.0, 2.0, 50_000, 100_000)).toBe(false);
  });

  it('returns true when gap and volume exactly equal thresholds', () => {
    expect(isValidGap(2.0, 2.0, 100_000, 100_000)).toBe(true);
  });
});
