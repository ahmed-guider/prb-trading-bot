# PRB Trading Bot — Implementation Plan

## Strategy Overview

**PRB (Pre-market Resistance Breakout)** — a day trading strategy that finds S&P 500 stocks gapping up in pre-market within an established uptrend, then trades the breakout of a key resistance level at market open using 0DTE options. Sourced from [@kadentradess](https://www.instagram.com/kadentradess/).

### Strategy Rules
1. **Universe**: S&P 500 stocks with avg volume > 10M
2. **Trend Filter**: Stock must be in a confirmed uptrend on daily/weekly timeframe
3. **Pre-market Gap**: Stock gaps up 2%+ in pre-market while SPY is flat/down (relative strength)
4. **Resistance Level**: Identify a key resistance level on 5-min chart (multiple prior rejections)
5. **Entry**: First 5-min candle at open breaks resistance with a momentum candle (big body, small wick)
6. **Position**: 0DTE call options (for paper trading, we'll simulate with delta-adjusted stock positions)
7. **Exit**: Scale out at +30%, +50%, +70% profit targets
8. **Stop Loss**: Below the breakout candle low

---

## Architecture (Mirrors crypto-pairs-trading-bot)

```
prb-trading-bot/
├── src/                              # Backend (TypeScript + Fastify)
│   ├── index.ts                     # Entry point — scheduler
│   ├── server.ts                    # Fastify API server
│   ├── config.ts                    # Zod config validation
│   ├── logger.ts                    # Logging
│   │
│   ├── data/                        # Data Layer
│   │   ├── market-data.ts           # Fetch OHLCV, pre-market data (Alpaca/Polygon)
│   │   ├── screener.ts              # S&P 500 stock screener (volume, trend filter)
│   │   └── storage.ts              # SQLite persistence
│   │
│   ├── indicators/                  # Technical Indicators
│   │   ├── trend.ts                # Uptrend detection (EMA slope, higher highs/lows)
│   │   ├── resistance.ts           # Resistance level identification (pivot points)
│   │   ├── gap.ts                  # Pre-market gap calculation
│   │   └── candle-patterns.ts      # Momentum candle detection (body/wick ratio)
│   │
│   ├── strategy/                    # Strategy Logic
│   │   ├── screener-pipeline.ts    # Daily: screen universe → watchlist
│   │   ├── premarket-scanner.ts    # Pre-market: scan watchlist for gap-ups
│   │   ├── entry-signals.ts        # At open: detect breakout + momentum candle
│   │   ├── exit-manager.ts         # Scale-out logic (30/50/70% targets)
│   │   └── risk.ts                 # Position sizing, stop loss, max daily loss
│   │
│   ├── execution/                   # Paper Trading Execution
│   │   ├── paper-broker.ts         # Simulated order execution + P&L tracking
│   │   └── alpaca-broker.ts        # Alpaca paper trading API (real paper money)
│   │
│   ├── backtest/                    # Backtesting Engine
│   │   ├── engine.ts               # Core backtest loop (replay historical data)
│   │   ├── data-loader.ts          # Load historical 5-min + daily candles
│   │   ├── metrics.ts              # Win rate, Sharpe, max drawdown, profit factor
│   │   └── sweep.ts               # Parameter optimization sweep
│   │
│   └── reporting/                   # Analysis & Reporting
│       ├── trade-journal.ts        # Detailed trade log with entry/exit reasons
│       └── stats.ts                # Aggregate performance statistics
│
├── dashboard/                       # Frontend (React + Vite)
│   ├── src/
│   │   ├── App.tsx                 # Main app — tabs layout
│   │   ├── components/
│   │   │   ├── WatchlistPanel.tsx   # Today's screened stocks + gap status
│   │   │   ├── LiveTradesPanel.tsx  # Active positions with scale-out progress
│   │   │   ├── PriceChart.tsx       # 5-min chart with resistance levels drawn
│   │   │   ├── BacktestPanel.tsx    # Run backtests, adjust params
│   │   │   ├── BacktestResults.tsx  # Equity curve, trade table, metrics
│   │   │   ├── StatsCards.tsx       # Win rate, P&L, Sharpe, streak
│   │   │   ├── TradeJournal.tsx     # Historical trade log with filters
│   │   │   └── SettingsPanel.tsx    # Strategy parameter tuning
│   │   ├── hooks/
│   │   │   └── useApi.ts          # Polling + API helpers
│   │   └── types/
│   │       └── index.ts
│   └── vite.config.ts
│
├── tests/                           # Testing
│   ├── unit/
│   │   ├── indicators/
│   │   │   ├── trend.test.ts       # Uptrend detection edge cases
│   │   │   ├── resistance.test.ts  # Resistance level accuracy
│   │   │   ├── gap.test.ts         # Gap calculation correctness
│   │   │   └── candle-patterns.test.ts
│   │   ├── strategy/
│   │   │   ├── screener.test.ts    # Screener filtering logic
│   │   │   ├── entry-signals.test.ts
│   │   │   └── exit-manager.test.ts # Scale-out logic
│   │   └── execution/
│   │       └── paper-broker.test.ts # Order fill simulation
│   │
│   ├── integration/
│   │   ├── backtest-engine.test.ts  # Full backtest on known data
│   │   └── api-endpoints.test.ts    # API contract tests
│   │
│   └── fixtures/                    # Sample market data for tests
│       ├── gap-up-breakout.json    # Known profitable setup
│       ├── gap-up-fakeout.json     # Known failed breakout
│       └── no-gap.json             # Filtered out stock
│
├── package.json
├── tsconfig.json
├── .env.example
└── PLAN.md
```

---

## Tech Stack

| Layer | Technology | Reason |
|-------|-----------|--------|
| Backend | TypeScript + Fastify | Matches crypto bot, fast, typed |
| Database | SQLite (better-sqlite3) | Simple, no setup, portable |
| Market Data | Alpaca API (free) | Free 5-min historical + real-time pre-market data |
| Backup Data | Polygon.io (free tier) | Historical intraday candles for backtesting |
| Paper Trading | Alpaca Paper API | Real paper money simulation with market hours |
| Frontend | React 19 + Vite | Matches crypto bot |
| Charts | Recharts + lightweight-charts | Recharts for stats, TradingView charts for price action |
| Testing | Vitest | Fast, native TS support, Vite-compatible |
| Validation | Zod | Runtime config validation |

---

## Implementation Phases

### Phase 1: Data Layer + Indicators (Week 1)
- [ ] Project scaffolding (package.json, tsconfig, Vite, Vitest)
- [ ] Alpaca API integration — fetch daily candles + 5-min intraday
- [ ] S&P 500 universe list (static JSON, updated periodically)
- [ ] Indicator: **Uptrend detection** — EMA(20) > EMA(50) on daily, positive slope
- [ ] Indicator: **Resistance level finder** — Identify horizontal levels with 2+ touches on 5-min
- [ ] Indicator: **Gap calculator** — Compare previous close to pre-market high
- [ ] Indicator: **Momentum candle detector** — Body > 70% of total range, upper wick < 15%
- [ ] SQLite storage schema (candles, trades, indicators, watchlist)
- [ ] Unit tests for all indicators with fixture data

### Phase 2: Strategy Logic (Week 2)
- [ ] **Screener pipeline** — Each morning at 8:00 AM ET:
  - Filter S&P 500 by avg volume > 10M
  - Filter by daily uptrend (EMA crossover + higher highs)
  - Output: daily watchlist (typically 30-60 stocks)
- [ ] **Pre-market scanner** — 8:00–9:30 AM ET:
  - Monitor watchlist for 2%+ gap-ups
  - Check SPY is flat/down (relative strength confirmation)
  - Identify resistance levels on 5-min chart
  - Output: trade candidates (typically 1-5 stocks)
- [ ] **Entry signal generator** — 9:30 AM ET:
  - Watch first 5-min candle on each candidate
  - Confirm breakout above resistance with momentum candle
  - Generate BUY signal with entry price, stop loss, targets
- [ ] **Exit manager**:
  - Scale out: sell 33% at +30%, 33% at +50%, 34% at +70%
  - Hard stop: below breakout candle low
  - Time stop: close any remaining position by 11:00 AM ET (morning momentum fades)
- [ ] **Risk manager**:
  - Max 3 positions simultaneously
  - Max 2% of account per trade
  - Daily loss limit: 5% of account → stop trading for the day
- [ ] Unit tests for strategy logic

### Phase 3: Backtesting Engine (Week 3)
- [ ] Historical data loader — download 6-12 months of 5-min data for S&P 500 top stocks
- [ ] Backtest engine — replay each trading day:
  - Run screener on historical daily data
  - Simulate pre-market gap detection
  - Simulate entry/exit at historical prices
  - Track slippage estimate (0.05% per trade)
- [ ] Metrics calculation:
  - Win rate, avg win/loss, profit factor
  - Max drawdown, Sharpe ratio, Sortino ratio
  - Avg trades/day, avg holding time
  - Monthly/weekly P&L breakdown
- [ ] Parameter sweep — optimize:
  - Gap threshold (1%, 1.5%, 2%, 2.5%, 3%)
  - Scale-out levels (20/40/60 vs 30/50/70 vs fixed exit)
  - Trend filter strictness (EMA periods, slope threshold)
  - Momentum candle definition (body %, wick %)
  - Time stop (10:30, 11:00, 11:30, EOD)
- [ ] Generate backtest report with trade-by-trade breakdown

### Phase 4: Paper Trading (Week 4)
- [ ] Alpaca paper trading integration
- [ ] Live scheduler — cron jobs for each phase of the trading day:
  - 8:00 AM ET: Run screener
  - 8:00–9:25 AM: Scan pre-market gaps
  - 9:30 AM: Monitor for entry signals
  - 9:30–11:00 AM: Manage exits
  - 4:00 PM: End-of-day reconciliation
- [ ] Paper broker with realistic fill simulation
- [ ] Real-time logging + alerts (console + SQLite)

### Phase 5: Dashboard UI (Week 4-5)
- [ ] Dashboard layout (3 tabs: Live / Backtest / Settings)
- [ ] **Live tab**:
  - Today's watchlist with gap status (green/red indicators)
  - Active positions with live P&L and scale-out progress bars
  - 5-min price chart with resistance levels and entry/exit markers
  - Daily stats cards (trades, win rate, P&L)
- [ ] **Backtest tab**:
  - Date range picker + parameter inputs
  - Run backtest button → progress bar
  - Results: equity curve, trade table, metrics summary
  - Parameter sweep heatmap
- [ ] **Settings tab**:
  - All strategy parameters with live update
  - Broker connection status
  - Toggle paper/backtest mode

### Phase 6: Testing & Validation (Week 5)
- [ ] Integration tests — full backtest on known periods
- [ ] Validate against known setups (manually verified PRB trades)
- [ ] Paper trade for 2 weeks minimum, compare to backtest expectations
- [ ] Document findings — does the strategy actually work?

---

## Key Design Decisions

### Why Alpaca?
- Free tier with paper trading
- Real pre-market data (4:00 AM ET)
- REST + WebSocket APIs
- No PDT rule on paper accounts

### Options Simulation
Since we're paper trading and backtesting, we won't trade actual 0DTE options. Instead:
- **Backtest**: Use delta-adjusted stock returns (multiply stock % move by ~5x to simulate ATM call delta + gamma)
- **Paper trading**: Use leveraged stock positions on Alpaca as a proxy
- If results are promising, Phase 7 would integrate a real options broker (Tradier, TD Ameritrade)

### Pre-market Data Challenge
Pre-market volume is thin and data can be spotty. Mitigation:
- Use Alpaca's extended hours data
- Require minimum pre-market volume threshold
- Cross-reference with Polygon.io for data quality

### Resistance Level Detection
This is the hardest part to automate accurately. Approach:
- Find price levels where 5-min candles have 3+ touches (within 0.2% tolerance)
- Weight recent touches more heavily
- Validate with volume clustering at the level
- Allow manual override in the UI for live trading

---

## API Endpoints

```
GET  /api/watchlist          → Today's screened stocks
GET  /api/candidates         → Pre-market gap-up candidates
GET  /api/positions          → Active paper positions
GET  /api/trades             → Historical trades
GET  /api/stats              → Performance metrics
GET  /api/indicators/:symbol → Indicator data for a symbol
POST /api/backtest           → Run backtest with params
GET  /api/backtest/:id       → Get backtest results
GET  /api/config             → Current strategy config
PUT  /api/config             → Update strategy config
```

---

## Environment Variables

```bash
# Alpaca
ALPACA_API_KEY=your_paper_key
ALPACA_API_SECRET=your_paper_secret
ALPACA_PAPER=true

# Polygon (optional, for historical data)
POLYGON_API_KEY=your_key

# Strategy Defaults
GAP_THRESHOLD=2.0
TREND_EMA_FAST=20
TREND_EMA_SLOW=50
MOMENTUM_BODY_RATIO=0.7
MOMENTUM_WICK_MAX=0.15
SCALE_OUT_1=30
SCALE_OUT_2=50
SCALE_OUT_3=70
STOP_LOSS_BUFFER=0.002
MAX_POSITIONS=3
RISK_PER_TRADE=0.02
DAILY_LOSS_LIMIT=0.05
TIME_STOP_HOUR=11

# Server
PORT=3001
```

---

## Success Criteria

Before going live with real money, the strategy must demonstrate:
- [ ] **Backtest win rate > 60%** over 6+ months of data
- [ ] **Profit factor > 1.5** (gross profit / gross loss)
- [ ] **Max drawdown < 15%**
- [ ] **Paper trading matches backtest** within reasonable variance (2 weeks minimum)
- [ ] **Sharpe ratio > 1.0**

---

## Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| Overfitting to historical data | Out-of-sample testing, walk-forward analysis |
| Pre-market data quality | Multiple data sources, volume filters |
| Resistance detection inaccuracy | Manual validation, adjustable sensitivity |
| 0DTE options simulation ≠ reality | Delta/gamma modeling, plan for real options broker later |
| Slippage at market open | Conservative fill assumptions (0.1% slippage) |
| Strategy decay over time | Monthly performance review, parameter re-optimization |
