import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../../src/logger.js', () => ({
  createLogger: () => ({
    info: () => {},
    debug: () => {},
    warn: () => {},
    error: () => {},
  }),
}));

import { PaperBroker } from '../../../src/execution/paper-broker.js';

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
    symbol: 'AAPL',
    entryPrice: 150,
    stopLoss: 148,
    target1: 153,
    target2: 155,
    target3: 157,
    resistanceLevel: 150,
    gapPercent: 3,
    confidence: 0.8,
    ...overrides,
  };
}

describe('PaperBroker', () => {
  let broker: PaperBroker;

  beforeEach(() => {
    broker = new PaperBroker(100_000);
  });

  describe('openPosition', () => {
    it('deducts cost from balance when opening a position', async () => {
      const signal = makeSignal({ entryPrice: 150 });
      await broker.openPosition(signal, 100);

      // Entry with 0.05% slippage: 150 * 1.0005 = 150.075
      // Cost = 150.075 * 100 = 15007.50 (commission = 0)
      const balance = broker.getBalance();
      expect(balance).toBeLessThan(100_000);
      expect(balance).toBeCloseTo(100_000 - 150.075 * 100, 1);
    });

    it('returns a trade ID', async () => {
      const signal = makeSignal();
      const tradeId = await broker.openPosition(signal, 100);

      expect(tradeId).toBe(1);
    });

    it('increments trade IDs', async () => {
      const id1 = await broker.openPosition(makeSignal({ symbol: 'AAPL' }), 50);
      const id2 = await broker.openPosition(makeSignal({ symbol: 'MSFT' }), 50);

      expect(id1).toBe(1);
      expect(id2).toBe(2);
    });

    it('throws when balance is insufficient', async () => {
      const signal = makeSignal({ entryPrice: 1000 });
      // 1000 * 1.0005 * 200 = 200,100 > 100,000
      await expect(broker.openPosition(signal, 200)).rejects.toThrow(
        /Insufficient balance/,
      );
    });

    it('tracks the position in open positions', async () => {
      const signal = makeSignal({ symbol: 'TSLA' });
      await broker.openPosition(signal, 50);

      const positions = broker.getOpenPositions();
      expect(positions).toHaveLength(1);
      expect(positions[0].symbol).toBe('TSLA');
      expect(positions[0].currentSize).toBe(50);
    });
  });

  describe('closePosition', () => {
    it('adds proceeds to balance when closing at a profit', async () => {
      const signal = makeSignal({ entryPrice: 100 });
      await broker.openPosition(signal, 100);

      const balanceAfterOpen = broker.getBalance();

      // Close at $110 (profit)
      await broker.closePosition('AAPL', 100, 110, 'target');

      const balanceAfterClose = broker.getBalance();
      expect(balanceAfterClose).toBeGreaterThan(balanceAfterOpen);
    });

    it('removes position from open positions after full close', async () => {
      const signal = makeSignal();
      await broker.openPosition(signal, 100);

      await broker.closePosition('AAPL', 100, 155, 'target');

      expect(broker.getOpenPositions()).toHaveLength(0);
    });

    it('records trade in history', async () => {
      const signal = makeSignal();
      await broker.openPosition(signal, 100);
      await broker.closePosition('AAPL', 100, 155, 'target');

      const history = broker.getTradeHistory();
      expect(history).toHaveLength(1);
      expect(history[0].symbol).toBe('AAPL');
      expect(history[0].reason).toBe('target');
      expect(history[0].pnl).toBeGreaterThan(0);
    });

    it('throws when position does not exist', async () => {
      await expect(
        broker.closePosition('FAKE', 100, 100, 'manual'),
      ).rejects.toThrow(/No open position/);
    });

    it('tracks P&L in daily stats', async () => {
      const signal = makeSignal({ entryPrice: 100 });
      await broker.openPosition(signal, 100);
      await broker.closePosition('AAPL', 100, 110, 'target');

      const stats = broker.getDailyStats();
      expect(stats.pnl).toBeGreaterThan(0);
      expect(stats.trades).toBe(1);
      expect(stats.wins).toBe(1);
      expect(stats.losses).toBe(0);
    });
  });

  describe('scaleOut (partial close)', () => {
    it('reduces position size after partial close', async () => {
      const signal = makeSignal({ entryPrice: 100 });
      await broker.openPosition(signal, 100);

      // Scale out 33% at target index 0
      await broker.scaleOut('AAPL', 0, 105);

      const positions = broker.getOpenPositions();
      expect(positions).toHaveLength(1);
      // 33% of 100 = 33 shares closed, 67 remaining
      expect(positions[0].currentSize).toBe(67);
    });

    it('fully closes position on final scale-out (target index 2)', async () => {
      const signal = makeSignal({ entryPrice: 100 });
      await broker.openPosition(signal, 100);

      // Scale out targets 0 and 1 first
      await broker.scaleOut('AAPL', 0, 105);
      await broker.scaleOut('AAPL', 1, 110);

      // Final scale-out closes remaining
      await broker.scaleOut('AAPL', 2, 115);

      expect(broker.getOpenPositions()).toHaveLength(0);
    });

    it('does not scale out the same level twice', async () => {
      const signal = makeSignal({ entryPrice: 100 });
      await broker.openPosition(signal, 100);

      await broker.scaleOut('AAPL', 0, 105);
      const sizeAfterFirst = broker.getOpenPositions()[0].currentSize;

      // Second call at same target should be a no-op
      await broker.scaleOut('AAPL', 0, 106);
      const sizeAfterSecond = broker.getOpenPositions()[0].currentSize;

      expect(sizeAfterSecond).toBe(sizeAfterFirst);
    });

    it('adds partial close proceeds to balance', async () => {
      const signal = makeSignal({ entryPrice: 100 });
      await broker.openPosition(signal, 100);
      const balanceBefore = broker.getBalance();

      await broker.scaleOut('AAPL', 0, 110);

      expect(broker.getBalance()).toBeGreaterThan(balanceBefore);
    });
  });

  describe('stop loss', () => {
    it('records a loss when closing below entry', async () => {
      const signal = makeSignal({ entryPrice: 100, stopLoss: 97 });
      await broker.openPosition(signal, 100);

      // Close at stop loss price
      await broker.closePosition('AAPL', 100, 97, 'stop');

      const history = broker.getTradeHistory();
      expect(history).toHaveLength(1);
      expect(history[0].pnl).toBeLessThan(0);
      expect(history[0].reason).toBe('stop');
    });

    it('daily stats reflect the loss', async () => {
      const signal = makeSignal({ entryPrice: 100 });
      await broker.openPosition(signal, 100);
      await broker.closePosition('AAPL', 100, 95, 'stop');

      const stats = broker.getDailyStats();
      expect(stats.pnl).toBeLessThan(0);
      expect(stats.losses).toBe(1);
      expect(stats.wins).toBe(0);
    });
  });

  describe('getPortfolioValue', () => {
    it('returns initial balance when no positions are open', () => {
      const prices = new Map<string, number>();
      expect(broker.getPortfolioValue(prices)).toBe(100_000);
    });

    it('calculates portfolio value with open positions at current prices', async () => {
      const signal = makeSignal({ entryPrice: 100 });
      await broker.openPosition(signal, 100);

      const prices = new Map<string, number>([['AAPL', 110]]);
      const value = broker.getPortfolioValue(prices);

      // Cash balance + position value at current price
      // Cash ≈ 100,000 - 100.05 * 100 = ~89,995
      // Position value = 110 * 100 = 11,000
      // Total ≈ 100,995
      expect(value).toBeGreaterThan(100_000);
    });

    it('falls back to entry price when no current price is available', async () => {
      const signal = makeSignal({ entryPrice: 100 });
      await broker.openPosition(signal, 100);

      // Empty prices map → falls back to entry price
      const prices = new Map<string, number>();
      const value = broker.getPortfolioValue(prices);

      // Cash + (entryPrice * size) ≈ original balance minus slippage cost only
      // The fill price is 100 * 1.0005 = 100.05
      // Cash = 100_000 - 100.05 * 100 = 89_995
      // Position value at entry = 100.05 * 100 = 10_005
      // Total ≈ 100_000
      expect(value).toBeCloseTo(100_000, -1);
    });
  });

  describe('daily stats', () => {
    it('getDailyStats returns zero counts initially', () => {
      const stats = broker.getDailyStats();

      expect(stats.trades).toBe(0);
      expect(stats.wins).toBe(0);
      expect(stats.losses).toBe(0);
      expect(stats.pnl).toBe(0);
      expect(stats.pnlPercent).toBe(0);
    });

    it('resetDaily clears daily PnL', async () => {
      const signal = makeSignal({ entryPrice: 100 });
      await broker.openPosition(signal, 100);
      await broker.closePosition('AAPL', 100, 110, 'target');

      expect(broker.getDailyStats().pnl).not.toBe(0);

      broker.resetDaily();

      expect(broker.getDailyStats().pnl).toBe(0);
    });

    it('pnlPercent is relative to initial balance', async () => {
      const signal = makeSignal({ entryPrice: 100 });
      await broker.openPosition(signal, 100);
      await broker.closePosition('AAPL', 100, 110, 'target');

      const stats = broker.getDailyStats();
      // pnlPercent = dailyPnL / initialBalance * 100
      expect(stats.pnlPercent).toBeCloseTo((stats.pnl / 100_000) * 100, 5);
    });

    it('counts wins and losses separately', async () => {
      // Win
      await broker.openPosition(makeSignal({ symbol: 'AAPL', entryPrice: 100 }), 50);
      await broker.closePosition('AAPL', 100, 110, 'target');

      // Loss
      await broker.openPosition(makeSignal({ symbol: 'MSFT', entryPrice: 100 }), 50);
      await broker.closePosition('MSFT', 100, 90, 'stop');

      const stats = broker.getDailyStats();
      expect(stats.trades).toBe(2);
      expect(stats.wins).toBe(1);
      expect(stats.losses).toBe(1);
    });
  });
});
