type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const LEVEL_COLORS: Record<LogLevel, string> = {
  debug: "\x1b[90m",  // gray
  info: "\x1b[36m",   // cyan
  warn: "\x1b[33m",   // yellow
  error: "\x1b[31m",  // red
};

const RESET = "\x1b[0m";

let minLevel: LogLevel = (process.env.LOG_LEVEL as LogLevel) ?? "info";

export function setLogLevel(level: LogLevel): void {
  minLevel = level;
}

function formatTimestamp(): string {
  return new Date().toISOString();
}

function shouldLog(level: LogLevel): boolean {
  return LEVEL_PRIORITY[level] >= LEVEL_PRIORITY[minLevel];
}

function write(level: LogLevel, category: string, message: string, data?: unknown): void {
  if (!shouldLog(level)) return;

  const ts = formatTimestamp();
  const color = LEVEL_COLORS[level];
  const tag = level.toUpperCase().padEnd(5);
  const prefix = `${color}${ts} [${tag}] [${category}]${RESET}`;

  if (data !== undefined) {
    const serialized = typeof data === "object" ? JSON.stringify(data) : String(data);
    console.log(`${prefix} ${message} ${serialized}`);
  } else {
    console.log(`${prefix} ${message}`);
  }
}

export interface Logger {
  debug(message: string, data?: unknown): void;
  info(message: string, data?: unknown): void;
  warn(message: string, data?: unknown): void;
  error(message: string, data?: unknown): void;
}

export function createLogger(category: string): Logger {
  return {
    debug: (message, data?) => write("debug", category, message, data),
    info: (message, data?) => write("info", category, message, data),
    warn: (message, data?) => write("warn", category, message, data),
    error: (message, data?) => write("error", category, message, data),
  };
}
