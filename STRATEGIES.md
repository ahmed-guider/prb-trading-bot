# Trading Strategies

A catalog of day trading strategies we can backtest using our existing infrastructure (S&P 500 screener, 5-min Alpaca data, backtest engine, paper broker).

## Current Status

| # | Strategy | Status | Win Rate | Sharpe | Notes |
|---|----------|--------|----------|--------|-------|
| 0 | PRB (Pre-market Resistance Breakout) | ❌ Failed | 29-41% | -1.61 | Unprofitable across 27 param combos. Designed for 0DTE options, not stocks. |
| 1 | Gap Fade | Planned | — | — | |
| 2 | Gap & Go with VWAP | Planned | — | — | |
| 3 | Earnings Gap Momentum | Planned | — | — | |
| 4 | Opening Range Breakout (ORB) | ✅ Validated OOS | 49% | 1.39 | 4yr +422%, 8971 trades. OOS on 2022-2023 confirmed. |
| 5 | Oversold Bounce | Planned | — | — | |
| 6 | SPY Mean Reversion | Planned | — | — | Top priority |
| 7 | Relative Strength Momentum | Planned | — | — | |
| 8 | First Red Day | Planned | — | — | |

---

## 0. PRB — Pre-market Resistance Breakout (FAILED)

**Source:** [@kadentradess on Instagram](https://www.instagram.com/kadentradess/)

### Rules
- **Universe:** S&P 500 stocks, avg volume > 10M
- **Trend filter:** EMA(20) > EMA(50) on daily, positive slope
- **Pre-market:** Stock gaps up 2%+ while SPY is flat/down
- **Entry:** First 5-min candle at open is a momentum candle (big body, small wick) that breaks above a resistance level
- **Exit:** Scale out at +30%/+50%/+70% on options (≈ 1%/2%/3% stock move)
- **Stop:** Below breakout candle low

### Why It Failed
- Scale-out targets (1-3% stock moves) are almost never hit within the morning session
- Gap-up + breakout candle has a low hit rate (~29%) — most gaps fade
- The strategy only works with 0DTE options leverage where small stock moves = large premium gains
- We would need options pricing simulation (Black-Scholes delta/gamma) to properly test this

### Backtest Results (Sep 2025 - Feb 2026, 20 stocks)
- 17 trades, 29% win rate, -$6,820 P&L, -2.24 Sharpe
- Best param combo (time stop 10 AM): 41% win rate, -$4,072 P&L, -1.61 Sharpe

---

## 1. Gap Fade

**Thesis:** Most gaps fill. Instead of buying the breakout, short the gap-up and profit from the reversion to previous close.

### Rules
- **Universe:** S&P 500 stocks, avg volume > 10M
- **Trend filter:** None (mean reversion works in any trend)
- **Pre-market:** Stock gaps up 2-5% at open (avoid gaps > 5% — those tend to be news-driven and don't fade)
- **Entry:** Short at market open (first 5-min candle close) if the gap is between 2-5%
- **Target:** Previous day's close (full gap fill)
- **Stop:** 1% above the opening price (gap extends further)
- **Time stop:** 12:00 PM ET — close if gap hasn't filled by midday
- **Position size:** 2% risk per trade

### Scale-out
- 50% of position at 50% gap fill
- Remaining 50% at full gap fill or time stop

### Edge
- Academic research shows ~70% of gaps fill within the same trading day on large-cap stocks
- Works best on gaps without a fundamental catalyst (earnings, FDA approval, etc.)
- Avoids catalyst gaps via an earnings calendar filter

### Infrastructure Reuse
- Reuses: screener, gap calculator, 5-min data, paper broker, backtest engine
- New: short selling logic in paper broker, gap fill % tracking

---

## 2. Gap & Go with VWAP

**Thesis:** Gap-ups that hold above VWAP after the first 5 minutes have genuine buying pressure and tend to continue higher. VWAP acts as a dynamic support level.

### Rules
- **Universe:** S&P 500 stocks, avg volume > 10M
- **Trend filter:** Stock in uptrend (EMA 20 > 50 on daily)
- **Pre-market:** Stock gaps up 1.5%+ with relative strength vs SPY
- **VWAP calculation:** Cumulative (price × volume) / cumulative volume, starting from market open
- **Entry:** Buy when price is above VWAP after the first 15 minutes (3 candles). Confirm: first 15-min low stayed above VWAP.
- **Exit:** Sell when a 5-min candle closes below VWAP
- **Stop:** Below the first 15-min low or 1% below entry, whichever is tighter
- **Time stop:** 11:30 AM ET

### Edge
- VWAP is used by institutional traders — price above VWAP = institutional buying
- Filtering for VWAP hold eliminates the fakeout breakouts that killed PRB
- More selective than PRB (fewer trades but higher quality)

### Infrastructure Reuse
- Reuses: screener, gap calculator, trend indicator, 5-min data
- New: VWAP indicator (simple to implement — running sum of price*vol / sum of vol)

---

## 3. Earnings Gap Momentum

**Thesis:** Gaps caused by earnings surprises have fundamentally different behavior than random gaps. A positive earnings surprise with a gap-up has strong follow-through because institutions are repositioning.

### Rules
- **Universe:** S&P 500 stocks reporting earnings that day
- **Filter:** Gap up > 3% on earnings day AND earnings beat consensus estimates
- **Entry:** Buy at open if first 5-min candle is bullish
- **Target:** Hold for 1-3 days (swing trade, not intraday)
- **Stop:** Below the pre-earnings close (the gap-up level)
- **Position size:** 1% risk (wider stop = smaller position)

### Scale-out
- 33% at +3% (day 1)
- 33% at +5% (day 2-3)
- 34% at time stop (3 days)

### Edge
- Earnings gaps have 60-70% follow-through rate (vs ~30% for random gaps)
- Institutional repositioning takes 2-3 days to complete
- Well-documented in academic literature (Post-Earnings Announcement Drift — PEAD)

### Infrastructure Reuse
- Reuses: gap calculator, trend indicator, paper broker
- New: earnings calendar data source (Alpha Vantage or scrape from Yahoo Finance), multi-day holding logic

---

## 4. Opening Range Breakout (ORB) ✅ PROFITABLE

**Thesis:** The first 15-30 minutes of trading establishes a range as buyers and sellers find equilibrium. A breakout from this range with volume indicates directional conviction for the rest of the morning.

### Rules
- **Universe:** SPY, QQQ, and top 10 S&P 500 stocks by volume
- **Opening range:** High and low of the first 30 minutes (9:30-10:00 AM ET, first 6 five-min candles)
- **Entry (Long):** Buy when a 5-min candle closes above the opening range high. Confirm: candle has strong body (> 50% of range) and volume > average.
- **Entry (Short):** Short when a 5-min candle closes below the opening range low. Same confirmation.
- **Stop:** Opposite side of the opening range (buy stop = OR low, short stop = OR high)
- **Target 1:** 1x the opening range width from entry (1R)
- **Target 2:** 2x the opening range width (2R)
- **Target 3:** Hold until time stop
- **Time stop:** 12:00 PM ET

### Scale-out
- 33% at 1R (move stop to breakeven)
- 67% at 2R or time stop

### Position Sizing
- Risk = opening range width x shares
- Size = (account x 2%) / risk per share

### Edge
- One of the most studied intraday strategies with decades of backtesting data
- Works on liquid instruments (SPY, QQQ) with tight spreads
- Mechanical rules — no discretion needed
- The opening range captures overnight information being priced in

### Backtest Results (Sep 2025 - Feb 2026, 14 symbols, 124 trading days)

**Initial sweep (37 combos):**
- Best: OR=30min → +$18,360 (+18.4%), 49% win, Sharpe 2.54, DD 9.3%
- 30-min opening range significantly outperforms 5-min and 15-min
- Short-only has better risk-adjusted returns than long-only

**Focused sweep around OR=30min (46 combos, 39 profitable):**

| Config | Return | Sharpe | Win% | Max DD | Trades |
|--------|--------|--------|------|--------|--------|
| 30m + vol filter 0.8x | +28.6% | 2.90 | 51% | 18.8% | 869 |
| 30m + R=2.0/4.0 (wide targets) | +34.5% | 2.26 | 50% | 11.9% | 702 |
| 30m + time stop 11 AM | +26.2% | 2.61 | 49% | 5.5% | 702 |
| 30m + stop buffer 0.5% | +25.4% | 2.45 | 50% | 10.6% | 710 |
| 30m + short-only | +13.2% | 2.06 | 48% | 5.8% | 407 |
| 30m baseline (R=1.0/2.0) | +12.3% | 2.31 | 50% | 11.6% | 705 |

**Recommended config** (best risk-adjusted): OR=30min, R=1.0/2.0, time stop 11 AM
- +26.2% return, Sharpe 2.61, only 5.5% max drawdown

### Key Insights
- 30-min OR >> 15-min >> 5-min (longer range = better signal quality)
- Lower volume filter (0.8x) improves results (more trades pass, good ones compensate)
- Early time stop (11 AM) dramatically reduces drawdown while preserving most returns
- Short-only has the lowest drawdown (5.8%) — shorts work well in this strategy
- Trend filter slightly hurts performance (reduces trade count without improving win rate)
- Risk per trade and max positions have minimal impact (already near 0 positions open at once with OR=30min)

### Infrastructure Reuse
- Reuses: 5-min data, paper broker, backtest engine, trend indicator
- New: opening range calculation, range width targets, both long AND short logic

---

## 5. Oversold Bounce

**Thesis:** Large-cap S&P 500 stocks that drop significantly in a single day tend to bounce the next day. This is mean reversion at the daily level — institutions buy the dip on quality names.

### Rules
- **Screen (end of day):** Find S&P 500 stocks that closed down > 3% today AND RSI(14) < 30
- **Filter:** Stock must be above the 200-day EMA (long-term uptrend — we're buying a dip, not catching a falling knife)
- **Entry:** Buy at next day's open
- **Target:** +1% from entry price OR previous day's close (whichever is reached first)
- **Stop:** -1.5% from entry price
- **Time stop:** Close at EOD if neither target nor stop hit

### Edge
- Mean reversion on large-caps is one of the most robust edges in quantitative finance
- RSI < 30 filter ensures we're buying genuine oversold conditions
- 200-day EMA filter avoids catching falling knives in bear markets
- Academic research: stocks in the bottom decile of daily returns outperform by 1-2% over the next 5 days

### Expected Performance
- Win rate: 55-65%
- Avg win: +1.0%
- Avg loss: -1.5%
- Profit factor: 1.2-1.5
- Trades: 2-5 per week

### Infrastructure Reuse
- Reuses: screener, daily candles, paper broker, backtest engine
- New: RSI indicator, 200-day EMA check, end-of-day screening (vs pre-market)

---

## 6. SPY Mean Reversion ⭐ TOP PRIORITY

**Thesis:** When SPY drops significantly intraday (> 1% from open), it tends to revert toward VWAP or the opening price by end of day. This is driven by institutional dip-buying and market maker hedging flows.

### Rules
- **Instrument:** SPY only (one ticker, maximum liquidity, tightest spreads)
- **Monitor:** Watch SPY price relative to the day's open
- **Entry trigger:** SPY drops > 1% from the opening price within the first 2 hours (by 11:30 AM ET)
- **Confirmation:** RSI(14) on 5-min chart < 30 (oversold on intraday timeframe)
- **Entry:** Buy at next 5-min candle close after trigger + confirmation
- **Target:** VWAP (dynamic) or opening price (whichever is closer)
- **Stop:** -0.5% below entry
- **Time stop:** 3:45 PM ET (close before market close)

### Position Sizing
- Fixed: 5% of account per trade (liquid instrument, tight stop)
- Or risk-based: account × 2% / (entry - stop)

### Edge
- SPY has the most liquid options market and tightest bid-ask spreads
- Intraday mean reversion on index ETFs is well-documented
- Market makers and institutions provide consistent dip-buying pressure
- Single instrument = massive sample size for backtesting (1 trade per qualifying day)
- No stock-specific risk (earnings, news) — pure market microstructure edge

### Filters
- Skip FOMC announcement days (2 PM ET volatility spike)
- Skip days with VIX > 30 (panic selling can override mean reversion)
- Require drop to happen gradually (not a flash crash — check that drop takes > 30 min)

### Expected Performance
- Win rate: 60-70%
- Avg win: +0.5-0.8%
- Avg loss: -0.5%
- Profit factor: 1.3-1.8
- Trades: 3-5 per week (SPY drops 1%+ from open fairly often)

### Infrastructure Reuse
- Reuses: 5-min data, VWAP (from strategy #2), paper broker, backtest engine
- New: intraday drop detection, RSI on 5-min timeframe, VWAP target

---

## 7. Relative Strength Momentum

**Thesis:** Stocks showing the strongest relative performance vs SPY over the past week tend to continue outperforming in the short term. This is cross-sectional momentum at the daily level.

### Rules
- **Screen (8 AM ET daily):** Rank all S&P 500 stocks by 5-day return minus SPY 5-day return
- **Select:** Top 3 stocks by relative strength
- **Entry:** Buy at open (equal weight across 3 positions)
- **Exit:** Hold until end of day. Sell any stock that loses its top-10 RS ranking during the day (optional intraday rebalance).
- **Rebalance:** Daily — sell yesterday's picks, buy today's top 3

### Edge
- Momentum is the most documented factor in finance (Jegadeesh & Titman, 1993)
- Short-term (1-week) momentum on large-caps has a positive expected return
- Diversified across 3 stocks reduces single-name risk
- Mechanical rotation removes emotional decision-making

### Expected Performance
- Win rate: 52-55% per trade
- But positive expectancy due to winners being larger than losers
- Sharpe: 0.5-1.0 (modest but consistent)

### Infrastructure Reuse
- Reuses: screener, daily candles, paper broker
- New: relative strength ranking, daily rotation logic

---

## 8. First Red Day

**Thesis:** Stocks on a multi-day winning streak that have their first down day attract dip buyers. The pullback is shallow and the trend resumes.

### Rules
- **Screen (end of day):** Find S&P 500 stocks that were green for 3+ consecutive days and just had their first red day (close < open)
- **Filter:** Stock must still be above the 5-day EMA (the pullback is shallow, not a reversal)
- **Filter:** The red day's volume should be lower than the average of the green days (selling pressure is weak)
- **Entry:** Buy at next day's open
- **Target:** Previous high (the high of the last green day before the red day)
- **Stop:** Below the red day's low
- **Time stop:** 3 trading days

### Edge
- Trend continuation after shallow pullbacks is a robust pattern
- Low-volume red days indicate profit-taking, not distribution
- Works best in bull markets and uptrending stocks
- Simple to code and backtest

### Expected Performance
- Win rate: 55-60%
- Avg win: +1.5-2%
- Avg loss: -1%
- Trades: 2-4 per week

### Infrastructure Reuse
- Reuses: screener, daily candles, paper broker, EMA indicator
- New: consecutive green day counter, volume comparison logic, multi-day holding

---

## Implementation Priority

Based on ease of implementation (reuses existing code), backtesting sample size, and academic evidence:

1. **ORB (#4)** — Most studied strategy, works on SPY/QQQ, both long and short
2. **SPY Mean Reversion (#6)** — Single ticker, huge sample size, well-documented edge
3. **Gap Fade (#1)** — Direct inverse of PRB, reuses almost all existing code
4. **Oversold Bounce (#5)** — Simple mean reversion, strong academic backing
5. **Gap & Go with VWAP (#2)** — Improved version of PRB with VWAP filter
6. **First Red Day (#8)** — Simple trend continuation
7. **Relative Strength Momentum (#7)** — Daily rotation strategy
8. **Earnings Gap Momentum (#3)** — Requires earnings calendar data source
