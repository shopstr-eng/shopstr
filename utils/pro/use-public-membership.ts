// Client hook for reading ANOTHER seller's public membership status (e.g. when
// rendering a storefront you don't own). Use this to suppress a hidden seller's
// custom design/domain on the public site. For the logged-in seller's OWN
// membership use `useProMembership()` instead.
//
// Backed by the public `/api/pro/status` endpoint. Results are cached at module
// scope (and in-flight requests deduped) so many components on the same
// storefront page share a single fetch.

import { useEffect, useState } from "react";
import type { MembershipView } from "@/utils/pro/constants";
import { freeMembershipView } from "@/utils/pro/membership-status";

interface PublicMembership {
  view: MembershipView | null;
  isHidden: boolean;
  isReadOnly: boolean;
  isPro: boolean;
  loading: boolean;
}

// Cache entries carry a fetch timestamp and expire after TTL. Without this a
// seller cached as Pro would keep being treated as Pro for the whole session
// even after they lapse — re-serving premium chrome the entitlement no longer
// covers. A short TTL bounds that staleness window while still deduping the
// many storefront components that read the same seller on one page load.
const CACHE_TTL_MS = 60_000;

const cache = new Map<string, { view: MembershipView; at: number }>();
const inflight = new Map<string, Promise<MembershipView>>();

function getFresh(pubkey: string): MembershipView | null {
  const entry = cache.get(pubkey);
  if (!entry) return null;
  if (Date.now() - entry.at > CACHE_TTL_MS) {
    cache.delete(pubkey);
    return null;
  }
  return entry.view;
}

async function fetchStatus(pubkey: string): Promise<MembershipView> {
  const fresh = getFresh(pubkey);
  if (fresh) return fresh;
  const existing = inflight.get(pubkey);
  if (existing) return existing;

  const p = (async () => {
    try {
      const res = await fetch(
        `/api/pro/status?pubkey=${encodeURIComponent(pubkey)}`
      );
      if (!res.ok) return freeMembershipView(pubkey);
      const data = (await res.json()) as MembershipView;
      cache.set(pubkey, { view: data, at: Date.now() });
      return data;
    } catch {
      return freeMembershipView(pubkey);
    } finally {
      inflight.delete(pubkey);
    }
  })();
  inflight.set(pubkey, p);
  return p;
}

export function usePublicMembershipStatus(
  pubkey: string | null | undefined
): PublicMembership {
  const [view, setView] = useState<MembershipView | null>(
    pubkey ? getFresh(pubkey) : null
  );
  const [loading, setLoading] = useState<boolean>(
    !!pubkey && !getFresh(pubkey)
  );

  useEffect(() => {
    let active = true;
    if (!pubkey) {
      setView(null);
      setLoading(false);
      return;
    }
    const cached = getFresh(pubkey);
    if (cached) {
      setView(cached);
      setLoading(false);
      return;
    }
    setLoading(true);
    fetchStatus(pubkey).then((v) => {
      if (active) {
        setView(v);
        setLoading(false);
      }
    });
    return () => {
      active = false;
    };
  }, [pubkey]);

  return {
    view,
    isHidden: !!view?.isHidden,
    isReadOnly: !!view?.isReadOnly,
    isPro: !!view?.isPro,
    loading,
  };
}
