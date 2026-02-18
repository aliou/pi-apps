import pino from "pino";

const isDevelopment = process.env.NODE_ENV !== "production";

function resolveLogLevel(): string {
  const value = process.env.PI_RELAY_LOG_LEVEL ?? process.env.LOG_LEVEL;
  if (!value) return isDevelopment ? "debug" : "info";
  const normalized = value.toLowerCase();
  if (["trace", "debug", "info", "warn", "error", "fatal"].includes(normalized))
    return normalized;
  return isDevelopment ? "debug" : "info";
}

/**
 * Root pino logger instance.
 * - JSON output in production for log aggregators.
 * - Pretty-printed, colorized output in development.
 * - Redacts sensitive fields to prevent credential leaks.
 */
export const rootLogger = pino({
  level: resolveLogLevel(),
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: {
    paths: [
      "password",
      "token",
      "apiKey",
      "apiToken",
      "secret",
      "authorization",
      "req.headers.authorization",
      "req.headers.cookie",
    ],
    censor: "[REDACTED]",
  },
  transport: isDevelopment
    ? {
        target: "pino-pretty",
        options: {
          colorize: true,
          ignore: "pid,hostname",
          translateTime: "HH:MM:ss.l",
        },
      }
    : undefined,
});

/**
 * Create a scoped child logger.
 * All log entries include the scope field for filtering.
 *
 * Usage:
 *   const logger = createLogger("docker");
 *   logger.info({ containerId }, "container started");
 */
export function createLogger(scope: string): pino.Logger {
  return rootLogger.child({ scope });
}
