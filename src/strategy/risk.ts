import { config } from "../config.js";
import { createLogger } from "../logger.js";
import type { Trade } from "../data/storage.js";
import type { EntrySignal } from "./entry-signals.js";

const log = createLogger("risk");

export interface RiskCheck {
  allowed: boolean;
  reason?: string;
  positionSize: number;
  maxLoss: number;
}

/**
 * Evaluate whether a new trade is allowed based on risk constraints:
 * - Maximum concurrent open positions
 * - Daily loss limit (sum of today's closed P&L + unrealised open P&L)
 * - Position sizing based on account balance and risk-per-trade
 */
export function checkRisk(
  accountBalance: number,
  openPositions: Trade[],
  newSignal: EntrySignal,
): RiskCheck {
  const today = new Date().toISOString().slice(0, 10);

  // --- Max positions check ---
  if (openPositions.length >= config.strategy.maxPositions) {
    log.info(
      `Risk denied: max positions reached (${openPositions.length}/${config.strategy.maxPositions})`,
    );
    return {
      allowed: false,
      reason: `Maximum positions reached (${config.strategy.maxPositions})`,
      positionSize: 0,
      maxLoss: 0,
    };
  }

  // --- Daily loss limit check ---
  // Sum realised P&L from today's closed trades + unrealised from open positions
  const todayClosedPnl = openPositions
    .filter((t) => t.status === "closed" && t.date === today && t.pnl != null)
    .reduce((sum, t) => sum + (t.pnl ?? 0), 0);

  const openUnrealisedPnl = openPositions
    .filter((t) => t.status === "open")
    .reduce((sum, t) => sum + (t.pnl ?? 0), 0);

  const totalDayPnl = todayClosedPnl + openUnrealisedPnl;
  const dailyLossLimit = accountBalance * config.strategy.dailyLossLimit;

  if (totalDayPnl < 0 && Math.abs(totalDayPnl) >= dailyLossLimit) {
    log.info(
      `Risk denied: daily loss limit reached (loss=${Math.abs(totalDayPnl).toFixed(2)} >= limit=${dailyLossLimit.toFixed(2)})`,
    );
    return {
      allowed: false,
      reason: `Daily loss limit reached ($${Math.abs(totalDayPnl).toFixed(2)} >= $${dailyLossLimit.toFixed(2)})`,
      positionSize: 0,
      maxLoss: 0,
    };
  }

  // --- Position sizing ---
  const positionSize = accountBalance * config.strategy.riskPerTrade;

  // Max loss = distance from entry to stop loss * (positionSize / entryPrice)
  const riskPerShare = newSignal.entryPrice - newSignal.stopLoss;
  const shares = positionSize / newSignal.entryPrice;
  const maxLoss = riskPerShare * shares;

  log.info(
    `Risk approved: ${newSignal.symbol} | size=$${positionSize.toFixed(2)} | ` +
    `maxLoss=$${maxLoss.toFixed(2)} | openPositions=${openPositions.length}`,
  );

  return {
    allowed: true,
    positionSize,
    maxLoss,
  };
}
