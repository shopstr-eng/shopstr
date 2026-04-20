import { useEffect } from "react";
import { useRouter } from "next/router";

const COOKIE_NAME = "mm_aff_ref";
const COOKIE_DAYS = 30;

function setCookie(value: string) {
  if (typeof document === "undefined") return;
  const max = COOKIE_DAYS * 24 * 60 * 60;
  document.cookie = `${COOKIE_NAME}=${encodeURIComponent(
    value
  )}; max-age=${max}; path=/; SameSite=Lax`;
}

export function getAffiliateRefCookie(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(
    new RegExp(`(?:^|; )${COOKIE_NAME}=([^;]*)`)
  );
  return match ? decodeURIComponent(match[1]!) : null;
}

/**
 * Listens for `?ref=CODE` (or `?ref_seller=PUBKEY:CODE`) on every route change
 * and stashes the value in a 30-day cookie. The cart later reads the cookie
 * to pre-fill the affiliate code at checkout.
 */
export default function AffiliateRefTracker() {
  const router = useRouter();
  useEffect(() => {
    const code = router.query.ref;
    if (typeof code === "string" && code.length > 0 && code.length < 256) {
      setCookie(code.trim());
    }
  }, [router.query.ref]);
  return null;
}
