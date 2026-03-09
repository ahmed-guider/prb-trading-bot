import { config } from "../config.js";
import { createLogger } from "../logger.js";
import { getSnapshot } from "../data/market-data.js";
import type { Trade } from "../data/storage.js";

const log = createLogger("exit-manager");

export interface PositionStatus {
  tradeId: number;
  symbol: string;
  currentPrice: number;
  pnlPercent: number;
  scaledOut1: boolean;
  scaledOut2: boolean;
  scaledOut3: boolean;
  shouldClose: boolean;
  closeReason?: string;
}

/**
 * Calculate the stock price at which a scale-out target is hit,
 * given an entry price, target P&L percentage, and leverage multiplier.
 *
 * For example, with entryPrice=100, targetPercent=30 (%), leverageMultiplier=10:
 *   stock needs to move 30/10 = 3% → price = 103
 */
export function calculateScaleOutPrice(
  entryPrice: number,
  targetPercent: number,
  leverageMultiplier: number,
): number {
  const stockMovePercent = targetPercent / leverageMultiplier;
  return entryPrice * (1 + stockMovePercent / 100);
}

/**
 * Check all open trades for exit conditions:
 * - Scale-out at configured P&L thresholds
 * - Stop loss hit
 * - Time stop (default 11 AM ET)
 */
export async function checkExits(openTrades: Trade[]): Promise<PositionStatus[]> {
  if (openTrades.length === 0) {
    log.debug("No open trades to check");
    return [];
  }

  log.info(`Checking exits for ${openTrades.length} open trades`);

  const statuses: PositionStatus[] = [];

  for (const trade of openTrades) {
    try {
      const snap = await getSnapshot(trade.symbol);
      const currentPrice = snap.latestTrade.price;

      const pnlPercent = ((currentPrice - trade.entry_price) / trade.entry_price) * 100;

      const scaledOut1 = trade.scale_out_1_price != null;
      const scaledOut2 = trade.scale_out_2_price != null;
      const scaledOut3 = trade.scale_out_3_price != null;

      let shouldClose = false;
      let closeReason: string | undefined;

      // Check stop loss
      if (currentPrice <= trade.stop_loss) {
        shouldClose = true;
        closeReason = "stop";
        log.info(`${trade.symbol}: stop loss hit at ${currentPrice.toFixed(2)} (stop=${trade.stop_loss.toFixed(2)})`);
      }

      // Check time stop
      if (!shouldClose) {
        const now = new Date();
        // Convert to ET (UTC-5 standard, UTC-4 daylight)
        const etOffset = isDST(now) ? -4 : -5;
        const etHour = (now.getUTCHours() + etOffset + 24) % 24;

        if (etHour >= config.strategy.timeStopHour) {
          shouldClose = true;
          closeReason = "time_stop";
          log.info(`${trade.symbol}: time stop triggered at ${etHour}:00 ET`);
        }
      }

      // Check scale-out levels (only log, actual execution happens in the orchestrator)
      if (!scaledOut1 && pnlPercent >= config.strategy.scaleOut1) {
        log.info(`${trade.symbol}: scale-out 1 triggered at ${pnlPercent.toFixed(2)}% (target=${config.strategy.scaleOut1}%)`);
      }
      if (!scaledOut2 && pnlPercent >= config.strategy.scaleOut2) {
        log.info(`${trade.symbol}: scale-out 2 triggered at ${pnlPercent.toFixed(2)}% (target=${config.strategy.scaleOut2}%)`);
      }
      if (!scaledOut3 && pnlPercent >= config.strategy.scaleOut3) {
        shouldClose = true;
        closeReason = "target";
        log.info(`${trade.symbol}: final scale-out triggered at ${pnlPercent.toFixed(2)}%`);
      }

      const status: PositionStatus = {
        tradeId: trade.id!,
        symbol: trade.symbol,
        currentPrice,
        pnlPercent,
        scaledOut1,
        scaledOut2,
        scaledOut3,
        shouldClose,
        closeReason,
      };

      statuses.push(status);

      log.debug(
        `${trade.symbol}: price=${currentPrice.toFixed(2)} pnl=${pnlPercent.toFixed(2)}% ` +
        `scaled=[${scaledOut1}, ${scaledOut2}, ${scaledOut3}] close=${shouldClose}`,
      );
    } catch (err) {
      log.warn(`${trade.symbol}: error checking exit`, err);
    }
  }

  return statuses;
}

/**
 * Simple DST check for US Eastern Time.
 * DST is active from second Sunday of March to first Sunday of November.
 */
function isDST(date: Date): boolean {
  const year = date.getFullYear();

  // Second Sunday of March
  const marchFirst = new Date(year, 2, 1);
  const marchFirstDay = marchFirst.getDay();
  const dstStart = new Date(year, 2, 8 + ((7 - marchFirstDay) % 7));
  dstStart.setHours(2, 0, 0, 0);

  // First Sunday of November
  const novFirst = new Date(year, 10, 1);
  const novFirstDay = novFirst.getDay();
  const dstEnd = new Date(year, 10, 1 + ((7 - novFirstDay) % 7));
  dstEnd.setHours(2, 0, 0, 0);

  return date >= dstStart && date < dstEnd;
}
