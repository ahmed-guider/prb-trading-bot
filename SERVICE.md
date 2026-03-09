# Service Management

The ORB trading bot runs as two macOS launchd services that start automatically on login.

## Services

| Service | Port | Plist |
|---------|------|-------|
| Backend (API + trading bot) | 3001 | `~/Library/LaunchAgents/com.orb-trading-bot.backend.plist` |
| Dashboard (React UI) | 5173 | `~/Library/LaunchAgents/com.orb-trading-bot.dashboard.plist` |

## Access

- **Dashboard (local):** http://localhost:5173
- **Dashboard (Tailscale):** http://100.68.159.76:5173
- **API (local):** http://localhost:3001/api/health
- **API (Tailscale):** http://100.68.159.76:3001/api/health

## API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /api/health` | Bot status, strategy info |
| `GET /api/orb-status` | Live ORB state (opening ranges, breakouts, positions) |
| `GET /api/positions` | Current open positions + cash balance |
| `GET /api/trades` | Trade history (query params: symbol, status, date, limit) |
| `GET /api/stats` | Performance stats (P&L, win rate, Sharpe, drawdown) |
| `GET /api/config` | Current strategy config |
| `PUT /api/config` | Update strategy parameters |
| `POST /api/backtest` | Run a backtest with custom parameters |

## Trading Schedule (ET, weekdays only)

| Time (ET) | Time (UK) | Action |
|-----------|-----------|--------|
| 10:00 AM | 3:00 PM | Calculate 30-min opening ranges for 14 symbols |
| 10:05-11:55 AM | 3:05-4:55 PM | Scan for breakouts every 5 min, manage positions |
| 12:00 PM | 5:00 PM | Time stop — close all remaining positions |
| 4:00 PM | 9:00 PM | End of day cleanup, reset for next day |

## Manage Services

```bash
# Check if running
launchctl list | grep orb

# Stop both
launchctl unload ~/Library/LaunchAgents/com.orb-trading-bot.backend.plist
launchctl unload ~/Library/LaunchAgents/com.orb-trading-bot.dashboard.plist

# Start both
launchctl load ~/Library/LaunchAgents/com.orb-trading-bot.backend.plist
launchctl load ~/Library/LaunchAgents/com.orb-trading-bot.dashboard.plist

# Restart both
launchctl unload ~/Library/LaunchAgents/com.orb-trading-bot.backend.plist
launchctl load ~/Library/LaunchAgents/com.orb-trading-bot.backend.plist
launchctl unload ~/Library/LaunchAgents/com.orb-trading-bot.dashboard.plist
launchctl load ~/Library/LaunchAgents/com.orb-trading-bot.dashboard.plist
```

## Logs

```bash
# Backend logs
tail -f ~/prb-trading-bot/logs/backend.log
tail -f ~/prb-trading-bot/logs/backend.error.log

# Dashboard logs
tail -f ~/prb-trading-bot/logs/dashboard.log
tail -f ~/prb-trading-bot/logs/dashboard.error.log
```

## Strategy

**Opening Range Breakout (ORB)** — validated on 4 years of out-of-sample data.

- **Config:** OR=30min, R=1.5/3.0, time stop 12 PM ET
- **Symbols:** SPY, QQQ, AAPL, MSFT, GOOG, AMZN, NVDA, META, TSLA, AMD, NFLX, AVGO, CRM, PLTR
- **4-year result:** +422%, Sharpe 1.39, 8,971 trades, 49% win rate, 29.6% max drawdown
- **Paper trading:** $100,000 starting balance, 2% risk per trade

Full strategy details: [`strategies/01-orb-profitable.md`](strategies/01-orb-profitable.md)

## Manual Dev Mode

If you prefer to run manually instead of as a service:

```bash
# Terminal 1 — Backend
cd ~/prb-trading-bot
npm run dev

# Terminal 2 — Dashboard
cd ~/prb-trading-bot/dashboard
npm run dev
```
