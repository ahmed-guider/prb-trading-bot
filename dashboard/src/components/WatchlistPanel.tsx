import { useState, useMemo } from "react";
import { CheckCircle, XCircle, ArrowUpDown } from "lucide-react";
import { useApi } from "../hooks/useApi";
import type { WatchlistStock, Candidate } from "../types";

interface WatchlistResponse {
  date: string;
  count: number;
  watchlist: WatchlistStock[];
}

interface CandidatesResponse {
  date: string;
  count: number;
  candidates: Candidate[];
}

type SortKey = "symbol" | "avg_volume" | "ema_fast" | "ema_slow" | "in_uptrend" | "gap_percent";
type SortDir = "asc" | "desc";

const styles = {
  container: {
    background: "#1a1d27",
    border: "1px solid #2d3348",
    borderRadius: 10,
    overflow: "hidden",
    marginBottom: 20,
  } as React.CSSProperties,
  header: {
    padding: "14px 18px",
    borderBottom: "1px solid #2d3348",
    fontSize: 14,
    fontWeight: 600,
    color: "#e1e4e8",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  } as React.CSSProperties,
  badge: {
    background: "#3b82f622",
    color: "#3b82f6",
    padding: "2px 8px",
    borderRadius: 6,
    fontSize: 12,
    fontWeight: 500,
  } as React.CSSProperties,
  table: {
    width: "100%",
    borderCollapse: "collapse" as const,
    fontSize: 13,
  } as React.CSSProperties,
  th: {
    textAlign: "left" as const,
    padding: "10px 14px",
    color: "#8b92a5",
    fontWeight: 500,
    fontSize: 11,
    textTransform: "uppercase" as const,
    letterSpacing: "0.5px",
    borderBottom: "1px solid #2d3348",
    cursor: "pointer",
    userSelect: "none" as const,
  } as React.CSSProperties,
  td: {
    padding: "10px 14px",
    borderBottom: "1px solid #2d334822",
    color: "#e1e4e8",
  } as React.CSSProperties,
  candidateRow: {
    borderLeft: "3px solid #3b82f6",
  } as React.CSSProperties,
  empty: {
    padding: 30,
    textAlign: "center" as const,
    color: "#8b92a5",
    fontSize: 13,
  } as React.CSSProperties,
};

export default function WatchlistPanel() {
  const { data: wlData, loading: wlLoad } = useApi<WatchlistResponse>("/api/watchlist", 15000);
  const { data: candData } = useApi<CandidatesResponse>("/api/candidates", 15000);

  const [sortKey, setSortKey] = useState<SortKey>("symbol");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const candidateMap = useMemo(() => {
    const map = new Map<string, Candidate>();
    candData?.candidates.forEach((c) => map.set(c.symbol, c));
    return map;
  }, [candData]);

  const sorted = useMemo(() => {
    if (!wlData?.watchlist) return [];
    const items = [...wlData.watchlist];
    items.sort((a, b) => {
      let cmp = 0;
      if (sortKey === "symbol") cmp = a.symbol.localeCompare(b.symbol);
      else if (sortKey === "avg_volume") cmp = a.avg_volume - b.avg_volume;
      else if (sortKey === "ema_fast") cmp = a.ema_fast - b.ema_fast;
      else if (sortKey === "ema_slow") cmp = a.ema_slow - b.ema_slow;
      else if (sortKey === "in_uptrend") cmp = Number(a.in_uptrend) - Number(b.in_uptrend);
      else if (sortKey === "gap_percent") {
        const ga = candidateMap.get(a.symbol)?.gap_percent ?? -Infinity;
        const gb = candidateMap.get(b.symbol)?.gap_percent ?? -Infinity;
        cmp = ga - gb;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return items;
  }, [wlData, sortKey, sortDir, candidateMap]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  function ThCell({ label, field }: { label: string; field: SortKey }) {
    return (
      <th style={styles.th} onClick={() => toggleSort(field)}>
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
          {label}
          <ArrowUpDown size={11} style={{ opacity: sortKey === field ? 1 : 0.3 }} />
        </span>
      </th>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span>Today&apos;s Watchlist</span>
        <span style={styles.badge}>
          {wlData?.count ?? 0} stocks &middot; {candData?.count ?? 0} candidates
        </span>
      </div>
      {wlLoad ? (
        <div style={styles.empty}>Loading watchlist...</div>
      ) : sorted.length === 0 ? (
        <div style={styles.empty}>No stocks in today&apos;s watchlist</div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={styles.table}>
            <thead>
              <tr>
                <ThCell label="Symbol" field="symbol" />
                <ThCell label="Avg Volume" field="avg_volume" />
                <ThCell label="EMA Fast" field="ema_fast" />
                <ThCell label="EMA Slow" field="ema_slow" />
                <ThCell label="Uptrend" field="in_uptrend" />
                <ThCell label="Gap %" field="gap_percent" />
              </tr>
            </thead>
            <tbody>
              {sorted.map((stock) => {
                const cand = candidateMap.get(stock.symbol);
                return (
                  <tr
                    key={stock.symbol}
                    style={cand ? styles.candidateRow : undefined}
                  >
                    <td style={{ ...styles.td, fontWeight: 600, color: cand ? "#3b82f6" : "#e1e4e8" }}>
                      {stock.symbol}
                    </td>
                    <td style={styles.td}>
                      {(stock.avg_volume / 1_000_000).toFixed(2)}M
                    </td>
                    <td style={styles.td}>${stock.ema_fast.toFixed(2)}</td>
                    <td style={styles.td}>${stock.ema_slow.toFixed(2)}</td>
                    <td style={styles.td}>
                      {stock.in_uptrend ? (
                        <CheckCircle size={16} color="#22c55e" />
                      ) : (
                        <XCircle size={16} color="#ef4444" />
                      )}
                    </td>
                    <td style={{ ...styles.td, color: cand ? "#22c55e" : "#8b92a5" }}>
                      {cand ? `+${cand.gap_percent.toFixed(2)}%` : "--"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
