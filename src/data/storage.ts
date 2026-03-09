import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createLogger } from "../logger.js";

const logger = createLogger("storage");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.DB_PATH ?? path.join(__dirname, "../../data/prb.db");

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Candle {
  symbol: string;
  timeframe: string;
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface WatchlistStock {
  symbol: string;
  avg_volume: number;
  ema_fast: number;
  ema_slow: number;
  in_uptrend: boolean;
}

export interface WatchlistRow extends WatchlistStock {
  date: string;
  added_at: string;
}

export interface Candidate {
  symbol: string;
  gap_percent: number;
  premarket_high: number;
  prev_close: number;
  resistance_level: number;
  spy_change: number;
  is_valid: boolean;
}

export interface CandidateRow extends Candidate {
  date: string;
  created_at: string;
}

export interface Trade {
  id?: number;
  symbol: string;
  date: string;
  entry_time: string;
  entry_price: number;
  stop_loss: number;
  target_1: number;
  target_2: number;
  target_3: number;
  scale_out_1_time?: string | null;
  scale_out_1_price?: number | null;
  scale_out_2_time?: string | null;
  scale_out_2_price?: number | null;
  scale_out_3_time?: string | null;
  scale_out_3_price?: number | null;
  exit_time?: string | null;
  exit_price?: number | null;
  exit_reason?: "target" | "stop" | "time_stop" | "manual" | null;
  position_size: number;
  pnl?: number | null;
  pnl_percent?: number | null;
  status: "open" | "closed";
}

export interface TradeFilters {
  symbol?: string;
  date?: string;
  status?: "open" | "closed";
  from?: string;
  to?: string;
}

export interface BacktestResult {
  id?: number;
  params_json: string;
  start_date: string;
  end_date: string;
  total_trades: number;
  win_rate: number;
  profit_factor: number;
  max_drawdown: number;
  sharpe_ratio: number;
  total_pnl: number;
  created_at?: string;
}

// ---------------------------------------------------------------------------
// Storage class
// ---------------------------------------------------------------------------

class Storage {
  private db: Database.Database;

  // Prepared statements
  private stmts!: {
    insertCandle: Database.Statement;
    selectCandles: Database.Statement;
    selectCandlesFrom: Database.Statement;
    selectCandlesTo: Database.Statement;
    selectCandlesRange: Database.Statement;
    insertWatchlist: Database.Statement;
    selectWatchlist: Database.Statement;
    insertCandidate: Database.Statement;
    selectCandidates: Database.Statement;
    insertTrade: Database.Statement;
    selectTradeById: Database.Statement;
    selectOpenTrades: Database.Statement;
    setState: Database.Statement;
    getState: Database.Statement;
    insertBacktest: Database.Statement;
    selectBacktests: Database.Statement;
    insertIndicator: Database.Statement;
  };

  constructor(dbPath: string = DB_PATH) {
    // Ensure parent directory exists
    const dir = path.dirname(dbPath);
    fs.mkdirSync(dir, { recursive: true });

    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");

    logger.info(`Database opened at ${dbPath}`);

    this.createTables();
    this.prepareStatements();
  }

  // -- Schema ---------------------------------------------------------------

  private createTables(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS candles (
        symbol     TEXT    NOT NULL,
        timeframe  TEXT    NOT NULL,
        timestamp  INTEGER NOT NULL,
        open       REAL    NOT NULL,
        high       REAL    NOT NULL,
        low        REAL    NOT NULL,
        close      REAL    NOT NULL,
        volume     REAL    NOT NULL,
        UNIQUE(symbol, timeframe, timestamp)
      );

      CREATE TABLE IF NOT EXISTS watchlist (
        date       TEXT NOT NULL,
        symbol     TEXT NOT NULL,
        avg_volume REAL NOT NULL,
        ema_fast   REAL NOT NULL,
        ema_slow   REAL NOT NULL,
        in_uptrend INTEGER NOT NULL DEFAULT 0,
        added_at   TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(date, symbol)
      );

      CREATE TABLE IF NOT EXISTS candidates (
        date             TEXT    NOT NULL,
        symbol           TEXT    NOT NULL,
        gap_percent      REAL    NOT NULL,
        premarket_high   REAL    NOT NULL,
        prev_close       REAL    NOT NULL,
        resistance_level REAL    NOT NULL,
        spy_change       REAL    NOT NULL,
        is_valid         INTEGER NOT NULL DEFAULT 0,
        created_at       TEXT    NOT NULL DEFAULT (datetime('now')),
        UNIQUE(date, symbol)
      );

      CREATE TABLE IF NOT EXISTS trades (
        id               INTEGER PRIMARY KEY AUTOINCREMENT,
        symbol           TEXT    NOT NULL,
        date             TEXT    NOT NULL,
        entry_time       TEXT    NOT NULL,
        entry_price      REAL    NOT NULL,
        stop_loss        REAL    NOT NULL,
        target_1         REAL    NOT NULL,
        target_2         REAL    NOT NULL,
        target_3         REAL    NOT NULL,
        scale_out_1_time  TEXT,
        scale_out_1_price REAL,
        scale_out_2_time  TEXT,
        scale_out_2_price REAL,
        scale_out_3_time  TEXT,
        scale_out_3_price REAL,
        exit_time        TEXT,
        exit_price       REAL,
        exit_reason      TEXT CHECK(exit_reason IN ('target','stop','time_stop','manual')),
        position_size    REAL    NOT NULL,
        pnl              REAL,
        pnl_percent      REAL,
        status           TEXT    NOT NULL DEFAULT 'open' CHECK(status IN ('open','closed'))
      );

      CREATE TABLE IF NOT EXISTS indicators (
        symbol         TEXT    NOT NULL,
        timestamp      INTEGER NOT NULL,
        indicator_name TEXT    NOT NULL,
        value          REAL    NOT NULL,
        UNIQUE(symbol, timestamp, indicator_name)
      );

      CREATE TABLE IF NOT EXISTS bot_state (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS backtest_results (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        params_json   TEXT    NOT NULL,
        start_date    TEXT    NOT NULL,
        end_date      TEXT    NOT NULL,
        total_trades  INTEGER NOT NULL,
        win_rate      REAL    NOT NULL,
        profit_factor REAL    NOT NULL,
        max_drawdown  REAL    NOT NULL,
        sharpe_ratio  REAL    NOT NULL,
        total_pnl     REAL    NOT NULL,
        created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_candles_lookup
        ON candles(symbol, timeframe, timestamp);

      CREATE INDEX IF NOT EXISTS idx_trades_status
        ON trades(status);

      CREATE INDEX IF NOT EXISTS idx_trades_date
        ON trades(date);

      CREATE INDEX IF NOT EXISTS idx_indicators_lookup
        ON indicators(symbol, timestamp);
    `);

    logger.info("Tables and indexes ensured");
  }

  // -- Prepared statements --------------------------------------------------

  private prepareStatements(): void {
    this.stmts = {
      insertCandle: this.db.prepare(`
        INSERT INTO candles (symbol, timeframe, timestamp, open, high, low, close, volume)
        VALUES (@symbol, @timeframe, @timestamp, @open, @high, @low, @close, @volume)
        ON CONFLICT(symbol, timeframe, timestamp) DO UPDATE SET
          open=excluded.open, high=excluded.high, low=excluded.low,
          close=excluded.close, volume=excluded.volume
      `),

      selectCandles: this.db.prepare(`
        SELECT * FROM candles WHERE symbol = ? AND timeframe = ? ORDER BY timestamp ASC
      `),
      selectCandlesFrom: this.db.prepare(`
        SELECT * FROM candles WHERE symbol = ? AND timeframe = ? AND timestamp >= ? ORDER BY timestamp ASC
      `),
      selectCandlesTo: this.db.prepare(`
        SELECT * FROM candles WHERE symbol = ? AND timeframe = ? AND timestamp <= ? ORDER BY timestamp ASC
      `),
      selectCandlesRange: this.db.prepare(`
        SELECT * FROM candles WHERE symbol = ? AND timeframe = ? AND timestamp >= ? AND timestamp <= ? ORDER BY timestamp ASC
      `),

      insertWatchlist: this.db.prepare(`
        INSERT INTO watchlist (date, symbol, avg_volume, ema_fast, ema_slow, in_uptrend)
        VALUES (@date, @symbol, @avg_volume, @ema_fast, @ema_slow, @in_uptrend)
        ON CONFLICT(date, symbol) DO UPDATE SET
          avg_volume=excluded.avg_volume, ema_fast=excluded.ema_fast,
          ema_slow=excluded.ema_slow, in_uptrend=excluded.in_uptrend
      `),
      selectWatchlist: this.db.prepare(`
        SELECT * FROM watchlist WHERE date = ?
      `),

      insertCandidate: this.db.prepare(`
        INSERT INTO candidates (date, symbol, gap_percent, premarket_high, prev_close, resistance_level, spy_change, is_valid)
        VALUES (@date, @symbol, @gap_percent, @premarket_high, @prev_close, @resistance_level, @spy_change, @is_valid)
        ON CONFLICT(date, symbol) DO UPDATE SET
          gap_percent=excluded.gap_percent, premarket_high=excluded.premarket_high,
          prev_close=excluded.prev_close, resistance_level=excluded.resistance_level,
          spy_change=excluded.spy_change, is_valid=excluded.is_valid
      `),
      selectCandidates: this.db.prepare(`
        SELECT * FROM candidates WHERE date = ?
      `),

      insertTrade: this.db.prepare(`
        INSERT INTO trades (symbol, date, entry_time, entry_price, stop_loss, target_1, target_2, target_3, position_size, status)
        VALUES (@symbol, @date, @entry_time, @entry_price, @stop_loss, @target_1, @target_2, @target_3, @position_size, 'open')
      `),
      selectTradeById: this.db.prepare(`
        SELECT * FROM trades WHERE id = ?
      `),
      selectOpenTrades: this.db.prepare(`
        SELECT * FROM trades WHERE status = 'open'
      `),

      setState: this.db.prepare(`
        INSERT INTO bot_state (key, value) VALUES (?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value
      `),
      getState: this.db.prepare(`
        SELECT value FROM bot_state WHERE key = ?
      `),

      insertBacktest: this.db.prepare(`
        INSERT INTO backtest_results (params_json, start_date, end_date, total_trades, win_rate, profit_factor, max_drawdown, sharpe_ratio, total_pnl)
        VALUES (@params_json, @start_date, @end_date, @total_trades, @win_rate, @profit_factor, @max_drawdown, @sharpe_ratio, @total_pnl)
      `),
      selectBacktests: this.db.prepare(`
        SELECT * FROM backtest_results ORDER BY created_at DESC
      `),

      insertIndicator: this.db.prepare(`
        INSERT INTO indicators (symbol, timestamp, indicator_name, value)
        VALUES (@symbol, @timestamp, @indicator_name, @value)
        ON CONFLICT(symbol, timestamp, indicator_name) DO UPDATE SET value = excluded.value
      `),
    };
  }

  // -- Candles --------------------------------------------------------------

  saveCandles(candles: Candle[]): void {
    const insert = this.db.transaction((rows: Candle[]) => {
      for (const c of rows) {
        this.stmts.insertCandle.run(c);
      }
    });
    insert(candles);
    logger.debug(`Saved ${candles.length} candles`);
  }

  getCandles(symbol: string, timeframe: string, from?: number, to?: number): Candle[] {
    if (from !== undefined && to !== undefined) {
      return this.stmts.selectCandlesRange.all(symbol, timeframe, from, to) as Candle[];
    }
    if (from !== undefined) {
      return this.stmts.selectCandlesFrom.all(symbol, timeframe, from) as Candle[];
    }
    if (to !== undefined) {
      return this.stmts.selectCandlesTo.all(symbol, timeframe, to) as Candle[];
    }
    return this.stmts.selectCandles.all(symbol, timeframe) as Candle[];
  }

  // -- Watchlist ------------------------------------------------------------

  saveWatchlist(date: string, stocks: WatchlistStock[]): void {
    const insert = this.db.transaction((rows: WatchlistStock[]) => {
      for (const s of rows) {
        this.stmts.insertWatchlist.run({
          date,
          symbol: s.symbol,
          avg_volume: s.avg_volume,
          ema_fast: s.ema_fast,
          ema_slow: s.ema_slow,
          in_uptrend: s.in_uptrend ? 1 : 0,
        });
      }
    });
    insert(stocks);
    logger.debug(`Saved ${stocks.length} watchlist entries for ${date}`);
  }

  getWatchlist(date: string): WatchlistRow[] {
    const rows = this.stmts.selectWatchlist.all(date) as Array<
      Omit<WatchlistRow, "in_uptrend"> & { in_uptrend: number }
    >;
    return rows.map((r) => ({ ...r, in_uptrend: r.in_uptrend === 1 }));
  }

  // -- Candidates -----------------------------------------------------------

  saveCandidates(date: string, candidates: Candidate[]): void {
    const insert = this.db.transaction((rows: Candidate[]) => {
      for (const c of rows) {
        this.stmts.insertCandidate.run({
          date,
          symbol: c.symbol,
          gap_percent: c.gap_percent,
          premarket_high: c.premarket_high,
          prev_close: c.prev_close,
          resistance_level: c.resistance_level,
          spy_change: c.spy_change,
          is_valid: c.is_valid ? 1 : 0,
        });
      }
    });
    insert(candidates);
    logger.debug(`Saved ${candidates.length} candidates for ${date}`);
  }

  getCandidates(date: string): CandidateRow[] {
    const rows = this.stmts.selectCandidates.all(date) as Array<
      Omit<CandidateRow, "is_valid"> & { is_valid: number }
    >;
    return rows.map((r) => ({ ...r, is_valid: r.is_valid === 1 }));
  }

  // -- Trades ---------------------------------------------------------------

  openTrade(trade: Omit<Trade, "id" | "status">): number {
    const info = this.stmts.insertTrade.run({
      symbol: trade.symbol,
      date: trade.date,
      entry_time: trade.entry_time,
      entry_price: trade.entry_price,
      stop_loss: trade.stop_loss,
      target_1: trade.target_1,
      target_2: trade.target_2,
      target_3: trade.target_3,
      position_size: trade.position_size,
    });
    const id = Number(info.lastInsertRowid);
    logger.info(`Opened trade #${id} ${trade.symbol}`, trade);
    return id;
  }

  updateTrade(id: number, updates: Partial<Trade>): void {
    const allowed = [
      "stop_loss", "target_1", "target_2", "target_3",
      "scale_out_1_time", "scale_out_1_price",
      "scale_out_2_time", "scale_out_2_price",
      "scale_out_3_time", "scale_out_3_price",
      "exit_time", "exit_price", "exit_reason",
      "position_size", "pnl", "pnl_percent", "status",
    ];

    const entries = Object.entries(updates).filter(([k]) => allowed.includes(k));
    if (entries.length === 0) return;

    const setClauses = entries.map(([k]) => `${k} = @${k}`).join(", ");
    const params: Record<string, unknown> = { id };
    for (const [k, v] of entries) {
      params[k] = v;
    }

    this.db.prepare(`UPDATE trades SET ${setClauses} WHERE id = @id`).run(params);
    logger.debug(`Updated trade #${id}`, updates);
  }

  closeTrade(
    id: number,
    exitData: {
      exit_time: string;
      exit_price: number;
      exit_reason: Trade["exit_reason"];
      pnl: number;
      pnl_percent: number;
    },
  ): void {
    this.updateTrade(id, { ...exitData, status: "closed" });
    logger.info(`Closed trade #${id}`, exitData);
  }

  getTrades(filters?: TradeFilters): Trade[] {
    const conditions: string[] = [];
    const params: Record<string, unknown> = {};

    if (filters?.symbol) {
      conditions.push("symbol = @symbol");
      params.symbol = filters.symbol;
    }
    if (filters?.date) {
      conditions.push("date = @date");
      params.date = filters.date;
    }
    if (filters?.status) {
      conditions.push("status = @status");
      params.status = filters.status;
    }
    if (filters?.from) {
      conditions.push("date >= @from_date");
      params.from_date = filters.from;
    }
    if (filters?.to) {
      conditions.push("date <= @to_date");
      params.to_date = filters.to;
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    return this.db
      .prepare(`SELECT * FROM trades ${where} ORDER BY entry_time DESC`)
      .all(params) as Trade[];
  }

  getOpenTrades(): Trade[] {
    return this.stmts.selectOpenTrades.all() as Trade[];
  }

  // -- Bot state ------------------------------------------------------------

  setState(key: string, value: string): void {
    this.stmts.setState.run(key, value);
  }

  getState(key: string): string | undefined {
    const row = this.stmts.getState.get(key) as { value: string } | undefined;
    return row?.value;
  }

  // -- Backtest results -----------------------------------------------------

  saveBacktestResult(result: Omit<BacktestResult, "id" | "created_at">): number {
    const info = this.stmts.insertBacktest.run(result);
    const id = Number(info.lastInsertRowid);
    logger.info(`Saved backtest result #${id}`);
    return id;
  }

  getBacktestResults(): BacktestResult[] {
    return this.stmts.selectBacktests.all() as BacktestResult[];
  }

  // -- Indicators -----------------------------------------------------------

  saveIndicator(symbol: string, timestamp: number, name: string, value: number): void {
    this.stmts.insertIndicator.run({ symbol, timestamp, indicator_name: name, value });
  }

  // -- Lifecycle ------------------------------------------------------------

  close(): void {
    this.db.close();
    logger.info("Database closed");
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

export const db = new Storage();
