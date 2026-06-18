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

export interface StorageParseOptions<T> {
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
  if (typeof window === "undefined") {
    options?.onError?.({ reason: "ssr", key });
    return fallback;
  }

  const raw = localStorage.getItem(key);
  return parseJsonWithFallback(raw, fallback, {
    ...options,
    onError: (context) => {
      const contextWithKey = { ...context, key };
      options?.onError?.(contextWithKey);

      if (context.reason === "parse_error" && options?.removeOnError) {
        localStorage.removeItem(key);
      }

      if (
        context.reason === "validation_mismatch" &&
        options?.removeOnValidationError
      ) {
        localStorage.removeItem(key);
      }
    },
  });
}
