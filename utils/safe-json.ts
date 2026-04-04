type JsonValidator<T> = (value: unknown) => value is T;

interface StorageParseOptions<T> {
  removeOnError?: boolean;
  validate?: JsonValidator<T>;
}

export function parseJsonWithFallback<T>(
  raw: string | null,
  fallback: T,
  options?: StorageParseOptions<T>
): T {
  if (!raw) return fallback;

  try {
    const parsed: unknown = JSON.parse(raw);
    if (options?.validate && !options.validate(parsed)) {
      return fallback;
    }
    return parsed as T;
  } catch {
    return fallback;
  }
}

export function getLocalStorageJson<T>(
  key: string,
  fallback: T,
  options?: StorageParseOptions<T>
): T {
  if (typeof window === "undefined") return fallback;

  const raw = localStorage.getItem(key);
  if (raw === null) return fallback;

  try {
    const parsed: unknown = JSON.parse(raw);
    if (options?.validate && !options.validate(parsed)) {
      if (options.removeOnError) {
        localStorage.removeItem(key);
      }
      return fallback;
    }
    return parsed as T;
  } catch {
    if (options?.removeOnError) {
      localStorage.removeItem(key);
    }
    return fallback;
  }
}
