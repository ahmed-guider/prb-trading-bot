import { Activity, Clock, DollarSign } from "lucide-react";
import { useApi } from "../hooks/useApi";

interface HealthResponse {
  status: string;
  timestamp: string;
}

interface PositionsResponse {
  count: number;
  balance: number;
}

const styles = {
  bar: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "8px 20px",
    background: "#141620",
    borderBottom: "1px solid #2d3348",
    fontSize: 13,
    color: "#8b92a5",
  } as React.CSSProperties,
  left: {
    display: "flex",
    alignItems: "center",
    gap: 16,
  } as React.CSSProperties,
  right: {
    display: "flex",
    alignItems: "center",
    gap: 16,
  } as React.CSSProperties,
  statusDot: (ok: boolean) =>
    ({
      width: 8,
      height: 8,
      borderRadius: "50%",
      background: ok ? "#22c55e" : "#ef4444",
      display: "inline-block",
      marginRight: 6,
      boxShadow: ok ? "0 0 6px #22c55e88" : "0 0 6px #ef444488",
    }) as React.CSSProperties,
  item: {
    display: "flex",
    alignItems: "center",
    gap: 5,
  } as React.CSSProperties,
};

export default function BotStatusBar() {
  const { data: health } = useApi<HealthResponse>("/api/health", 5000);
  const { data: positions } = useApi<PositionsResponse>("/api/positions", 5000);

  const isOk = health?.status === "ok";
  const lastUpdate = health?.timestamp
    ? new Date(health.timestamp).toLocaleTimeString()
    : "--";

  return (
    <div style={styles.bar}>
      <div style={styles.left}>
        <div style={styles.item}>
          <span style={styles.statusDot(isOk)} />
          <Activity size={14} />
          <span>{isOk ? "Connected" : "Disconnected"}</span>
        </div>
        <div style={styles.item}>
          <Clock size={14} />
          <span>Last update: {lastUpdate}</span>
        </div>
      </div>
      <div style={styles.right}>
        <div style={styles.item}>
          <DollarSign size={14} />
          <span style={{ color: "#e1e4e8" }}>
            Balance: ${positions?.balance?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) ?? "--"}
          </span>
        </div>
        <div style={styles.item}>
          <span>Positions: {positions?.count ?? 0}</span>
        </div>
      </div>
    </div>
  );
}
