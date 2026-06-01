export type LogLevel = "error" | "warn" | "info" | "debug";

export type LogContext = Record<string, unknown>;

export type Logger = {
  error: (message: string, context?: LogContext, error?: unknown) => void;
  warn: (message: string, context?: LogContext, error?: unknown) => void;
  info: (message: string, context?: LogContext) => void;
  debug: (message: string, context?: LogContext) => void;
  child: (context: LogContext) => Logger;
};

const LOG_LEVELS: Record<LogLevel, number> = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

const FALLBACK_LEVEL: LogLevel =
  process.env.NODE_ENV === "development" ? "debug" : "info";

function parseLogLevel(value: string | undefined): LogLevel {
  if (
    value === "error" ||
    value === "warn" ||
    value === "info" ||
    value === "debug"
  ) {
    return value;
  }

  return FALLBACK_LEVEL;
}

function configuredLevel(): LogLevel {
  return parseLogLevel(
    typeof window === "undefined"
      ? process.env.SHOPSTR_LOG_LEVEL
      : process.env.NEXT_PUBLIC_SHOPSTR_LOG_LEVEL
  );
}

function normalizeError(error: unknown): LogContext | undefined {
  if (error === undefined) return undefined;

  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }

  return { message: String(error) };
}

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] <= LOG_LEVELS[configuredLevel()];
}

function writeLog(
  level: LogLevel,
  message: string,
  context: LogContext = {},
  error?: unknown
): void {
  if (!shouldLog(level)) return;

  const payload = {
    ...context,
    level,
    ts: new Date().toISOString(),
    msg: message,
    ...(error === undefined ? {} : { error: normalizeError(error) }),
  };
  const method = level === "debug" ? "debug" : level;

  if (typeof window === "undefined") {
    console[method](JSON.stringify(payload));
    return;
  }

  console[method]("[shopstr]", payload);
}

export function createLogger(defaultContext: LogContext = {}): Logger {
  return {
    error: (message, context, error) =>
      writeLog(
        "error",
        message,
        { ...defaultContext, ...(context ?? {}) },
        error
      ),
    warn: (message, context, error) =>
      writeLog(
        "warn",
        message,
        { ...defaultContext, ...(context ?? {}) },
        error
      ),
    info: (message, context) =>
      writeLog("info", message, { ...defaultContext, ...(context ?? {}) }),
    debug: (message, context) =>
      writeLog("debug", message, { ...defaultContext, ...(context ?? {}) }),
    child: (context) => createLogger({ ...defaultContext, ...(context ?? {}) }),
  };
}

export const logger = createLogger();
