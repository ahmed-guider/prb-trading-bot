import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * The risk module imports `config` from ../config.js and `createLogger` from ../logger.js.
 * We mock them so tests don't depend on environment variables or real logging.
 */
vi.mock('../../../src/config.js', () => ({
  config: {
    strategy: {
      maxPositions: 3,
      riskPerTrade: 0.02,
      dailyLossLimit: 0.05,
    },
  },
}));

vi.mock('../../../src/logger.js', () => ({
  createLogger: () => ({
    info: () => {},
    debug: () => {},
    warn: () => {},
    error: () => {},
  }),
}));

import { checkRisk } from '../../../src/strategy/risk.js';

// Minimal Trade type matching what checkRisk uses
interface Trade {
  id?: number;
  symbol: string;
  date: string;
  entry_time: string;
  entry_price: number;
  stop_loss: number;
  target_1: number;
  target_2: number;
  target_3: number;
  position_size: number;
  pnl?: number | null;
  pnl_percent?: number | null;
  status: 'open' | 'closed';
}

function makeTrade(overrides: Partial<Trade> = {}): Trade {
  return {
    id: 1,
    symbol: 'AAPL',
    date: new Date().toISOString().slice(0, 10),
    entry_time: new Date().toISOString(),
    entry_price: 150,
    stop_loss: 148,
    target_1: 153,
    target_2: 155,
    target_3: 157,
    position_size: 100,
    pnl: null,
    pnl_percent: null,
    status: 'open',
    ...overrides,
  };
}

function makeSignal(overrides: Partial<{
  symbol: string;
  entryPrice: number;
  stopLoss: number;
  target1: number;
  target2: number;
  target3: number;
  resistanceLevel: number;
  gapPercent: number;
  confidence: number;
}> = {}) {
  return {
    symbol: 'TSLA',
    entryPrice: 200,
    stopLoss: 196,
    target1: 204,
    target2: 208,
    target3: 212,
    resistanceLevel: 200,
    gapPercent: 3,
    confidence: 0.8,
    ...overrides,
  };
}

describe('checkRisk', () => {
  it('allows trade when under max positions', () => {
    const openPositions = [makeTrade(), makeTrade({ symbol: 'MSFT' })];
    const signal = makeSignal();

    const result = checkRisk(100_000, openPositions as any, signal);

    expect(result.allowed).toBe(true);
    expect(result.positionSize).toBeGreaterThan(0);
  });

  it('denies trade when at max positions (3)', () => {
    const openPositions = [
      makeTrade({ symbol: 'AAPL' }),
      makeTrade({ symbol: 'MSFT' }),
      makeTrade({ symbol: 'GOOG' }),
    ];
    const signal = makeSignal();

    const result = checkRisk(100_000, openPositions as any, signal);

    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('Maximum positions');
    expect(result.positionSize).toBe(0);
  });

  it('denies trade when daily loss limit is exceeded', () => {
    // Daily loss limit = 5% of 100,000 = $5,000
    // Open positions with combined unrealised loss of -$6,000
    const openPositions = [
      makeTrade({ status: 'open', pnl: -3000 }),
      makeTrade({ symbol: 'MSFT', status: 'open', pnl: -3000 }),
    ];
    const signal = makeSignal();

    const result = checkRisk(100_000, openPositions as any, signal);

    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('Daily loss limit');
  });

  it('allows trade when daily loss is under limit', () => {
    // Loss = -$2,000 which is under the $5,000 limit
    const openPositions = [
      makeTrade({ status: 'open', pnl: -2000 }),
    ];
    const signal = makeSignal();

    const result = checkRisk(100_000, openPositions as any, signal);

    expect(result.allowed).toBe(true);
  });

  it('calculates position size correctly (accountBalance * riskPerTrade)', () => {
    const signal = makeSignal();
    const result = checkRisk(100_000, [] as any, signal);

    // riskPerTrade = 0.02, so positionSize = 100,000 * 0.02 = 2,000
    expect(result.positionSize).toBe(2000);
  });

  it('calculates max loss correctly', () => {
    const signal = makeSignal({
      entryPrice: 200,
      stopLoss: 196,
    });

    const result = checkRisk(100_000, [] as any, signal);

    // positionSize = 2000
    // riskPerShare = 200 - 196 = 4
    // shares = 2000 / 200 = 10
    // maxLoss = 4 * 10 = 40
    expect(result.maxLoss).toBeCloseTo(40, 5);
  });

  it('allows trade when positive PnL (no loss concern)', () => {
    const openPositions = [
      makeTrade({ status: 'open', pnl: 5000 }),
    ];
    const signal = makeSignal();

    const result = checkRisk(100_000, openPositions as any, signal);

    expect(result.allowed).toBe(true);
  });

  it('includes closed trades from today in daily loss calculation', () => {
    const today = new Date().toISOString().slice(0, 10);
    const openPositions = [
      // Closed trade from today with a loss
      makeTrade({ status: 'closed', date: today, pnl: -4000 }),
      // Open trade with loss
      makeTrade({ symbol: 'MSFT', status: 'open', pnl: -2000 }),
    ];
    const signal = makeSignal();

    // Total loss = -4000 + -2000 = -6000 >= 5000 limit → denied
    const result = checkRisk(100_000, openPositions as any, signal);

    expect(result.allowed).toBe(false);
  });
});
