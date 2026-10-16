import { useCallback, useEffect, useRef, useState } from "react";

export const COPY_FEEDBACK_DURATION_MS = 2100;

export function useCopyToClipboard(
  durationMs: number = COPY_FEEDBACK_DURATION_MS
) {
  const [copied, setCopied] = useState(false);
  const resetTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearResetTimeout = useCallback(() => {
    if (resetTimeoutRef.current !== null) {
      clearTimeout(resetTimeoutRef.current);
      resetTimeoutRef.current = null;
    }
  }, []);

  useEffect(() => clearResetTimeout, [clearResetTimeout]);

  const copy = useCallback(
    async (text: string): Promise<boolean> => {
      if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
        return false;
      }

      try {
        const writePromise = navigator.clipboard.writeText(text);
        setCopied(true);
        clearResetTimeout();
        resetTimeoutRef.current = setTimeout(() => {
          resetTimeoutRef.current = null;
          setCopied(false);
        }, durationMs);
        await writePromise;
        return true;
      } catch {
        clearResetTimeout();
        setCopied(false);
        return false;
      }
    },
    [clearResetTimeout, durationMs]
  );

  return { copied, copy };
}
