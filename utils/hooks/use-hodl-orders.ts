import { useEffect, useState } from "react";
import { createNip98AuthorizationHeader } from "@/utils/nostr/nip98-auth";
import type { StoredHodlOrder } from "@/utils/db/hodl-order-store";

type Signer = Parameters<typeof createNip98AuthorizationHeader>[0];
const EMPTY_ORDERS: StoredHodlOrder[] = [];
export function useHodlOrders(
  signer: Signer | null | undefined,
  pubkey: string | null | undefined,
  arbiter = false
) {
  const [state, setState] = useState<{
    owner: string | null;
    orders: StoredHodlOrder[];
    error: string | null;
  }>({ owner: null, orders: [], error: null });
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    async function refresh() {
      if (!signer || !pubkey) return;
      try {
        const orders: StoredHodlOrder[] = [];
        let after = "";
        do {
          const path = `/api/lightning/hodl-orders${arbiter ? `?role=arbiter${after ? `&after=${after}` : ""}` : after ? `?after=${after}` : ""}`;
          const authorization = await createNip98AuthorizationHeader(
            signer,
            `${window.location.origin}${path}`,
            "GET"
          );
          if (cancelled) return;
          const response = await fetch(path, {
            headers: { Authorization: authorization },
            cache: "no-store",
          });
          if (!response.ok)
            throw new Error(
              "Escrow orders could not be loaded. Retrying shortly."
            );
          const page = await response.json();
          orders.push(...page.orders);
          if (
            page.next &&
            (typeof page.next !== "string" ||
              !/^[a-f0-9]{64}$/.test(page.next) ||
              page.next <= after)
          )
            throw new Error("Invalid order cursor");
          after = page.next ?? "";
        } while (after && !cancelled);
        if (!cancelled) setState({ owner: pubkey, orders, error: null });
      } catch {
        if (!cancelled)
          setState((previous) => ({
            owner: pubkey,
            orders: previous.owner === pubkey ? previous.orders : [],
            error: "Escrow orders could not be loaded. Retrying shortly.",
          }));
      } finally {
        if (!cancelled) timer = setTimeout(refresh, 30_000);
      }
    }
    void refresh();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [signer, pubkey, arbiter]);
  return state.owner === pubkey ? state : { orders: EMPTY_ORDERS, error: null };
}
