import { useState } from "react";
import { BarChart3, FlaskConical, Settings } from "lucide-react";
import { useApi } from "./hooks/useApi";
import type { Stats, Trade } from "./types";
import BotStatusBar from "./components/BotStatusBar";
import StatsCards from "./components/StatsCards";
import WatchlistPanel from "./components/WatchlistPanel";
import LiveTradesPanel from "./components/LiveTradesPanel";
import TradeTable from "./components/TradeTable";
import PriceChart from "./components/PriceChart";
import BacktestPanel from "./components/BacktestPanel";
import SettingsPanel from "./components/SettingsPanel";

type Tab = "live" | "backtest" | "settings";

const tabs: { key: Tab; label: string; icon: typeof BarChart3 }[] = [
  { key: "live", label: "Live", icon: BarChart3 },
  { key: "backtest", label: "Backtest", icon: FlaskConical },
  { key: "settings", label: "Settings", icon: Settings },
];

const styles = {
  app: {
    minHeight: "100vh",
    background: "#0f1117",
    color: "#e1e4e8",
  } as React.CSSProperties,
  tabBar: {
    display: "flex",
    gap: 0,
    borderBottom: "1px solid #2d3348",
    background: "#141620",
    padding: "0 20px",
  } as React.CSSProperties,
  tab: (active: boolean) =>
    ({
      display: "flex",
      alignItems: "center",
      gap: 6,
      padding: "12px 20px",
      fontSize: 13,
      fontWeight: 500,
      color: active ? "#e1e4e8" : "#8b92a5",
      background: "none",
      border: "none",
      borderBottom: active ? "2px solid #3b82f6" : "2px solid transparent",
      cursor: "pointer",
      transition: "all 0.15s",
    }) as React.CSSProperties,
  content: {
    padding: 20,
    maxWidth: 1400,
    margin: "0 auto",
  } as React.CSSProperties,
  title: {
    fontSize: 20,
    fontWeight: 700,
    color: "#e1e4e8",
    margin: "0 0 20px 0",
    display: "flex",
    alignItems: "center",
    gap: 10,
  } as React.CSSProperties,
  logo: {
    width: 28,
    height: 28,
    borderRadius: 6,
    background: "linear-gradient(135deg, #3b82f6, #22c55e)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 14,
    fontWeight: 800,
    color: "#fff",
  } as React.CSSProperties,
};

function LiveTab() {
  const { data: stats } = useApi<Stats>("/api/stats", 10000);
  const { data: tradesData } = useApi<{ count: number; trades: Trade[] }>(
    "/api/trades?limit=100&status=closed",
    15000,
  );

  const trades = tradesData?.trades ?? [];

  // Build equity curve from closed trades
  const equityData: { date: string; value: number }[] = [];
  if (stats && trades.length > 0) {
    const initial = stats.currentBalance - stats.totalPnl;
    let cumulative = initial;
    const sorted = [...trades]
      .filter((t) => t.exit_time)
      .sort((a, b) => (a.exit_time ?? "").localeCompare(b.exit_time ?? ""));
    for (const t of sorted) {
      cumulative += t.pnl ?? 0;
      equityData.push({
        date: t.date,
        value: cumulative,
      });
    }
  }

  return (
    <>
      {stats && (
        <StatsCards
          totalPnl={stats.totalPnl}
          winRate={stats.winRate}
          totalTrades={stats.totalTrades}
          profitFactor={stats.profitFactor}
          maxDrawdownPercent={stats.maxDrawdownPercent}
          sharpeRatio={stats.sharpeRatio}
        />
      )}
      <LiveTradesPanel />
      {equityData.length > 0 && (
        <PriceChart
          data={equityData}
          title="Equity Curve"
          color={stats && stats.totalPnl >= 0 ? "green" : "red"}
        />
      )}
      <WatchlistPanel />
      <TradeTable trades={trades} />
    </>
  );
}

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>("live");

  return (
    <div style={styles.app}>
      <BotStatusBar />
      <div style={styles.tabBar}>
        <div style={styles.title}>
          <div style={styles.logo}>P</div>
          PRB Trading Bot
        </div>
        <div style={{ flex: 1 }} />
        {tabs.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.key}
              style={styles.tab(activeTab === t.key)}
              onClick={() => setActiveTab(t.key)}
            >
              <Icon size={15} />
              {t.label}
            </button>
          );
        })}
      </div>
      <div style={styles.content}>
        {activeTab === "live" && <LiveTab />}
        {activeTab === "backtest" && <BacktestPanel />}
        {activeTab === "settings" && <SettingsPanel />}
      </div>
    </div>
  );
}
