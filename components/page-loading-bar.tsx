import { useEffect, useState } from "react";
import { useRouter } from "next/router";

export default function PageLoadingBar() {
  const router = useRouter();
  const [width, setWidth] = useState(0);
  const [visible, setVisible] = useState(false);
  const [fadeOut, setFadeOut] = useState(false);

  useEffect(() => {
    let progressTimer: number | null = null;
    let hideTimer: number | null = null;

    const start = () => {
      if (hideTimer) clearTimeout(hideTimer);
      if (progressTimer) clearInterval(progressTimer);
      setFadeOut(false);
      setVisible(true);
      setWidth(0);

      // Quickly advance to ~15% then slowly crawl toward 85%
      setTimeout(() => setWidth(15), 50);
      setTimeout(() => setWidth(35), 200);
      setTimeout(() => setWidth(55), 500);

      // Slowly inch toward 85% to signal "still loading"
      let current = 55;
      progressTimer = window.setInterval(() => {
        if (current < 85) {
          current += Math.random() * 3;
          setWidth(Math.min(current, 85));
        }
      }, 400);
    };

    const done = () => {
      if (progressTimer) clearInterval(progressTimer);
      setWidth(100);

      hideTimer = window.setTimeout(() => {
        setFadeOut(true);
        hideTimer = window.setTimeout(() => {
          setVisible(false);
          setWidth(0);
          setFadeOut(false);
        }, 300);
      }, 150);
    };

    const error = () => done();

    router.events.on("routeChangeStart", start);
    router.events.on("routeChangeComplete", done);
    router.events.on("routeChangeError", error);

    return () => {
      router.events.off("routeChangeStart", start);
      router.events.off("routeChangeComplete", done);
      router.events.off("routeChangeError", error);
      if (progressTimer) clearInterval(progressTimer);
      if (hideTimer) clearTimeout(hideTimer);
    };
  }, [router]);

  if (!visible) return null;

  return (
    <div
      className="pointer-events-none fixed left-0 right-0 top-0 z-[9999] h-[3px]"
      style={{
        opacity: fadeOut ? 0 : 1,
        transition: fadeOut ? "opacity 0.3s ease" : "none",
      }}
    >
      <div
        className="h-full bg-gradient-to-r from-orange-500 to-orange-400"
        style={{
          width: `${width}%`,
          boxShadow: "0 0 8px rgba(249, 115, 22, 0.7)",
          transition:
            width === 100
              ? "width 0.2s ease"
              : "width 0.4s cubic-bezier(0.4, 0, 0.2, 1)",
        }}
      />
    </div>
  );
}
