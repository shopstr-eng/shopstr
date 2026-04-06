type JsonValidator<T> = (value: unknown) => value is T;

type JsonErrorReason =
  | "ssr"
  | "parse_error"
  | "validation_mismatch"
  | "fallback_validation_mismatch";

interface JsonErrorContext {
  reason: JsonErrorReason;
  key?: string;
  error?: unknown;
}

interface StorageParseOptions<T> {
  removeOnError?: boolean;
  removeOnValidationError?: boolean;
  onError?: (context: JsonErrorContext) => void;
  validate?: JsonValidator<T>;
}

export function parseJsonWithFallback<T>(
  raw: string | null,
  fallback: T,
  options?: StorageParseOptions<T>
): T {
  const reportError = (context: JsonErrorContext) => {
    options?.onError?.(context);
  };

  if (options?.validate && !options.validate(fallback)) {
    reportError({ reason: "fallback_validation_mismatch" });
  }

  if (!raw) return fallback;

  try {
    const parsed: unknown = JSON.parse(raw);
    if (options?.validate && !options.validate(parsed)) {
      reportError({ reason: "validation_mismatch" });
      return fallback;
    }
    return parsed as T;
  } catch (error) {
    reportError({ reason: "parse_error", error });
    return fallback;
  }
}

export function getLocalStorageJson<T>(
  key: string,
  fallback: T,
  options?: StorageParseOptions<T>
): T {
  const reportError = (context: JsonErrorContext) => {
    options?.onError?.({ ...context, key });
  };

  if (options?.validate && !options.validate(fallback)) {
    reportError({ reason: "fallback_validation_mismatch" });
  }

  if (typeof window === "undefined") {
    reportError({ reason: "ssr" });
    return fallback;
  }

  const raw = localStorage.getItem(key);
  if (raw === null) return fallback;

  try {
    const parsed: unknown = JSON.parse(raw);
    if (options?.validate && !options.validate(parsed)) {
      if (options.removeOnValidationError) {
        localStorage.removeItem(key);
      }
      reportError({ reason: "validation_mismatch" });
      return fallback;
    }
    return parsed as T;
  } catch (error) {
    if (options?.removeOnError) {
      localStorage.removeItem(key);
    }
    reportError({ reason: "parse_error", error });
    return fallback;
  }
}
