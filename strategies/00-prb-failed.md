# PRB — Pre-market Resistance Breakout

**Status:** FAILED
**Tested:** Sep 2025 - Feb 2026 | 20 stocks | 27 parameter combos

## Strategy

**Source:** [@kadentradess on Instagram](https://www.instagram.com/kadentradess/)

**Thesis:** Stocks that gap up 2%+ while SPY is flat/down, with EMA(20) > EMA(50) uptrend, will break through resistance on the first candle. Scale out at 1-3% stock moves.

### Entry Rules
- Universe: S&P 500 stocks, avg volume > 10M
- Trend filter: EMA(20) > EMA(50) on daily, positive slope
- Pre-market: Stock gaps up 2%+ while SPY is flat/down
- Entry: First 5-min candle at open is a momentum candle (big body, small wick) that breaks above resistance
- Stop: Below breakout candle low

### Exit Rules
- Scale out at +1% / +2% / +3% stock moves (designed for 0DTE options: +30%/+50%/+70%)
- Time stop: 10-14 hours after open

## Backtest Results

### Best Result
| Metric | Value |
|--------|-------|
| Trades | 17 |
| Win Rate | 41% |
| Total P&L | -$4,072 |
| Sharpe | -1.61 |

### Sweep Summary (27 combos)
- All combos unprofitable
- Win rate range: 29-41%
- Sharpe range: -2.24 to -1.61
- Best P&L: -$4,072 (time stop 10 AM)
- Worst P&L: -$6,820

### Parameter Sweep

| Parameter | Values Tested | Best |
|-----------|---------------|------|
| Gap threshold | 1.0%, 1.5%, 2.0%, 2.5% | 1.0% |
| Scale-out targets | 0.3/0.5/1.0 to 1.0/2.0/3.0 | 0.3/0.5/1.0 |
| Momentum body ratio | 40%, 50%, 60% | 40% |
| Momentum wick max | 20%, 30%, 35% | 35% |
| Time stop | 10 AM, 11 AM, 12 PM, 2 PM | 10 AM |
| Stop loss buffer | 0.1%, 0.2%, 0.5%, 1.0% | 0.5% |
| Risk per trade | 1%, 2%, 3%, 5% | 1% |

## Why It Failed

1. **Designed for options, not stocks.** The original strategy targets 30-70% gains on 0DTE options, which correspond to only 1-3% stock moves. Without options leverage (10-50x), the stock moves are too small to overcome the stop losses.

2. **Gap-up + breakout has low hit rate (~29%).** Most gaps fade within the first hour. The "momentum candle" filter doesn't reliably distinguish real breakouts from fakeouts.

3. **Scale-out targets almost never reached.** In a 6-month test on 20 stocks, 1-3% intraday moves above the gap are rare for large-cap stocks.

4. **Would need options pricing simulation** (Black-Scholes delta/gamma) to properly test the intended strategy. Our stock-only backtest infrastructure can't replicate the true risk/reward.

## Files
- Engine: `src/backtest/engine.ts`
- Sweep runner: `src/backtest/sweep-run.ts`
- Indicators: `src/indicators/gap.ts`, `src/indicators/trend.ts`, `src/indicators/momentum.ts`
