import * as WebBrowser from "expo-web-browser";
import { useLocalSearchParams, useRouter, type Href } from "expo-router";
import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { createSignedStripeConnectAuthEvent } from "@milk-market/nostr";

import {
  ActionButton,
  ScreenScrollView,
  ScreenTitle,
  SellerCard,
  StatusPill,
} from "@/components/seller-ui";
import { useSellerBootstrap } from "@/hooks/use-seller-bootstrap";
import { mobileApiClient } from "@/lib/api-client";
import { getErrorMessage } from "@/lib/error-utils";
import {
  createStripeConnectRedirectBaseUrl,
  createStripeConnectRedirectUrl,
  getStripeConnectCallbackStatus,
  type StripeConnectCallbackStatus,
} from "@/lib/stripe-connect";
import { useSessionStore } from "@/stores/session-store";
import { sellerThemeTokens } from "@/theme/tokens";

export default function DashboardScreen() {
  const router = useRouter();
  const { stripeConnectStatus } = useLocalSearchParams<{
    stripeConnectStatus?: string;
  }>();
  const session = useSessionStore((state) => state.session);
  const clearSession = useSessionStore((state) => state.clearSession);
  const {
    listingsQuery,
    notificationEmailQuery,
    profileQuery,
    shopProfile,
    stripeStatusQuery,
  } = useSellerBootstrap(session);

  const [stripeActionLoading, setStripeActionLoading] = useState(false);
  const [stripeActionError, setStripeActionError] = useState("");
  const [stripeActionMessage, setStripeActionMessage] = useState("");

  if (!session) {
    return null;
  }

  const listingCount = listingsQuery.data?.length ?? 0;
  const stripeStatus = stripeStatusQuery.data;
  const storefrontLoadError =
    profileQuery.error ?? notificationEmailQuery.error ?? null;
  const storefrontLoadErrorMessage = storefrontLoadError
    ? getErrorMessage(
        storefrontLoadError,
        "Seller storefront data could not be loaded."
      )
    : "";
  const listingsErrorMessage = listingsQuery.error
    ? getErrorMessage(
        listingsQuery.error,
        "Seller listings could not be loaded right now."
      )
    : "";
  const stripeStatusErrorMessage = stripeStatusQuery.error
    ? getErrorMessage(
        stripeStatusQuery.error,
        "Stripe Connect status could not be loaded."
      )
    : "";
  const setupItems = [
    { label: "Seller session ready", complete: true },
    {
      label: "Storefront basics saved",
      complete: Boolean(shopProfile?.content.name.trim()),
    },
    {
      label: "Notification email added",
      complete: Boolean(shopProfile?.notificationEmail ?? session.email),
    },
    {
      label: "Stripe onboarding complete",
      complete: Boolean(stripeStatus?.chargesEnabled),
    },
  ];
  const completedCount = setupItems.filter((item) => item.complete).length;

  const stripeTone =
    stripeStatus?.chargesEnabled === true
      ? "success"
      : stripeStatus?.hasAccount
        ? "warning"
        : "neutral";
  const stripeLabel =
    stripeStatus?.chargesEnabled === true
      ? "Card payments live"
      : stripeStatus?.hasAccount
        ? "Finish Stripe onboarding"
        : "Stripe not connected";

  useEffect(() => {
    const callbackStatus =
      stripeConnectStatus === "success" || stripeConnectStatus === "refresh"
        ? (stripeConnectStatus as StripeConnectCallbackStatus)
        : null;

    if (!callbackStatus) {
      return;
    }

    let active = true;

    const handleStripeCallback = async () => {
      setStripeActionLoading(true);
      setStripeActionError("");
      setStripeActionMessage(
        callbackStatus === "success"
          ? "Returned from Stripe. Refreshing seller payout status..."
          : "Stripe asked to refresh onboarding details. Updating seller status..."
      );

      const result = await stripeStatusQuery.refetch();
      if (!active) {
        return;
      }

      if (result.error) {
        setStripeActionError(
          getErrorMessage(
            result.error,
            "Stripe Connect status could not be refreshed."
          )
        );
        setStripeActionMessage("");
      } else if (callbackStatus === "success") {
        setStripeActionMessage(
          result.data?.chargesEnabled
            ? "Stripe onboarding returned to the app. Card-payment status is now refreshed."
            : "Returned from Stripe. Stripe setup is still pending completion."
        );
      } else {
        setStripeActionError(
          "Stripe onboarding still needs more information. Tap Connect Stripe to continue."
        );
        setStripeActionMessage("");
      }

      router.replace("/" as Href);
      setStripeActionLoading(false);
    };

    handleStripeCallback().catch((caughtError) => {
      if (!active) {
        return;
      }

      setStripeActionError(
        caughtError instanceof Error
          ? caughtError.message
          : "Failed to refresh Stripe Connect status."
      );
      setStripeActionMessage("");
      setStripeActionLoading(false);
      router.replace("/" as Href);
    });

    return () => {
      active = false;
    };
  }, [router, stripeConnectStatus, stripeStatusQuery]);

  const handleRefreshSellerData = async () => {
    await Promise.allSettled([
      profileQuery.refetch(),
      notificationEmailQuery.refetch(),
      listingsQuery.refetch(),
    ]);
  };

  const handleStripeConnect = async () => {
    setStripeActionLoading(true);
    setStripeActionError("");
    setStripeActionMessage("");

    try {
      const createAccountSignedEvent =
        createSignedStripeConnectAuthEvent(session);
      const account = await mobileApiClient.createStripeConnectAccount({
        pubkey: session.pubkey,
        signedEvent: createAccountSignedEvent,
      });
      const createLinkSignedEvent = createSignedStripeConnectAuthEvent(session);
      const redirectBaseUrl = createStripeConnectRedirectBaseUrl();
      const link = await mobileApiClient.createStripeConnectAccountLink({
        accountId: account.accountId,
        pubkey: session.pubkey,
        signedEvent: createLinkSignedEvent,
        returnUrl: createStripeConnectRedirectUrl("success"),
        refreshUrl: createStripeConnectRedirectUrl("refresh"),
      });
      const result = await WebBrowser.openAuthSessionAsync(
        link.url,
        redirectBaseUrl
      );

      if (result.type === "cancel" || result.type === "dismiss") {
        setStripeActionMessage("");
        return;
      }

      if (result.type === "success") {
        const callbackStatus = getStripeConnectCallbackStatus(result.url);
        if (!callbackStatus) {
          setStripeActionMessage(
            "Stripe onboarding returned to the app. Refreshing seller payout status..."
          );
          const refreshed = await stripeStatusQuery.refetch();
          if (refreshed.error) {
            throw refreshed.error;
          }
        }
      }
    } catch (caughtError) {
      setStripeActionError(
        caughtError instanceof Error
          ? caughtError.message
          : "Failed to launch Stripe onboarding."
      );
    } finally {
      setStripeActionLoading(false);
    }
  };

  const handleSignOut = async () => {
    await clearSession();
    router.replace("/sign-in" as Href);
  };

  return (
    <ScreenScrollView>
      <ScreenTitle
        eyebrow="Seller foundation"
        title="Seller dashboard"
        description="Phase 2 focuses on secure session restore, storefront basics, Stripe status, and read-only listing visibility."
      />

      <SellerCard
        title="Seller session"
        description="Your mobile seller workspace uses the same Milk Market identity model as the web app."
      >
        <View style={styles.rowBetween}>
          <View style={styles.metaBlock}>
            <Text style={styles.metaLabel}>Auth method</Text>
            <Text style={styles.metaValue}>{session.authMethod}</Text>
          </View>
          <View style={styles.metaBlock}>
            <Text style={styles.metaLabel}>Pubkey</Text>
            <Text style={styles.metaValueShort}>
              {session.pubkey.slice(0, 12)}...
            </Text>
          </View>
        </View>
        {session.email ? (
          <View style={styles.metaBlock}>
            <Text style={styles.metaLabel}>Email</Text>
            <Text style={styles.metaValue}>{session.email}</Text>
          </View>
        ) : null}
        <ActionButton
          label="Sign out"
          onPress={handleSignOut}
          variant="secondary"
        />
      </SellerCard>

      <SellerCard
        title={`Setup progress: ${completedCount}/${setupItems.length}`}
        description="This is the seller-first Phase 2 checklist before product CRUD arrives."
      >
        {setupItems.map((item) => (
          <View key={item.label} style={styles.rowBetween}>
            <Text style={styles.checkLabel}>{item.label}</Text>
            <StatusPill
              tone={item.complete ? "success" : "warning"}
              label={item.complete ? "Done" : "Next"}
            />
          </View>
        ))}
      </SellerCard>

      <SellerCard
        title="Storefront summary"
        description="Phase 2 storefront editing is intentionally limited to the fields we can safely support on mobile now."
      >
        <View style={styles.metaBlock}>
          <Text style={styles.metaLabel}>Shop name</Text>
          <Text style={styles.metaValue}>
            {storefrontLoadErrorMessage
              ? "Unavailable right now"
              : shopProfile?.content.name || "Not saved yet"}
          </Text>
        </View>
        <View style={styles.metaBlock}>
          <Text style={styles.metaLabel}>Shop slug</Text>
          <Text style={styles.metaValue}>
            {storefrontLoadErrorMessage
              ? "Unavailable right now"
              : shopProfile?.content.storefront?.shopSlug ||
                "No public slug yet"}
          </Text>
        </View>
        <View style={styles.metaBlock}>
          <Text style={styles.metaLabel}>Seller listings</Text>
          <Text style={styles.metaValue}>
            {listingsQuery.isLoading
              ? "Loading..."
              : listingsErrorMessage
                ? "Unavailable right now"
                : `${listingCount} cached listings`}
          </Text>
        </View>
        {storefrontLoadErrorMessage ? (
          <Text style={styles.errorText}>{storefrontLoadErrorMessage}</Text>
        ) : null}
        {listingsErrorMessage ? (
          <Text style={styles.errorText}>{listingsErrorMessage}</Text>
        ) : null}
        <ActionButton
          label="Edit storefront basics"
          onPress={() => router.push("/storefront" as Href)}
        />
        <ActionButton
          label="Review listings"
          onPress={() => router.push("/listings" as Href)}
          variant="secondary"
        />
        {storefrontLoadErrorMessage || listingsErrorMessage ? (
          <ActionButton
            label="Retry seller data"
            onPress={handleRefreshSellerData}
            variant="secondary"
            loading={
              profileQuery.isFetching ||
              notificationEmailQuery.isFetching ||
              listingsQuery.isFetching
            }
          />
        ) : null}
      </SellerCard>

      <SellerCard
        title="Stripe Connect"
        description="Phase 2 lets the seller view current card-payment status and launch the existing onboarding flow."
      >
        <View style={styles.rowBetween}>
          <Text style={styles.checkLabel}>Current status</Text>
          <StatusPill
            tone={stripeStatusErrorMessage ? "warning" : stripeTone}
            label={
              stripeStatusErrorMessage ? "Status unavailable" : stripeLabel
            }
          />
        </View>
        <View style={styles.metaRow}>
          <Text style={styles.metaLabel}>Charges enabled</Text>
          <Text style={styles.metaValue}>
            {stripeStatusErrorMessage
              ? "Unavailable"
              : stripeStatus?.chargesEnabled
                ? "Yes"
                : "No"}
          </Text>
        </View>
        <View style={styles.metaRow}>
          <Text style={styles.metaLabel}>Payouts enabled</Text>
          <Text style={styles.metaValue}>
            {stripeStatusErrorMessage
              ? "Unavailable"
              : stripeStatus?.payoutsEnabled
                ? "Yes"
                : "No"}
          </Text>
        </View>
        {stripeStatusErrorMessage ? (
          <Text style={styles.errorText}>{stripeStatusErrorMessage}</Text>
        ) : null}
        {stripeActionError ? (
          <Text style={styles.errorText}>{stripeActionError}</Text>
        ) : null}
        {stripeActionMessage ? (
          <Text style={styles.successText}>{stripeActionMessage}</Text>
        ) : null}
        <ActionButton
          label={
            stripeStatusErrorMessage
              ? "Retry Stripe status"
              : stripeStatus?.chargesEnabled
                ? "Refresh Stripe status"
                : "Connect Stripe"
          }
          onPress={
            stripeStatusErrorMessage
              ? async () => {
                  await stripeStatusQuery.refetch();
                }
              : stripeStatus?.chargesEnabled
                ? () => {
                    stripeStatusQuery.refetch().catch(console.error);
                  }
                : handleStripeConnect
          }
          loading={stripeActionLoading || stripeStatusQuery.isFetching}
        />
      </SellerCard>
    </ScreenScrollView>
  );
}

const styles = StyleSheet.create({
  rowBetween: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  metaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
  },
  metaBlock: {
    gap: 4,
  },
  metaLabel: {
    color: sellerThemeTokens.mutedText,
    fontSize: 13,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.7,
  },
  metaValue: {
    color: sellerThemeTokens.text,
    fontSize: 16,
    fontWeight: "600",
  },
  metaValueShort: {
    color: sellerThemeTokens.text,
    fontSize: 15,
    fontWeight: "600",
  },
  checkLabel: {
    color: sellerThemeTokens.text,
    fontSize: 15,
    flex: 1,
    lineHeight: 22,
  },
  errorText: {
    color: sellerThemeTokens.danger,
    fontSize: 14,
    lineHeight: 20,
  },
  successText: {
    color: sellerThemeTokens.success,
    fontSize: 14,
    lineHeight: 20,
  },
});
