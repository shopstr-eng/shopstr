import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { SignerContext } from "@/components/utility-components/nostr-context-provider";
import {
  buildSignedHttpRequestProofTemplate,
  buildProCancelProof,
  buildProCreateSubscriptionProof,
  buildProHistoryProof,
  buildProManualInvoiceProof,
  buildProSyncProof,
  buildProVerifyInvoiceProof,
  SIGNED_EVENT_HEADER,
} from "@/utils/nostr/request-auth";
import type {
  MembershipView,
  ProBillingHistoryItem,
  ProManualMethod,
  ProTerm,
} from "@/utils/pro/constants";
import { freeMembershipView } from "@/utils/pro/membership-status";

interface ProMembershipContextValue {
  /** Resolved membership for the logged-in seller (free view when logged out). */
  membership: MembershipView;
  loading: boolean;
  /** True only while entitled (trialing/active/grace). */
  isPro: boolean;
  /** Re-fetch the public status for the current pubkey. */
  refresh: () => Promise<void>;
  /** Start a Stripe subscription; returns the PaymentIntent client secret. */
  startStripeSubscription: (
    term: ProTerm
  ) => Promise<{ subscriptionId: string; clientSecret: string | null }>;
  /** Pull the latest Stripe state after card confirmation. */
  syncStripe: () => Promise<MembershipView>;
  /** Cancel the membership (Stripe cancels at period end). */
  cancel: () => Promise<MembershipView>;
  /** Create a manual Bitcoin/fiat invoice. */
  createManualInvoice: (term: ProTerm, method: ProManualMethod) => Promise<any>;
  /** Poll a Bitcoin manual invoice for payment. */
  verifyManualInvoice: (invoiceId: string) => Promise<any>;
  /** Read the seller's past Pro charges (Stripe + manual), newest first. */
  fetchHistory: () => Promise<ProBillingHistoryItem[]>;
}

const ProMembershipContext = createContext<ProMembershipContextValue | null>(
  null
);

async function postSigned(
  path: string,
  signer: any,
  proof: any,
  body: Record<string, any>
): Promise<any> {
  const signedEvent = await signer.sign(
    buildSignedHttpRequestProofTemplate(proof)
  );
  const res = await fetch(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      [SIGNED_EVENT_HEADER]: JSON.stringify(signedEvent),
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error || `Request to ${path} failed`);
  }
  return data;
}

async function getSigned(path: string, signer: any, proof: any): Promise<any> {
  const signedEvent = await signer.sign(
    buildSignedHttpRequestProofTemplate(proof)
  );
  const res = await fetch(path, {
    method: "GET",
    headers: {
      [SIGNED_EVENT_HEADER]: JSON.stringify(signedEvent),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error || `Request to ${path} failed`);
  }
  return data;
}

export function ProMembershipProvider({ children }: { children: ReactNode }) {
  const { pubkey, signer } = useContext(SignerContext);
  const [membership, setMembership] = useState<MembershipView>(
    freeMembershipView("")
  );
  const [loading, setLoading] = useState(false);
  const activePubkey = useRef<string>("");

  const refresh = useCallback(async () => {
    if (!pubkey) {
      activePubkey.current = "";
      setMembership(freeMembershipView(""));
      return;
    }
    activePubkey.current = pubkey;
    setLoading(true);
    try {
      const res = await fetch(
        `/api/pro/status?pubkey=${encodeURIComponent(pubkey)}`
      );
      const data = await res.json();
      // Guard against a stale response after the pubkey changed.
      if (activePubkey.current !== pubkey) return;
      if (res.ok) {
        setMembership(data as MembershipView);
      } else {
        setMembership(freeMembershipView(pubkey));
      }
    } catch {
      if (activePubkey.current === pubkey) {
        setMembership(freeMembershipView(pubkey));
      }
    } finally {
      if (activePubkey.current === pubkey) setLoading(false);
    }
  }, [pubkey]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const requireAuth = useCallback(() => {
    if (!pubkey || !signer) {
      throw new Error("You must be signed in to manage your Pro membership.");
    }
    return { pubkey, signer };
  }, [pubkey, signer]);

  const startStripeSubscription = useCallback(
    async (term: ProTerm) => {
      const { pubkey: pk, signer: s } = requireAuth();
      return postSigned(
        "/api/pro/create-subscription",
        s,
        buildProCreateSubscriptionProof({ pubkey: pk, term }),
        { pubkey: pk, term }
      );
    },
    [requireAuth]
  );

  const syncStripe = useCallback(async () => {
    const { pubkey: pk, signer: s } = requireAuth();
    const view = await postSigned("/api/pro/sync", s, buildProSyncProof(pk), {
      pubkey: pk,
    });
    setMembership(view as MembershipView);
    return view as MembershipView;
  }, [requireAuth]);

  const cancel = useCallback(async () => {
    const { pubkey: pk, signer: s } = requireAuth();
    const data = await postSigned(
      "/api/pro/cancel",
      s,
      buildProCancelProof(pk),
      { pubkey: pk }
    );
    await refresh();
    return data as MembershipView;
  }, [requireAuth, refresh]);

  const createManualInvoice = useCallback(
    async (term: ProTerm, method: ProManualMethod) => {
      const { pubkey: pk, signer: s } = requireAuth();
      return postSigned(
        "/api/pro/manual-invoice",
        s,
        buildProManualInvoiceProof({ pubkey: pk, term, method }),
        { pubkey: pk, term, method }
      );
    },
    [requireAuth]
  );

  const verifyManualInvoice = useCallback(
    async (invoiceId: string) => {
      const { pubkey: pk, signer: s } = requireAuth();
      const data = await postSigned(
        "/api/pro/verify-invoice",
        s,
        buildProVerifyInvoiceProof({ pubkey: pk, invoiceId }),
        { pubkey: pk, invoiceId }
      );
      if (data?.paid && data?.view) {
        setMembership(data.view as MembershipView);
      }
      return data;
    },
    [requireAuth]
  );

  const fetchHistory = useCallback(async () => {
    const { pubkey: pk, signer: s } = requireAuth();
    const data = await getSigned(
      `/api/pro/history?pubkey=${encodeURIComponent(pk)}`,
      s,
      buildProHistoryProof(pk)
    );
    return (data?.history ?? []) as ProBillingHistoryItem[];
  }, [requireAuth]);

  const value = useMemo<ProMembershipContextValue>(
    () => ({
      membership,
      loading,
      isPro: membership.isPro,
      refresh,
      startStripeSubscription,
      syncStripe,
      cancel,
      createManualInvoice,
      verifyManualInvoice,
      fetchHistory,
    }),
    [
      membership,
      loading,
      refresh,
      startStripeSubscription,
      syncStripe,
      cancel,
      createManualInvoice,
      verifyManualInvoice,
      fetchHistory,
    ]
  );

  return (
    <ProMembershipContext.Provider value={value}>
      {children}
    </ProMembershipContext.Provider>
  );
}

export function useProMembership(): ProMembershipContextValue {
  const ctx = useContext(ProMembershipContext);
  if (!ctx) {
    throw new Error(
      "useProMembership must be used within a ProMembershipProvider"
    );
  }
  return ctx;
}
