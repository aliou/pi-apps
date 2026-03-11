import { AsyncLocalStorage } from "node:async_hooks";
import type { Context } from "hono";
import pino from "pino";

const isDevelopment = process.env.NODE_ENV !== "production";
const requestContext = new AsyncLocalStorage<{ requestId?: string }>();

function resolveLogLevel(): string {
  const value = process.env.PI_RELAY_LOG_LEVEL ?? process.env.LOG_LEVEL;
  if (!value) return isDevelopment ? "debug" : "info";
  const normalized = value.toLowerCase();
  if (["trace", "debug", "info", "warn", "error", "fatal"].includes(normalized))
    return normalized;
  return isDevelopment ? "debug" : "info";
}

export const rootLogger = pino({
  level: resolveLogLevel(),
  timestamp: pino.stdTimeFunctions.isoTime,
  mixin() {
    return requestContext.getStore() ?? {};
  },
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

export function createLogger(scope: string): pino.Logger {
  return rootLogger.child({ scope });
}

export function getRequestLogger(c: Context, scope: string): pino.Logger {
  const requestLogger = c.get("logger") as pino.Logger | undefined;
  return (requestLogger ?? rootLogger).child({ scope });
}

export async function withRequestContext<T>(
  requestId: string | undefined,
  fn: () => Promise<T>,
): Promise<T> {
  return requestContext.run({ requestId }, fn);
}
