import { config } from "../config.js";
import { createLogger } from "../logger.js";

const log = createLogger("alpaca-broker");

const TRADING_BASE_URL = "https://paper-api.alpaca.markets";

const RATE_LIMIT_MAX_RETRIES = 3;
const RATE_LIMIT_BASE_DELAY_MS = 1000;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AlpacaOrder {
  id: string;
  client_order_id: string;
  status: string;
  symbol: string;
  qty: string;
  filled_qty: string;
  filled_avg_price: string | null;
  side: "buy" | "sell";
  type: string;
  time_in_force: string;
  created_at: string;
  updated_at: string;
  submitted_at: string;
  filled_at: string | null;
}

export interface AlpacaPosition {
  asset_id: string;
  symbol: string;
  exchange: string;
  avg_entry_price: string;
  qty: string;
  side: string;
  market_value: string;
  cost_basis: string;
  unrealized_pl: string;
  unrealized_plpc: string;
  current_price: string;
  lastday_price: string;
  change_today: string;
}

export interface AlpacaAccount {
  id: string;
  account_number: string;
  status: string;
  currency: string;
  buying_power: string;
  cash: string;
  portfolio_value: string;
  equity: string;
  last_equity: string;
  long_market_value: string;
  short_market_value: string;
  daytrade_count: number;
  pattern_day_trader: boolean;
  trading_blocked: boolean;
  account_blocked: boolean;
}

// ---------------------------------------------------------------------------
// Auth helper
// ---------------------------------------------------------------------------

function authHeaders(): Record<string, string> {
  return {
    "APCA-API-KEY-ID": config.alpaca.apiKey,
    "APCA-API-SECRET-KEY": config.alpaca.apiSecret,
    "Content-Type": "application/json",
  };
}

// ---------------------------------------------------------------------------
// Low-level fetch helper for trading API
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function tradingFetch(
  path: string,
  options: {
    method?: string;
    body?: unknown;
  } = {},
): Promise<any> {
  const url = `${TRADING_BASE_URL}${path}`;
  const method = options.method ?? "GET";

  for (let attempt = 0; attempt <= RATE_LIMIT_MAX_RETRIES; attempt++) {
    const fetchOptions: RequestInit = {
      method,
      headers: authHeaders(),
    };

    if (options.body !== undefined) {
      fetchOptions.body = JSON.stringify(options.body);
    }

    const res = await fetch(url, fetchOptions);

    if (res.status === 429) {
      const delay = RATE_LIMIT_BASE_DELAY_MS * Math.pow(2, attempt);
      log.warn(
        `Rate limited on ${method} ${path}, retrying in ${delay}ms ` +
        `(attempt ${attempt + 1}/${RATE_LIMIT_MAX_RETRIES})`,
      );
      await sleep(delay);
      continue;
    }

    // 204 No Content (e.g., successful DELETE)
    if (res.status === 204) {
      return null;
    }

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Alpaca Trading API error ${res.status} on ${method} ${path}: ${body}`);
    }

    return res.json();
  }

  throw new Error(
    `Alpaca Trading API rate limit exceeded after ${RATE_LIMIT_MAX_RETRIES} retries on ${method} ${path}`,
  );
}

// ---------------------------------------------------------------------------
// AlpacaBroker
// ---------------------------------------------------------------------------

export class AlpacaBroker {
  constructor() {
    log.info("AlpacaBroker initialized (paper trading)");
  }

  // -------------------------------------------------------------------------
  // Submit a market order
  // -------------------------------------------------------------------------

  async submitOrder(
    symbol: string,
    qty: number,
    side: "buy" | "sell",
  ): Promise<AlpacaOrder> {
    log.info(`Submitting ${side} order: ${symbol} x${qty}`);

    const order = await tradingFetch("/v2/orders", {
      method: "POST",
      body: {
        symbol,
        qty: String(qty),
        side,
        type: "market",
        time_in_force: "day",
      },
    });

    log.info(
      `Order submitted: ${order.id} ${order.symbol} ${order.side} ${order.qty} ` +
      `status=${order.status}`,
    );

    return order as AlpacaOrder;
  }

  // -------------------------------------------------------------------------
  // Get current positions
  // -------------------------------------------------------------------------

  async getPositions(): Promise<AlpacaPosition[]> {
    const positions = await tradingFetch("/v2/positions");
    log.debug(`Fetched ${positions.length} positions`);
    return positions as AlpacaPosition[];
  }

  // -------------------------------------------------------------------------
  // Get position for a specific symbol
  // -------------------------------------------------------------------------

  async getPosition(symbol: string): Promise<AlpacaPosition | null> {
    try {
      const position = await tradingFetch(
        `/v2/positions/${encodeURIComponent(symbol)}`,
      );
      return position as AlpacaPosition;
    } catch (err: any) {
      // 404 means no position for this symbol
      if (err.message?.includes("404")) {
        return null;
      }
      throw err;
    }
  }

  // -------------------------------------------------------------------------
  // Close a position (full or partial)
  // -------------------------------------------------------------------------

  async closePosition(symbol: string, qty?: number): Promise<void> {
    const path = `/v2/positions/${encodeURIComponent(symbol)}`;
    const url = qty !== undefined ? `${path}?qty=${qty}` : path;

    log.info(
      `Closing position: ${symbol}` + (qty !== undefined ? ` (qty=${qty})` : " (full)"),
    );

    await tradingFetch(url, { method: "DELETE" });

    log.info(`Position closed: ${symbol}`);
  }

  // -------------------------------------------------------------------------
  // Get account info
  // -------------------------------------------------------------------------

  async getAccount(): Promise<AlpacaAccount> {
    const account = await tradingFetch("/v2/account");
    log.debug(
      `Account: equity=$${account.equity} cash=$${account.cash} ` +
      `buying_power=$${account.buying_power}`,
    );
    return account as AlpacaAccount;
  }

  // -------------------------------------------------------------------------
  // Get order status
  // -------------------------------------------------------------------------

  async getOrder(orderId: string): Promise<AlpacaOrder> {
    const order = await tradingFetch(`/v2/orders/${encodeURIComponent(orderId)}`);
    return order as AlpacaOrder;
  }

  // -------------------------------------------------------------------------
  // Cancel an order
  // -------------------------------------------------------------------------

  async cancelOrder(orderId: string): Promise<void> {
    log.info(`Cancelling order: ${orderId}`);
    await tradingFetch(`/v2/orders/${encodeURIComponent(orderId)}`, {
      method: "DELETE",
    });
    log.info(`Order cancelled: ${orderId}`);
  }
}
