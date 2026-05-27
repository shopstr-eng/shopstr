import { useEffect, useState } from "react";

interface PaymentCountdownProps {
  deadlineMs: number | null;
  className?: string;
  label?: string;
}

interface PaymentElapsedProps {
  startedAtMs: number | null;
  className?: string;
  label?: string;
}

function formatMmSs(totalSeconds: number): string {
  const clamped = Math.max(0, totalSeconds);
  const minutes = Math.floor(clamped / 60);
  const seconds = clamped % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export function PaymentCountdown({
  deadlineMs,
  className,
  label = "Waiting for payment",
}: PaymentCountdownProps) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!deadlineMs) return;
    const id = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => window.clearInterval(id);
  }, [deadlineMs]);

  if (!deadlineMs) return null;
  const remainingSec = Math.max(0, Math.ceil((deadlineMs - now) / 1000));

  return (
    <div
      className={
        className ??
        "text-dark-text mt-2 text-center text-sm font-medium tabular-nums"
      }
      aria-live="polite"
    >
      {label}: <span className="font-mono">{formatMmSs(remainingSec)}</span>{" "}
      remaining
    </div>
  );
}

/**
 * Counts up from a fixed start timestamp. Used for flows like direct Cashu
 * swap+melt that have no fixed deadline — we just want the buyer to see the
 * operation is alive while the mint is working.
 */
export function PaymentElapsed({
  startedAtMs,
  className,
  label = "Processing payment",
}: PaymentElapsedProps) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!startedAtMs) return;
    const id = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => window.clearInterval(id);
  }, [startedAtMs]);

  if (!startedAtMs) return null;
  const elapsedSec = Math.max(0, Math.floor((now - startedAtMs) / 1000));

  return (
    <div
      className={
        className ??
        "text-dark-text mt-2 text-center text-sm font-medium tabular-nums"
      }
      aria-live="polite"
    >
      {label}: <span className="font-mono">{formatMmSs(elapsedSec)}</span>{" "}
      elapsed
    </div>
  );
}
