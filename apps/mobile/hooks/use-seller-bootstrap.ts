import { useQuery } from "@tanstack/react-query";

import {
  selectSellerListingSummaries,
  selectSellerShopProfile,
  withNotificationEmail,
  type SellerSession,
} from "@milk-market/domain";
import {
  createSignedSellerActionAuthEvent,
  createSignedStripeConnectAuthEvent,
} from "@milk-market/nostr";

import { mobileApiClient } from "@/lib/api-client";

export function useSellerProfile(pubkey?: string) {
  return useQuery({
    queryKey: ["seller-profile", pubkey],
    enabled: Boolean(pubkey),
    queryFn: async () => {
      if (!pubkey) {
        throw new Error("Seller pubkey is required.");
      }
      const profiles = await mobileApiClient.fetchProfiles();
      return selectSellerShopProfile(profiles, pubkey);
    },
  });
}

export function useSellerNotificationEmail(session: SellerSession | null) {
  return useQuery({
    queryKey: ["seller-notification-email", session?.pubkey],
    enabled: Boolean(session),
    queryFn: async () => {
      if (!session) {
        throw new Error("Seller session is required.");
      }

      const signedEvent = createSignedSellerActionAuthEvent(
        session,
        "notification-email-read"
      );
      return mobileApiClient.fetchSellerNotificationEmail(
        session.pubkey,
        signedEvent
      );
    },
  });
}

export function useSellerListings(pubkey?: string) {
  return useQuery({
    queryKey: ["seller-listings", pubkey],
    enabled: Boolean(pubkey),
    queryFn: async () => {
      if (!pubkey) {
        throw new Error("Seller pubkey is required.");
      }
      const products = await mobileApiClient.fetchProducts();
      return selectSellerListingSummaries(products, pubkey);
    },
  });
}

export function useStripeConnectStatus(session: SellerSession | null) {
  return useQuery({
    queryKey: ["seller-stripe-status", session?.pubkey],
    enabled: Boolean(session),
    queryFn: async () => {
      if (!session) {
        throw new Error("Seller session is required.");
      }

      const signedEvent = createSignedStripeConnectAuthEvent(session);
      return mobileApiClient.getStripeConnectStatus({
        pubkey: session.pubkey,
        signedEvent,
      });
    },
  });
}

export function useSellerBootstrap(session: SellerSession | null) {
  const profileQuery = useSellerProfile(session?.pubkey);
  const notificationEmailQuery = useSellerNotificationEmail(session);
  const listingsQuery = useSellerListings(session?.pubkey);
  const stripeStatusQuery = useStripeConnectStatus(session);

  return {
    profileQuery,
    notificationEmailQuery,
    listingsQuery,
    stripeStatusQuery,
    shopProfile: withNotificationEmail(
      profileQuery.data ?? null,
      notificationEmailQuery.data?.email
    ),
  };
}
