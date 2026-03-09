import cron from "node-cron";
import { config } from "./config.js";
import { createLogger } from "./logger.js";
import { db } from "./data/storage.js";
import { PaperBroker } from "./execution/paper-broker.js";
import { createServer, startServer } from "./server.js";
import { runScreener } from "./strategy/screener-pipeline.js";
import { scanPremarket } from "./strategy/premarket-scanner.js";
import { scanForEntries } from "./strategy/entry-signals.js";
import { checkExits } from "./strategy/exit-manager.js";
import type { WatchlistStock, Candidate } from "./data/storage.js";

const log = createLogger("main");

// ---------------------------------------------------------------------------
// Bot state
// ---------------------------------------------------------------------------

export type BotState =
  | "idle"
  | "screening"
  | "scanning_premarket"
  | "watching_open"
  | "managing_positions"
  | "closed";

let currentState: BotState = "idle";
let todayWatchlist: WatchlistStock[] = [];
let todayCandidates: Candidate[] = [];

export function getBotState(): BotState {
  return currentState;
}

function setState(newState: BotState): void {
  const prev = currentState;
  currentState = newState;
  db.setState("bot_state", newState);
  log.info(`State transition: ${prev} -> ${newState}`);
}

// ---------------------------------------------------------------------------
// Cron-scheduled tasks
// ---------------------------------------------------------------------------

const TIMEZONE = "America/New_York";

/**
 * 8:00 AM ET - Run screener to build the daily watchlist.
 */
async function onScreener(): Promise<void> {
  try {
    setState("screening");
    log.info("Running daily screener...");
    todayWatchlist = await runScreener();
    log.info(`Screener complete: ${todayWatchlist.length} stocks on watchlist`);
  } catch (err) {
    log.error("Screener failed", err);
  }
}

/**
 * 8:30 - 9:25 AM ET (every 5 min) - Scan pre-market data for gap-up candidates.
 */
async function onPremarketScan(): Promise<void> {
  try {
    setState("scanning_premarket");
    log.info("Running pre-market scan...");

    if (todayWatchlist.length === 0) {
      // Try to load from storage in case the screener ran earlier
      const today = new Date().toISOString().slice(0, 10);
      const stored = db.getWatchlist(today);
      if (stored.length > 0) {
        todayWatchlist = stored;
        log.info(`Loaded ${stored.length} watchlist entries from storage`);
      }
    }

    todayCandidates = await scanPremarket(todayWatchlist);
    log.info(`Pre-market scan complete: ${todayCandidates.length} candidates`);
  } catch (err) {
    log.error("Pre-market scan failed", err);
  }
}

/**
 * 9:30 AM ET - Market open: scan candidates for entry signals and open positions.
 */
async function onMarketOpen(broker: PaperBroker): Promise<void> {
  try {
    setState("watching_open");
    log.info("Market open - scanning for entry signals...");

    if (todayCandidates.length === 0) {
      const today = new Date().toISOString().slice(0, 10);
      const stored = db.getCandidates(today);
      if (stored.length > 0) {
        todayCandidates = stored;
        log.info(`Loaded ${stored.length} candidates from storage`);
      }
    }

    const validCandidates = todayCandidates.filter((c) => c.is_valid);
    const signals = await scanForEntries(validCandidates);

    log.info(`Found ${signals.length} entry signals`);

    // Open positions for each signal (respecting max positions)
    const openPositions = broker.getOpenPositions();
    let slotsAvailable = config.strategy.maxPositions - openPositions.length;

    for (const signal of signals) {
      if (slotsAvailable <= 0) {
        log.info("Max positions reached, skipping remaining signals");
        break;
      }

      try {
        // Calculate position size based on risk per trade
        const riskAmount = broker.getBalance() * config.strategy.riskPerTrade;
        const riskPerShare = signal.entryPrice - signal.stopLoss;

        if (riskPerShare <= 0) {
          log.warn(`${signal.symbol}: invalid risk per share, skipping`);
          continue;
        }

        const positionSize = Math.floor(riskAmount / riskPerShare);
        if (positionSize <= 0) continue;

        const tradeId = await broker.openPosition(signal, positionSize);

        // Record in storage
        const today = new Date().toISOString().slice(0, 10);
        db.openTrade({
          symbol: signal.symbol,
          date: today,
          entry_time: new Date().toISOString(),
          entry_price: signal.entryPrice,
          stop_loss: signal.stopLoss,
          target_1: signal.target1,
          target_2: signal.target2,
          target_3: signal.target3,
          position_size: positionSize,
        });

        log.info(`Opened position #${tradeId} for ${signal.symbol}`);
        slotsAvailable--;
      } catch (err) {
        log.error(`Failed to open position for ${signal.symbol}`, err);
      }
    }

    if (signals.length > 0) {
      setState("managing_positions");
    }
  } catch (err) {
    log.error("Market open scan failed", err);
  }
}

/**
 * 9:35 AM - 11:00 AM ET (every 5 min) - Monitor open positions for exits.
 */
