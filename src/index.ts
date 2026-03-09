import cron from "node-cron";
import { config } from "./config.js";
import { createLogger } from "./logger.js";
import { db } from "./data/storage.js";
import { PaperBroker } from "./execution/paper-broker.js";
import { createServer, startServer } from "./server.js";
import {
  calculateOpeningRanges,
  scanAndManage,
  timeStopAll,
  resetORBState,
  getORBStatus,
} from "./strategy/orb-live.js";

const log = createLogger("main");

// ---------------------------------------------------------------------------
// Bot state
// ---------------------------------------------------------------------------

export type BotState =
  | "idle"
  | "calculating_or"
  | "monitoring_breakouts"
  | "time_stopped"
  | "closed";

let currentState: BotState = "idle";

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
// Cron-scheduled tasks (ORB strategy)
// ---------------------------------------------------------------------------

const TIMEZONE = "America/New_York";

/**
 * 10:00 AM ET — Calculate 30-min opening ranges for all symbols.
 * The opening range covers 9:30-10:00 AM.
 */
async function onCalculateOR(): Promise<void> {
  try {
    setState("calculating_or");
    log.info("Calculating opening ranges (9:30-10:00 AM window)...");
    await calculateOpeningRanges();
    setState("monitoring_breakouts");
  } catch (err) {
    log.error("Opening range calculation failed", err);
  }
}

/**
 * 10:05-11:55 AM ET (every 5 min) — Scan for breakouts + manage positions.
 */
async function onScanAndManage(broker: PaperBroker): Promise<void> {
  try {
    setState("monitoring_breakouts");
    await scanAndManage(broker);
  } catch (err) {
    log.error("Scan/manage failed", err);
  }
}

/**
 * 12:00 PM ET — Time stop: close all remaining ORB positions.
 */
async function onTimeStop(broker: PaperBroker): Promise<void> {
  try {
    setState("time_stopped");
    log.info("Time stop triggered — closing all remaining positions");
    await timeStopAll(broker);
  } catch (err) {
    log.error("Time stop failed", err);
  }
}

/**
 * 4:00 PM ET — End of day: force-close anything still open, reset.
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
          position.entryPrice,
          "eod_close",
        );
        log.info(`Force-closed EOD position: ${position.symbol}`);
      } catch (err) {
        log.error(`Failed to close EOD position ${position.symbol}`, err);
      }
    }

    // Reset for next day
    broker.resetDaily();
    resetORBState();

    log.info("End of day complete. Ready for next trading day.");
  } catch (err) {
    log.error("End of day reconciliation failed", err);
  }
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  log.info("ORB Trading Bot starting...");
  log.info("Strategy: Opening Range Breakout (30min, R=1.5/3.0)");
  log.info("Validated: 4-year out-of-sample test, Sharpe 1.39, 8971 trades");
  log.info("Configuration", {
    port: config.server.port,
  });

  // Initialize components
  const broker = new PaperBroker(100_000);
  const server = createServer(broker);

  // Start the API server
  await startServer(server);

  // Schedule cron jobs (all times in ET, weekdays only)

  // 10:00 AM ET: Calculate opening ranges (30 min after market open)
  cron.schedule("0 10 * * 1-5", () => {
    onCalculateOR().catch((err) => log.error("OR calculation cron error", err));
  }, { timezone: TIMEZONE });

  // 10:05-11:55 AM ET: Scan for breakouts every 5 minutes
  cron.schedule("5-55/5 10 * * 1-5", () => {
    onScanAndManage(broker).catch((err) => log.error("Scan cron error", err));
  }, { timezone: TIMEZONE });
  cron.schedule("0-55/5 11 * * 1-5", () => {
    onScanAndManage(broker).catch((err) => log.error("Scan cron error", err));
  }, { timezone: TIMEZONE });

  // 12:00 PM ET: Time stop — close all remaining positions
  cron.schedule("0 12 * * 1-5", () => {
    onTimeStop(broker).catch((err) => log.error("Time stop cron error", err));
  }, { timezone: TIMEZONE });

  // 4:00 PM ET: End of day reconciliation
  cron.schedule("0 16 * * 1-5", () => {
    onEndOfDay(broker).catch((err) => log.error("EOD cron error", err));
  }, { timezone: TIMEZONE });

  log.info("Cron jobs scheduled (all times America/New_York, weekdays only)");
  log.info("  10:00       - Calculate opening ranges");
  log.info("  10:05-11:55 - Scan for breakouts (every 5 min)");
  log.info("  12:00       - Time stop (close remaining positions)");
  log.info("  16:00       - End of day reconciliation");
  log.info("Bot is ready and waiting for scheduled events.");

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
