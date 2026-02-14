type LogLevel = "debug" | "info" | "warn" | "error";

const LOG_LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function resolveLogLevel(value: string | undefined): LogLevel {
  if (!value) return "debug";
  const normalized = value.toLowerCase();
  if (normalized === "debug") return "debug";
  if (normalized === "info") return "info";
  if (normalized === "warn") return "warn";
  if (normalized === "error") return "error";
  return "debug";
}

export function createLogger(scope: string) {
  const minLevel = resolveLogLevel(process.env.PI_RELAY_LOG_LEVEL);

  const shouldLog = (level: LogLevel): boolean => {
    return LOG_LEVEL_ORDER[level] >= LOG_LEVEL_ORDER[minLevel];
  };

  const format = (level: LogLevel, message: string): string => {
    return `[${level}] [${scope}] ${message}`;
  };

  return {
    debug(message: string): void {
      if (!shouldLog("debug")) return;
      console.debug(format("debug", message));
    },
    info(message: string): void {
      if (!shouldLog("info")) return;
      console.info(format("info", message));
    },
    warn(message: string): void {
      if (!shouldLog("warn")) return;
      console.warn(format("warn", message));
    },
    error(message: string): void {
      if (!shouldLog("error")) return;
      console.error(format("error", message));
    },
  };
}