async function onExitCheck(broker: PaperBroker): Promise<void> {
  try {
    setState("managing_positions");

    const openTrades = db.getOpenTrades();
    if (openTrades.length === 0) {
      log.debug("No open trades to monitor");
      return;
    }

    log.info(`Checking exits for ${openTrades.length} open trades`);

    const statuses = await checkExits(openTrades);

    for (const status of statuses) {
      if (status.shouldClose) {
        try {
          await broker.closePosition(
            status.symbol,
            100,
            status.currentPrice,
            status.closeReason ?? "manual",
          );

          const pnl =
            (status.currentPrice -
              (openTrades.find((t) => t.id === status.tradeId)?.entry_price ?? 0)) *
            (openTrades.find((t) => t.id === status.tradeId)?.position_size ?? 0);

          db.closeTrade(status.tradeId, {
            exit_time: new Date().toISOString(),
            exit_price: status.currentPrice,
            exit_reason: status.closeReason as "target" | "stop" | "time_stop" | "manual",
            pnl,
            pnl_percent: status.pnlPercent,
          });

          log.info(
            `Closed trade #${status.tradeId} ${status.symbol}: $${pnl.toFixed(2)} (${status.closeReason})`,
          );
        } catch (err) {
          log.error(`Failed to close position for ${status.symbol}`, err);
        }
      }
    }
  } catch (err) {
    log.error("Exit check failed", err);
  }
}

/**
 * 4:00 PM ET - End of day reconciliation.
 */
async function onEndOfDay(broker: PaperBroker): Promise<void> {
  try {
    setState("closed");

    const dailyStats = broker.getDailyStats();
    log.info("End of day reconciliation", dailyStats);

    // Force-close any remaining open positions
    const openPositions = broker.getOpenPositions();
    for (const position of openPositions) {
      try {
        await broker.closePosition(
          position.symbol,
          100,
          position.entryPrice, // Use entry price as fallback
          "eod_close",
        );
        log.info(`Force-closed EOD position: ${position.symbol}`);
      } catch (err) {
        log.error(`Failed to close EOD position ${position.symbol}`, err);
      }
    }

    // Reset for next day
    broker.resetDaily();
    todayWatchlist = [];
    todayCandidates = [];

    log.info("End of day complete. Ready for next trading day.");
  } catch (err) {
    log.error("End of day reconciliation failed", err);
  }
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  log.info("PRB Trading Bot starting...");
  log.info("Configuration loaded", {
    port: config.server.port,
    maxPositions: config.strategy.maxPositions,
    gapThreshold: config.strategy.gapThreshold,
    riskPerTrade: config.strategy.riskPerTrade,
  });

  // Initialize components
  const broker = new PaperBroker(100_000);
  const server = createServer(broker);

  // Start the API server
  await startServer(server);

  // Schedule cron jobs (all times in ET)

  // 8:00 AM ET: Run screener to build watchlist
  cron.schedule("0 8 * * 1-5", () => {
    onScreener().catch((err) => log.error("Screener cron error", err));
  }, { timezone: TIMEZONE });

  // 8:30 AM - 9:25 AM ET: Pre-market scanning every 5 minutes
  cron.schedule("30-55/5 8 * * 1-5", () => {
    onPremarketScan().catch((err) => log.error("Premarket scan cron error", err));
  }, { timezone: TIMEZONE });
  cron.schedule("0-25/5 9 * * 1-5", () => {
    onPremarketScan().catch((err) => log.error("Premarket scan cron error", err));
  }, { timezone: TIMEZONE });

  // 9:30 AM ET: Market open - scan for entries
  cron.schedule("30 9 * * 1-5", () => {
    onMarketOpen(broker).catch((err) => log.error("Market open cron error", err));
  }, { timezone: TIMEZONE });

  // 9:35 AM - 11:00 AM ET: Monitor exits every 5 minutes
  cron.schedule("35-55/5 9 * * 1-5", () => {
    onExitCheck(broker).catch((err) => log.error("Exit check cron error", err));
  }, { timezone: TIMEZONE });
  cron.schedule("0-55/5 10 * * 1-5", () => {
    onExitCheck(broker).catch((err) => log.error("Exit check cron error", err));
  }, { timezone: TIMEZONE });
  cron.schedule("0 11 * * 1-5", () => {
    onExitCheck(broker).catch((err) => log.error("Exit check cron error", err));
  }, { timezone: TIMEZONE });

  // 4:00 PM ET: End of day reconciliation
  cron.schedule("0 16 * * 1-5", () => {
    onEndOfDay(broker).catch((err) => log.error("EOD cron error", err));
  }, { timezone: TIMEZONE });

  log.info("Cron jobs scheduled (all times America/New_York, weekdays only)");
  log.info("  08:00    - Daily screener");
  log.info("  08:30-09:25 - Pre-market scanning (every 5 min)");
  log.info("  09:30    - Market open entry scan");
  log.info("  09:35-11:00 - Exit monitoring (every 5 min)");
  log.info("  16:00    - End of day reconciliation");
  log.info("Bot is ready and waiting for scheduled events.");

  // Restore previous state if available
  const savedState = db.getState("bot_state");
  if (savedState) {
    log.info(`Previous bot state: ${savedState}`);
  }

  // Graceful shutdown
  const shutdown = async (): Promise<void> => {
    log.info("Shutting down...");
    await server.close();
    db.close();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  log.error("Fatal error during startup", err);
  process.exit(1);
});
