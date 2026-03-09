import {
  TrendingUp,
  TrendingDown,
  Target,
  BarChart3,
  ArrowDownRight,
  Activity,
} from "lucide-react";
import type { ReactNode } from "react";

interface StatItem {
  label: string;
  value: string;
  color?: string;
  icon: ReactNode;
}

interface StatsCardsProps {
  totalPnl: number;
  winRate: number;
  totalTrades: number;
  profitFactor: number;
  maxDrawdownPercent: number;
  sharpeRatio: number;
}

const styles = {
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: 12,
    marginBottom: 20,
  } as React.CSSProperties,
  card: {
    background: "#1a1d27",
    border: "1px solid #2d3348",
    borderRadius: 10,
    padding: "16px 18px",
    display: "flex",
    flexDirection: "column",
    gap: 8,
  } as React.CSSProperties,
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  } as React.CSSProperties,
  label: {
    fontSize: 12,
    color: "#8b92a5",
    textTransform: "uppercase",
    letterSpacing: "0.5px",
  } as React.CSSProperties,
  value: (color: string) =>
    ({
      fontSize: 24,
      fontWeight: 700,
      color,
      letterSpacing: "-0.5px",
    }) as React.CSSProperties,
};

function StatCard({ label, value, color = "#e1e4e8", icon }: StatItem) {
  return (
    <div style={styles.card}>
      <div style={styles.header}>
        <span style={styles.label}>{label}</span>
        <span style={{ color: "#8b92a5" }}>{icon}</span>
      </div>
      <span style={styles.value(color)}>{value}</span>
    </div>
  );
}

export default function StatsCards({
  totalPnl,
  winRate,
  totalTrades,
  profitFactor,
  maxDrawdownPercent,
  sharpeRatio,
}: StatsCardsProps) {
  const pnlColor = totalPnl >= 0 ? "#22c55e" : "#ef4444";
  const pnlIcon =
    totalPnl >= 0 ? <TrendingUp size={18} /> : <TrendingDown size={18} />;
  const pnlStr =
    (totalPnl >= 0 ? "+$" : "-$") +
    Math.abs(totalPnl).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  const cards: StatItem[] = [
    {
      label: "Total P&L",
      value: pnlStr,
      color: pnlColor,
      icon: pnlIcon,
    },
    {
      label: "Win Rate",
      value: `${(winRate * 100).toFixed(1)}%`,
      color: winRate >= 0.5 ? "#22c55e" : "#ef4444",
      icon: <Target size={18} />,
    },
    {
      label: "Total Trades",
      value: String(totalTrades),
      icon: <BarChart3 size={18} />,
    },
    {
      label: "Profit Factor",
      value: profitFactor === Infinity ? "Inf" : profitFactor.toFixed(2),
      color: profitFactor >= 1.5 ? "#22c55e" : profitFactor >= 1 ? "#eab308" : "#ef4444",
      icon: <Activity size={18} />,
    },
    {
      label: "Max Drawdown",
      value: `${maxDrawdownPercent.toFixed(2)}%`,
      color: "#ef4444",
      icon: <ArrowDownRight size={18} />,
    },
    {
      label: "Sharpe Ratio",
      value: sharpeRatio.toFixed(2),
      color: sharpeRatio >= 1.5 ? "#22c55e" : sharpeRatio >= 1 ? "#eab308" : "#ef4444",
      icon: <TrendingUp size={18} />,
    },
  ];

  return (
    <div style={styles.grid}>
      {cards.map((c) => (
        <StatCard key={c.label} {...c} />
      ))}
    </div>
  );
}
