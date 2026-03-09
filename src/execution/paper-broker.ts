import { createLogger } from "../logger.js";
import type { EntrySignal } from "../strategy/entry-signals.js";

const log = createLogger("paper-broker");

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PaperPosition {
  symbol: string;
  entryPrice: number;
  currentSize: number;
  originalSize: number;
  stopLoss: number;
  targets: number[];
  scaledOutLevels: number[];
  openTime: number;
  tradeId: number;
}

export interface PaperTrade {
  symbol: string;
  entryPrice: number;
  exitPrice: number;
  size: number;
  pnl: number;
  pnlPercent: number;
  entryTime: number;
  exitTime: number;
  reason: string;
  side: "long" | "short";
}

// ---------------------------------------------------------------------------
// Default simulation parameters
// ---------------------------------------------------------------------------

const DEFAULT_SLIPPAGE_PCT = 0.05; // 0.05%
const DEFAULT_COMMISSION_RATE = 0; // Alpaca is commission-free

// ---------------------------------------------------------------------------
// PaperBroker
// ---------------------------------------------------------------------------

export class PaperBroker {
  private balance: number;
  private initialBalance: number;
  private positions: Map<string, PaperPosition>;
  private tradeHistory: PaperTrade[];
  private dailyPnL: number;
  private nextTradeId: number;

  constructor(initialBalance: number) {
    this.balance = initialBalance;
    this.initialBalance = initialBalance;
    this.positions = new Map();
    this.tradeHistory = [];
    this.dailyPnL = 0;
    this.nextTradeId = 1;

    log.info(`PaperBroker initialized with $${initialBalance.toFixed(2)} balance`);
  }

  // -------------------------------------------------------------------------
  // Open a new position
  // -------------------------------------------------------------------------

  async openPosition(signal: EntrySignal, positionSize: number): Promise<number> {
    const tradeId = this.nextTradeId++;
    const fillPrice = this.applySlippage(signal.entryPrice, true, DEFAULT_SLIPPAGE_PCT);
    const commission = this.applyCommission(fillPrice * positionSize, DEFAULT_COMMISSION_RATE);
    const totalCost = fillPrice * positionSize + commission;

    if (totalCost > this.balance) {
      throw new Error(
        `Insufficient balance: need $${totalCost.toFixed(2)} but only have $${this.balance.toFixed(2)}`,
      );
    }

    this.balance -= totalCost;

    const position: PaperPosition = {
      symbol: signal.symbol,
      entryPrice: fillPrice,
      currentSize: positionSize,
      originalSize: positionSize,
      stopLoss: signal.stopLoss,
      targets: [signal.target1, signal.target2, signal.target3],
      scaledOutLevels: [],
      openTime: Date.now(),
      tradeId,
    };

    this.positions.set(signal.symbol, position);

    log.info(
      `Opened position #${tradeId}: ${signal.symbol} ${positionSize} shares @ $${fillPrice.toFixed(2)} ` +
      `(cost=$${totalCost.toFixed(2)}, commission=$${commission.toFixed(2)})`,
    );

    return tradeId;
  }

  // -------------------------------------------------------------------------
  // Close a position (full or partial)
  // -------------------------------------------------------------------------

  async closePosition(
    symbol: string,
    percent: number,
    price: number,
    reason: string,
  ): Promise<void> {
    const position = this.positions.get(symbol);
    if (!position) {
      throw new Error(`No open position for ${symbol}`);
    }

    const closeSize = Math.floor(position.currentSize * (percent / 100));
    if (closeSize <= 0) {
      log.warn(`${symbol}: calculated close size is 0, skipping`);
      return;
    }

    const fillPrice = this.applySlippage(price, false, DEFAULT_SLIPPAGE_PCT);
    const commission = this.applyCommission(fillPrice * closeSize, DEFAULT_COMMISSION_RATE);
    const proceeds = fillPrice * closeSize - commission;

    this.balance += proceeds;

    const pnl = (fillPrice - position.entryPrice) * closeSize - commission;
    const pnlPercent = ((fillPrice - position.entryPrice) / position.entryPrice) * 100;

    this.dailyPnL += pnl;

    const trade: PaperTrade = {
      symbol,
      entryPrice: position.entryPrice,
      exitPrice: fillPrice,
      size: closeSize,
      pnl,
      pnlPercent,
      entryTime: position.openTime,
      exitTime: Date.now(),
      reason,
      side: "long",
    };

    this.tradeHistory.push(trade);

    position.currentSize -= closeSize;

    log.info(
      `Closed ${percent}% of ${symbol}: ${closeSize} shares @ $${fillPrice.toFixed(2)} ` +
      `(pnl=$${pnl.toFixed(2)}, ${pnlPercent.toFixed(2)}%, reason=${reason})`,
    );

    // Remove position if fully closed
    if (position.currentSize <= 0) {
      this.positions.delete(symbol);
      log.info(`Position ${symbol} fully closed`);
    }
  }

