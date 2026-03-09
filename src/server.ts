import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import { z } from "zod";
import { config } from "./config.js";
import { createLogger } from "./logger.js";
import { db } from "./data/storage.js";
import type { TradeFilters } from "./data/storage.js";
import { PaperBroker } from "./execution/paper-broker.js";
import { runBacktest, type BacktestParams } from "./backtest/engine.js";
import { getPerformanceStats } from "./reporting/stats.js";

const log = createLogger("server");

// ---------------------------------------------------------------------------
// Backtest request schema
// ---------------------------------------------------------------------------

const backtestBodySchema = z.object({
  symbols: z.array(z.string()).min(1),
  startDate: z.string(),
  endDate: z.string(),
  initialBalance: z.number().positive().default(100_000),
  gapThreshold: z.number().positive().optional(),
  trendEmaFast: z.number().int().positive().optional(),
  trendEmaSlow: z.number().int().positive().optional(),
  momentumBodyRatio: z.number().min(0).max(1).optional(),
  momentumWickMax: z.number().min(0).max(1).optional(),
  scaleOut1: z.number().min(0).max(100).optional(),
  scaleOut2: z.number().min(0).max(100).optional(),
  scaleOut3: z.number().min(0).max(100).optional(),
  stopLossBuffer: z.number().positive().optional(),
  maxPositions: z.number().int().positive().optional(),
  riskPerTrade: z.number().positive().max(1).optional(),
  dailyLossLimit: z.number().positive().max(1).optional(),
  leverageMultiplier: z.number().positive().default(1),
  timeStopHour: z.number().int().min(0).max(23).optional(),
});

// ---------------------------------------------------------------------------
// Config update schema (partial strategy config)
// ---------------------------------------------------------------------------

const configUpdateSchema = z.object({
  gapThreshold: z.number().positive().optional(),
  trendEmaFast: z.number().int().positive().optional(),
  trendEmaSlow: z.number().int().positive().optional(),
  momentumBodyRatio: z.number().min(0).max(1).optional(),
  momentumWickMax: z.number().min(0).max(1).optional(),
  scaleOut1: z.number().min(0).max(100).optional(),
  scaleOut2: z.number().min(0).max(100).optional(),
  scaleOut3: z.number().min(0).max(100).optional(),
  stopLossBuffer: z.number().positive().optional(),
  maxPositions: z.number().int().positive().optional(),
  riskPerTrade: z.number().positive().max(1).optional(),
  dailyLossLimit: z.number().positive().max(1).optional(),
  timeStopHour: z.number().int().min(0).max(23).optional(),
});

// ---------------------------------------------------------------------------
// Server factory
// ---------------------------------------------------------------------------

