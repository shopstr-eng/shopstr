"use client";

import { useContext, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import { Button, useDisclosure } from "@heroui/react";
import StorefrontThemeWrapper from "@/components/storefront/storefront-theme-wrapper";
import MessageFeed from "@/components/messages/message-feed";
import MilkMarketSpinner from "@/components/utility-components/mm-spinner";
import SignInModal from "@/components/sign-in/SignInModal";
import { SignerContext } from "@/components/utility-components/nostr-context-provider";
import { ChatsContext } from "@/utils/context/context";
import {
  applyCustomDomainHref,
  useIsCustomDomain,
} from "@/utils/storefront/custom-domain-context";

const ORDER_SUBJECTS = new Set([
  "order-payment",
  "order-info",
  "payment-change",
  "order-receipt",
  "shipping-info",
  "order-completed",
  "zapsnag-order",
  "address-change",
]);

interface ThemedStallOrdersProps {
  sellerPubkey: string;
  shopSlug: string;
  initialTab?: string;
}

export default function ThemedStallOrders({
  sellerPubkey,
  shopSlug,
  initialTab,
}: ThemedStallOrdersProps) {
  const router = useRouter();
  const { pubkey: viewerPubkey, isLoggedIn } = useContext(SignerContext);
  const chatsContext = useContext(ChatsContext);
  const isCustomDomain = useIsCustomDomain();
  const { isOpen, onOpen, onClose } = useDisclosure();

  const [hasSubscriptionsWithSeller, setHasSubscriptionsWithSeller] =
    useState(false);
  const [subsChecked, setSubsChecked] = useState(false);

  // Check whether the signed-in user has order messages with this seller.
  const hasOrderHistoryWithSeller = useMemo(() => {
    if (!isLoggedIn || !viewerPubkey || !chatsContext?.chatsMap) return false;
    if (viewerPubkey === sellerPubkey) return true; // sellers always pass
    const messages = chatsContext.chatsMap.get(sellerPubkey);
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return false;
    }
    for (const ev of messages) {
      // Only decrypted kind-14 messages expose the subject tag, which is
      // what distinguishes an order from a generic inquiry. Anything else
      // (e.g. an undecrypted kind-1059 wrapper) is not a verifiable order
      // signal and must not grant buyer access.
      if (ev?.kind !== 14) continue;
      const subjectTag = ev.tags?.find(
        (t: string[]) => Array.isArray(t) && t[0] === "subject"
      );
      if (subjectTag && subjectTag[1] && ORDER_SUBJECTS.has(subjectTag[1])) {
        return true;
      }
    }
    return false;
  }, [isLoggedIn, viewerPubkey, sellerPubkey, chatsContext?.chatsMap]);

  // Fetch the buyer's stripe subscriptions to detect seller relationship.
  useEffect(() => {
    if (!isLoggedIn || !viewerPubkey || viewerPubkey === sellerPubkey) {
      setSubsChecked(true);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/stripe/get-subscriptions?pubkey=${encodeURIComponent(
            viewerPubkey
          )}`
        );
        if (!res.ok) return;
        const data = await res.json();
        const subs = Array.isArray(data.subscriptions)
          ? data.subscriptions
          : [];
        const match = subs.some(
          (s: { seller_pubkey?: string }) => s.seller_pubkey === sellerPubkey
        );
        if (!cancelled) setHasSubscriptionsWithSeller(match);
      } catch {
        // ignore — falls through to "no relationship" empty state
      } finally {
        if (!cancelled) setSubsChecked(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isLoggedIn, viewerPubkey, sellerPubkey]);

  const isSeller = isLoggedIn && viewerPubkey === sellerPubkey;
  const isBuyer =
    isLoggedIn &&
    !isSeller &&
    (hasOrderHistoryWithSeller || hasSubscriptionsWithSeller);

  // Wait for chats + subs check before deciding visibility for signed-in
  // users so we don't flash the empty state.
  const stillLoading =
    isLoggedIn &&
    !isSeller &&
    (chatsContext?.isLoading || !subsChecked) &&
    !hasOrderHistoryWithSeller &&
    !hasSubscriptionsWithSeller;

  const themedContent = (() => {
    if (stillLoading) {
      return (
        <div className="flex min-h-[60vh] items-center justify-center">
          <MilkMarketSpinner />
        </div>
      );
    }

    if (isSeller || isBuyer) {
      return (
        <div className="storefront-themed flex min-h-screen flex-col pt-16">
          <div className="border-b border-black/10 px-4 pt-6 pb-3">
            <h1 className="text-3xl font-bold">
              {isSeller ? "Stall Orders" : "Your Orders"}
            </h1>
            <p className="mt-1 text-sm opacity-70">
              {isSeller
                ? "Orders, subscriptions, inquiries, and contacts for this stall."
                : "Your orders, subscriptions, and inquiries with this stall."}
            </p>
          </div>
          <MessageFeed
            scopeToSellerPubkey={sellerPubkey}
            viewerRole={isSeller ? "seller" : "buyer"}
            {...(initialTab ? { initialTab } : {})}
          />
        </div>
      );
    }

    // No relationship → themed empty state.
    const browseHref = applyCustomDomainHref(
      `/stall/${shopSlug}`,
      shopSlug,
      isCustomDomain
    );
    return (
      <div className="storefront-themed flex min-h-screen flex-col items-center justify-center px-6 pt-24 pb-12 text-center">
        <div className="shadow-neo w-full max-w-lg rounded-xl border-2 border-black bg-white p-8">
          <h1 className="text-3xl font-bold">No orders here yet</h1>
          <p className="mt-3 text-base opacity-80">
            {isLoggedIn
              ? "You haven't placed any orders with this stall yet. Browse what's in stock to get started."
              : "Sign in to view your orders with this stall, or browse what's in stock."}
          </p>
          <div className="mt-6 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            {!isLoggedIn && (
              <Button
                onClick={onOpen}
                className="font-bold text-black"
                variant="bordered"
              >
                Sign In
              </Button>
            )}
            <Button
              onClick={() => router.push(browseHref)}
              className="bg-primary-blue font-bold text-white"
            >
              Browse Stall
            </Button>
          </div>
        </div>
      </div>
    );
  })();

  return (
    <>
      <StorefrontThemeWrapper sellerPubkey={sellerPubkey} renderChrome={true}>
        {themedContent}
      </StorefrontThemeWrapper>
      <SignInModal isOpen={isOpen} onClose={onClose} />
    </>
  );
}
