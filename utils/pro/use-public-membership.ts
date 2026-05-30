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

const cache = new Map<string, MembershipView>();
const inflight = new Map<string, Promise<MembershipView>>();

async function fetchStatus(pubkey: string): Promise<MembershipView> {
  if (cache.has(pubkey)) return cache.get(pubkey)!;
  const existing = inflight.get(pubkey);
  if (existing) return existing;

  const p = (async () => {
    try {
      const res = await fetch(
        `/api/pro/status?pubkey=${encodeURIComponent(pubkey)}`
      );
      if (!res.ok) return freeMembershipView(pubkey);
      const data = (await res.json()) as MembershipView;
      cache.set(pubkey, data);
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
    pubkey && cache.has(pubkey) ? cache.get(pubkey)! : null
  );
  const [loading, setLoading] = useState<boolean>(
    !!pubkey && !cache.has(pubkey)
  );

  useEffect(() => {
    let active = true;
    if (!pubkey) {
      setView(null);
      setLoading(false);
      return;
    }
    if (cache.has(pubkey)) {
      setView(cache.get(pubkey)!);
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