  // -------------------------------------------------------------------------
  // Scale out of a position
  // -------------------------------------------------------------------------

  async scaleOut(
    symbol: string,
    targetIndex: number,
    currentPrice: number,
  ): Promise<void> {
    const position = this.positions.get(symbol);
    if (!position) {
      throw new Error(`No open position for ${symbol}`);
    }

    if (position.scaledOutLevels.includes(targetIndex)) {
      log.debug(`${symbol}: already scaled out at target ${targetIndex}`);
      return;
    }

    // Scale-out percentages: 33% at each of the 3 targets
    const scalePercent = targetIndex < 2 ? 33 : 100; // Close remaining on final target

    await this.closePosition(symbol, scalePercent, currentPrice, `scale_out_${targetIndex + 1}`);

    // Mark this level as scaled out (position may have been deleted if fully closed)
    const updatedPosition = this.positions.get(symbol);
    if (updatedPosition) {
      updatedPosition.scaledOutLevels.push(targetIndex);
    }

    log.info(`${symbol}: scaled out at target ${targetIndex + 1} ($${currentPrice.toFixed(2)})`);
  }

  // -------------------------------------------------------------------------
  // Get current portfolio value
  // -------------------------------------------------------------------------

  getPortfolioValue(currentPrices: Map<string, number>): number {
    let positionsValue = 0;

    for (const [symbol, position] of this.positions) {
      const price = currentPrices.get(symbol);
      if (price !== undefined) {
        positionsValue += price * position.currentSize;
      } else {
        // Fall back to entry price if no current price available
        positionsValue += position.entryPrice * position.currentSize;
      }
    }

    return this.balance + positionsValue;
  }

  // -------------------------------------------------------------------------
  // Get account balance (cash)
  // -------------------------------------------------------------------------

  getBalance(): number {
    return this.balance;
  }

  // -------------------------------------------------------------------------
  // Get open positions
  // -------------------------------------------------------------------------

  getOpenPositions(): PaperPosition[] {
    return Array.from(this.positions.values());
  }

  // -------------------------------------------------------------------------
  // Get trade history
  // -------------------------------------------------------------------------

  getTradeHistory(): PaperTrade[] {
    return [...this.tradeHistory];
  }

  // -------------------------------------------------------------------------
  // Get daily stats
  // -------------------------------------------------------------------------

  getDailyStats(): {
    trades: number;
    wins: number;
    losses: number;
    pnl: number;
    pnlPercent: number;
  } {
    // Count trades completed today
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayMs = todayStart.getTime();

    const todayTrades = this.tradeHistory.filter((t) => t.exitTime >= todayMs);
    const wins = todayTrades.filter((t) => t.pnl > 0).length;
    const losses = todayTrades.filter((t) => t.pnl <= 0).length;

    return {
      trades: todayTrades.length,
      wins,
      losses,
      pnl: this.dailyPnL,
      pnlPercent: (this.dailyPnL / this.initialBalance) * 100,
    };
  }

  // -------------------------------------------------------------------------
  // Reset daily stats (call at start of each trading day)
  // -------------------------------------------------------------------------

  resetDaily(): void {
    this.dailyPnL = 0;
    log.info("Daily P&L stats reset");
  }

  // -------------------------------------------------------------------------
  // Apply slippage to a price (for realistic simulation)
  // -------------------------------------------------------------------------

  private applySlippage(
    price: number,
    isBuy: boolean,
    slippagePercent: number,
  ): number {
    const slippageFactor = slippagePercent / 100;
    // Buys fill slightly higher, sells fill slightly lower
    if (isBuy) {
      return price * (1 + slippageFactor);
    }
    return price * (1 - slippageFactor);
  }

  // -------------------------------------------------------------------------
  // Apply commission
  // -------------------------------------------------------------------------

  private applyCommission(
    notional: number,
    commissionRate: number,
  ): number {
    return notional * commissionRate;
  }
}
