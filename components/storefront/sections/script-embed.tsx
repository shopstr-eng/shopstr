import { ReactNode, useEffect, useRef, useState } from "react";
import { loadExternalScript } from "@/utils/load-external-script";

interface ScriptEmbedProps {
  scriptSrc: string;
  process?: (container: HTMLElement) => void;
  children: ReactNode;
  fallback: ReactNode;
  timeoutMs?: number;
  cacheKey: string;
}

export default function ScriptEmbed({
  scriptSrc,
  process,
  children,
  fallback,
  timeoutMs = 8000,
  cacheKey,
}: ScriptEmbedProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setFailed(false);

    const container = containerRef.current;
    if (!container) return;

    let timeout: ReturnType<typeof setTimeout> | null = null;
    let observer: MutationObserver | null = null;

    const markFailed = () => {
      if (cancelled) return;
      setFailed(true);
    };

    const markSuccess = () => {
      if (timeout) clearTimeout(timeout);
      if (observer) observer.disconnect();
    };

    observer = new MutationObserver(() => {
      if (cancelled) return;
      const iframe = container.querySelector("iframe");
      if (iframe) markSuccess();
    });
    observer.observe(container, { childList: true, subtree: true });

    timeout = setTimeout(() => {
      if (cancelled) return;
      const iframe = container.querySelector("iframe");
      if (!iframe) markFailed();
    }, timeoutMs);

    loadExternalScript(scriptSrc)
      .then(() => {
        if (cancelled || !container.isConnected) return;
        try {
          process?.(container);
        } catch {
          markFailed();
        }
      })
      .catch(() => {
        markFailed();
      });

    return () => {
      cancelled = true;
      if (timeout) clearTimeout(timeout);
      if (observer) observer.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheKey, scriptSrc]);

  if (failed) return <>{fallback}</>;

  return (
    <div ref={containerRef} className="w-full">
      {children}
    </div>
  );
}