export function createServer(broker: PaperBroker): FastifyInstance {
  const server = Fastify({ logger: false });

  // Register CORS
  server.register(cors, { origin: true });

  // -----------------------------------------------------------------------
  // GET /api/health
  // -----------------------------------------------------------------------

  server.get("/api/health", async () => {
    return { status: "ok", timestamp: new Date().toISOString() };
  });

  // -----------------------------------------------------------------------
  // GET /api/watchlist
  // -----------------------------------------------------------------------

  server.get("/api/watchlist", async () => {
    const today = new Date().toISOString().slice(0, 10);
    const watchlist = db.getWatchlist(today);
    return { date: today, count: watchlist.length, watchlist };
  });

  // -----------------------------------------------------------------------
  // GET /api/candidates
  // -----------------------------------------------------------------------

  server.get("/api/candidates", async () => {
    const today = new Date().toISOString().slice(0, 10);
    const candidates = db.getCandidates(today);
    return { date: today, count: candidates.length, candidates };
  });

  // -----------------------------------------------------------------------
  // GET /api/positions
  // -----------------------------------------------------------------------

  server.get("/api/positions", async () => {
    const positions = broker.getOpenPositions();
    return {
      count: positions.length,
      balance: broker.getBalance(),
      positions,
    };
  });

  // -----------------------------------------------------------------------
  // GET /api/trades
  // -----------------------------------------------------------------------

  server.get<{
    Querystring: {
      limit?: string;
      status?: string;
      symbol?: string;
      date?: string;
      from?: string;
      to?: string;
    };
  }>("/api/trades", async (request) => {
    const { limit, status, symbol, date, from, to } = request.query;

    const filters: TradeFilters = {};
    if (symbol) filters.symbol = symbol;
    if (date) filters.date = date;
    if (status === "open" || status === "closed") filters.status = status;
    if (from) filters.from = from;
    if (to) filters.to = to;

    let trades = db.getTrades(filters);

    const maxResults = limit ? parseInt(limit, 10) : 50;
    if (!isNaN(maxResults) && maxResults > 0) {
      trades = trades.slice(0, maxResults);
    }

    return { count: trades.length, trades };
  });

  // -----------------------------------------------------------------------
  // GET /api/stats
  // -----------------------------------------------------------------------

  server.get("/api/stats", async () => {
    const allTrades = db.getTrades();
    const stats = getPerformanceStats(allTrades, broker.getBalance());
    const dailyStats = broker.getDailyStats();

    return {
      ...stats,
      daily: dailyStats,
    };
  });

  // -----------------------------------------------------------------------
  // GET /api/indicators/:symbol
  // -----------------------------------------------------------------------

  server.get<{ Params: { symbol: string } }>(
    "/api/indicators/:symbol",
    async (request, reply) => {
      const { symbol } = request.params;

      if (!symbol || symbol.length === 0) {
        return reply.status(400).send({ error: "Symbol is required" });
      }

      // Fetch the most recent indicators from the database
      // We query the indicators table directly since Storage doesn't expose a getter
      // Use the candle data as a proxy for latest indicator values
      const today = new Date().toISOString().slice(0, 10);
      const watchlist = db.getWatchlist(today);
      const stock = watchlist.find(
        (w) => w.symbol.toUpperCase() === symbol.toUpperCase(),
      );

      const candidates = db.getCandidates(today);
      const candidate = candidates.find(
        (c) => c.symbol.toUpperCase() === symbol.toUpperCase(),
      );

      return {
        symbol: symbol.toUpperCase(),
        watchlist: stock ?? null,
        candidate: candidate ?? null,
      };
    },
  );

  // -----------------------------------------------------------------------
  // POST /api/backtest
  // -----------------------------------------------------------------------

  server.post("/api/backtest", async (request, reply) => {
    const parsed = backtestBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "Invalid backtest parameters",
        details: parsed.error.issues,
      });
    }

    const body = parsed.data;
    const params: BacktestParams = {
      symbols: body.symbols,
      startDate: body.startDate,
      endDate: body.endDate,
      initialBalance: body.initialBalance,
      gapThreshold: body.gapThreshold ?? config.strategy.gapThreshold,
      trendEmaFast: body.trendEmaFast ?? config.strategy.trendEmaFast,
      trendEmaSlow: body.trendEmaSlow ?? config.strategy.trendEmaSlow,
      momentumBodyRatio: body.momentumBodyRatio ?? config.strategy.momentumBodyRatio,
      momentumWickMax: body.momentumWickMax ?? config.strategy.momentumWickMax,
      scaleOut1: body.scaleOut1 ?? config.strategy.scaleOut1,
      scaleOut2: body.scaleOut2 ?? config.strategy.scaleOut2,
      scaleOut3: body.scaleOut3 ?? config.strategy.scaleOut3,
      stopLossBuffer: body.stopLossBuffer ?? config.strategy.stopLossBuffer,
      maxPositions: body.maxPositions ?? config.strategy.maxPositions,
      riskPerTrade: body.riskPerTrade ?? config.strategy.riskPerTrade,
      dailyLossLimit: body.dailyLossLimit ?? config.strategy.dailyLossLimit,
      leverageMultiplier: body.leverageMultiplier,
      timeStopHour: body.timeStopHour ?? config.strategy.timeStopHour,
    };

    try {
      log.info("Starting backtest via API", { symbols: params.symbols.length });
      const result = await runBacktest(params);

      // Persist summary to storage
      db.saveBacktestResult({
        params_json: JSON.stringify(params),
        start_date: params.startDate,
        end_date: params.endDate,
        total_trades: result.metrics.totalTrades,
        win_rate: result.metrics.winRate,
        profit_factor: result.metrics.profitFactor,
        max_drawdown: result.metrics.maxDrawdownPercent,
        sharpe_ratio: result.metrics.sharpeRatio,
        total_pnl: result.metrics.totalPnl,
      });

      return result;
    } catch (err) {
      log.error("Backtest failed", err);
      return reply.status(500).send({
        error: "Backtest execution failed",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  });

  // -----------------------------------------------------------------------
  // GET /api/config
  // -----------------------------------------------------------------------

  server.get("/api/config", async () => {
    return { strategy: config.strategy };
  });

  // -----------------------------------------------------------------------
  // PUT /api/config
  // -----------------------------------------------------------------------

  server.put("/api/config", async (request, reply) => {
    const parsed = configUpdateSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "Invalid config values",
        details: parsed.error.issues,
      });
    }

    const updates = parsed.data;

    // Apply updates to the in-memory config
    for (const [key, value] of Object.entries(updates)) {
      if (value !== undefined) {
        (config.strategy as Record<string, unknown>)[key] = value;
      }
    }

    log.info("Strategy config updated via API", updates);

    return { strategy: config.strategy };
  });

  // -----------------------------------------------------------------------
  // Global error handler
  // -----------------------------------------------------------------------

  server.setErrorHandler((error: Error, _request, reply) => {
    log.error("Unhandled request error", error);
    reply.status(500).send({
      error: "Internal server error",
      message: error.message,
    });
  });

  return server;
}

// ---------------------------------------------------------------------------
// Start server
// ---------------------------------------------------------------------------

export async function startServer(server: FastifyInstance): Promise<void> {
  const port = config.server.port;
  await server.listen({ port, host: "0.0.0.0" });
  log.info(`Server listening on http://0.0.0.0:${port}`);
}
