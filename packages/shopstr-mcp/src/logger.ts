import type { LogLevel } from "./config.js";

const LOG_LEVELS: Record<LogLevel, number> = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

export type Logger = {
  error: (message: string, data?: Record<string, unknown>) => void;
  warn: (message: string, data?: Record<string, unknown>) => void;
  info: (message: string, data?: Record<string, unknown>) => void;
  debug: (message: string, data?: Record<string, unknown>) => void;
  log: (
    level: LogLevel,
    message: string,
    data?: Record<string, unknown>
  ) => void;
};

export function createLogger(
  configuredLevel: LogLevel,
  write: (line: string) => void = (line) => process.stderr.write(line)
): Logger {
  const log = (
    level: LogLevel,
    message: string,
    data: Record<string, unknown> = {}
  ): void => {
    if (LOG_LEVELS[level] > LOG_LEVELS[configuredLevel]) return;

    write(
      `${JSON.stringify({
        ...data,
        level,
        ts: new Date().toISOString(),
        msg: message,
      })}\n`
    );
  };

  return {
    error: (message, data) => log("error", message, data),
    warn: (message, data) => log("warn", message, data),
    info: (message, data) => log("info", message, data),
    debug: (message, data) => log("debug", message, data),
    log,
  };
}
