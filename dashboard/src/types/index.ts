// ---------------------------------------------------------------------------
// Watchlist & Candidates
// ---------------------------------------------------------------------------

export interface WatchlistStock {
  symbol: string;
  avg_volume: number;
  ema_fast: number;
  ema_slow: number;
  in_uptrend: boolean;
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

// ---------------------------------------------------------------------------
// Trades & Positions
// ---------------------------------------------------------------------------

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

export interface Position {
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

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------

export interface Stats {
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  avgWin: number;
  avgLoss: number;
  profitFactor: number;
  totalPnl: number;
  totalPnlPercent: number;
  maxDrawdown: number;
  maxDrawdownPercent: number;
  sharpeRatio: number;
  bestTrade: number;
  worstTrade: number;
  maxConsecutiveWins: number;
  maxConsecutiveLosses: number;
  currentBalance: number;
  daily: {
    trades: number;
    wins: number;
    losses: number;
    pnl: number;
    pnlPercent: number;
  };
}

// ---------------------------------------------------------------------------
// Backtest
// ---------------------------------------------------------------------------

export interface BacktestParams {
  symbols: string[];
  startDate: string;
  endDate: string;
  initialBalance: number;
  gapThreshold?: number;
  trendEmaFast?: number;
  trendEmaSlow?: number;
  momentumBodyRatio?: number;
  momentumWickMax?: number;
  scaleOut1?: number;
  scaleOut2?: number;
  scaleOut3?: number;
  stopLossBuffer?: number;
  maxPositions?: number;
  riskPerTrade?: number;
  dailyLossLimit?: number;
  leverageMultiplier?: number;
  timeStopHour?: number;
}

export interface BacktestTradeResult {
  symbol: string;
  date: string;
  entryTime: string;
  entryPrice: number;
  exitTime: string;
  exitPrice: number;
  pnl: number;
  pnlPercent: number;
  exitReason: string;
  holdingMinutes: number;
}

export interface BacktestMetrics {
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  avgWin: number;
  avgLoss: number;
  profitFactor: number;
  totalPnl: number;
  totalPnlPercent: number;
  maxDrawdown: number;
  maxDrawdownPercent: number;
  sharpeRatio: number;
  sortinoRatio: number;
  avgHoldingMinutes: number;
  avgTradesPerDay: number;
  bestTrade: number;
  worstTrade: number;
  maxConsecutiveWins: number;
  maxConsecutiveLosses: number;
  calmarRatio: number;
}

export interface BacktestResult {
  params: BacktestParams;
  trades: BacktestTradeResult[];
  metrics: BacktestMetrics;
  equityCurve: EquityPoint[];
  dailyReturns: DailyReturn[];
}

export interface EquityPoint {
  date: string;
  equity: number;
}

export interface DailyReturn {
  date: string;
  pnl: number;
  trades: number;
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export interface Config {
  strategy: {
    gapThreshold: number;
    trendEmaFast: number;
    trendEmaSlow: number;
    momentumBodyRatio: number;
    momentumWickMax: number;
    scaleOut1: number;
    scaleOut2: number;
    scaleOut3: number;
    stopLossBuffer: number;
    maxPositions: number;
    riskPerTrade: number;
    dailyLossLimit: number;
    timeStopHour: number;
  };
}
