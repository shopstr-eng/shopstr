import { useEffect, useState } from "react";
import { StyleSheet, Text } from "react-native";
import { useQueryClient } from "@tanstack/react-query";

import {
  buildSellerShopProfileContent,
  createEmptyStorefrontBasicsDraft,
  normalizeStorefrontSlug,
  validateStorefrontBasicsDraft,
  type StorefrontBasicsDraft,
  type StorefrontBasicsValidationErrors,
  type StorefrontSlugState,
} from "@milk-market/domain";
import {
  createSignedSellerActionAuthEvent,
  publishSellerShopProfile,
} from "@milk-market/nostr";

import { ActionButton, ScreenScrollView, ScreenTitle, SellerCard, SellerField, StatusPill } from "@/components/seller-ui";
import LoadingScreen from "@/components/loading-screen";
import { useSellerBootstrap } from "@/hooks/use-seller-bootstrap";
import { getApiBaseUrl } from "@/lib/api-base-url";
import { mobileApiClient } from "@/lib/api-client";
import { getErrorMessage } from "@/lib/error-utils";
import { useSessionStore } from "@/stores/session-store";
import { sellerThemeTokens } from "@/theme/tokens";

export default function StorefrontScreen() {
  const queryClient = useQueryClient();
  const session = useSessionStore((state) => state.session);
  const { notificationEmailQuery, profileQuery, shopProfile } = useSellerBootstrap(session);
  const sellerProfile = profileQuery.data ?? null;
  const sellerNotificationEmail = notificationEmailQuery.data?.email;

  const [draft, setDraft] = useState<StorefrontBasicsDraft>(
    createEmptyStorefrontBasicsDraft()
  );
  const [errors, setErrors] = useState<StorefrontBasicsValidationErrors>({});
  const [isDirty, setIsDirty] = useState(false);
  const [lastHydratedSignature, setLastHydratedSignature] = useState<string | null>(
    null
  );
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const [saveError, setSaveError] = useState("");
  const [slugState, setSlugState] = useState<StorefrontSlugState>({
    value: "",
    status: "idle",
  });

  useEffect(() => {
    if (profileQuery.isLoading || notificationEmailQuery.isLoading || !session) {
      return;
    }

    const nextDraft = {
      shopName: sellerProfile?.content.name ?? "",
      about: sellerProfile?.content.about ?? "",
      notificationEmail: sellerNotificationEmail ?? session.email ?? "",
      shopSlug: sellerProfile?.content.storefront?.shopSlug ?? "",
    };
    const nextSignature = JSON.stringify(nextDraft);

    if (isDirty || lastHydratedSignature === nextSignature) {
      return;
    }

    setDraft(nextDraft);
    setSlugState({
      value: nextDraft.shopSlug,
      status: "idle",
    });
    setErrors({});
    setSaveError("");
    setLastHydratedSignature(nextSignature);
  }, [
    notificationEmailQuery.isLoading,
    profileQuery.isLoading,
    session,
    sellerProfile,
    sellerNotificationEmail,
    isDirty,
    lastHydratedSignature,
  ]);

  if (!session) {
    return null;
  }

  const storefrontLoadError =
    profileQuery.error ?? notificationEmailQuery.error ?? null;
  const storefrontLoadErrorMessage = storefrontLoadError
    ? getErrorMessage(
        storefrontLoadError,
        "Storefront basics could not be loaded."
      )
    : "";

  if (
    (profileQuery.isLoading || notificationEmailQuery.isLoading) &&
    !lastHydratedSignature
  ) {
    return <LoadingScreen message="Loading storefront basics..." />;
  }

  if (storefrontLoadErrorMessage && !lastHydratedSignature) {
    return (
      <ScreenScrollView>
        <ScreenTitle
          eyebrow="Storefront basics"
          title="Storefront data unavailable"
          description="The seller storefront could not be loaded yet, so the form is paused until we can fetch the current values."
        />
        <SellerCard title="Could not load storefront basics">
          <Text style={styles.errorText}>{storefrontLoadErrorMessage}</Text>
          <ActionButton
            label="Retry storefront load"
            onPress={async () => {
              await Promise.allSettled([
                profileQuery.refetch(),
                notificationEmailQuery.refetch(),
              ]);
            }}
            variant="secondary"
            loading={profileQuery.isFetching || notificationEmailQuery.isFetching}
          />
        </SellerCard>
      </ScreenScrollView>
    );
  }

  const handleFieldChange = (field: keyof StorefrontBasicsDraft, value: string) => {
    setDraft((currentDraft) => ({
      ...currentDraft,
      [field]: value,
    }));
    setIsDirty(true);
    setErrors((currentErrors) => ({
      ...currentErrors,
      [field]: undefined,
    }));
    setSaveError("");
    setSaveMessage("");
    if (field === "shopSlug") {
      setSlugState((currentState) => ({
        ...currentState,
        value,
        status: currentState.status === "saved" ? "idle" : currentState.status,
        error: undefined,
      }));
    }
  };

  const handleSave = async () => {
    const normalizedDraft = {
      ...draft,
      shopSlug: normalizeStorefrontSlug(draft.shopSlug),
      notificationEmail: draft.notificationEmail.trim(),
    };
    const nextErrors = validateStorefrontBasicsDraft(normalizedDraft);

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      if (nextErrors.shopSlug) {
        setSlugState({
          value: normalizedDraft.shopSlug,
          status: "error",
          error: nextErrors.shopSlug,
        });
      }
      return;
    }

    setSaving(true);
    setSaveError("");
    setSaveMessage("");

    try {
      let savedSlug = normalizedDraft.shopSlug;
      const existingSlug = shopProfile?.content.storefront?.shopSlug ?? "";

      try {
        if (savedSlug) {
          setSlugState({
            value: savedSlug,
            status: "saving",
          });
          const slugResponse = await mobileApiClient.registerStorefrontSlug({
            pubkey: session.pubkey,
            slug: savedSlug,
          }, createSignedSellerActionAuthEvent(session, "storefront-slug-write"));
          savedSlug = slugResponse.slug;
          setSlugState({
            value: savedSlug,
            status: "saved",
          });
        } else if (existingSlug) {
          await mobileApiClient.deleteStorefrontSlug({
            pubkey: session.pubkey,
          }, createSignedSellerActionAuthEvent(session, "storefront-slug-write"));
          setSlugState({
            value: "",
            status: "saved",
          });
        }
      } catch (caughtError) {
        const message = getErrorMessage(
          caughtError,
          "Shop slug could not be updated."
        );
        setSaveError(`Shop slug step failed. ${message}`);
        setSlugState({
          value: savedSlug,
          status: "error",
          error: message,
        });
        return;
      }

      const nextContent = buildSellerShopProfileContent({
        existingContent: shopProfile?.content,
        draft: {
          ...normalizedDraft,
          shopSlug: savedSlug,
        },
        pubkey: session.pubkey,
      });

      try {
        await publishSellerShopProfile({
          baseUrl: getApiBaseUrl(),
          session,
          content: JSON.stringify(nextContent),
        });
      } catch (caughtError) {
        const message = getErrorMessage(
          caughtError,
          "Storefront profile publish failed."
        );
        setSaveError(
          `Shop slug was updated, but the storefront profile publish failed. ${message}`
        );
        return;
      }

      if (normalizedDraft.notificationEmail) {
        try {
          await mobileApiClient.saveSellerNotificationEmail({
            email: normalizedDraft.notificationEmail,
            role: "seller",
            pubkey: session.pubkey,
          }, createSignedSellerActionAuthEvent(session, "notification-email-write"));
        } catch (caughtError) {
          const message = getErrorMessage(
            caughtError,
            "Notification email could not be updated."
          );
          const partiallySavedDraft = {
            ...draft,
            shopSlug: savedSlug,
          };

          setDraft(partiallySavedDraft);
          setIsDirty(false);
          setLastHydratedSignature(JSON.stringify(partiallySavedDraft));
          setSaveError(
            `Storefront profile was saved, but the notification email step failed. ${message}`
          );

          await Promise.all([
            queryClient.invalidateQueries({
              queryKey: ["seller-profile", session.pubkey],
            }),
            queryClient.invalidateQueries({
              queryKey: ["seller-notification-email", session.pubkey],
            }),
          ]);
          return;
        }
      }

      const savedDraft = {
        ...normalizedDraft,
        shopSlug: savedSlug,
      };

      setDraft(savedDraft);
      setIsDirty(false);
      setLastHydratedSignature(JSON.stringify(savedDraft));
      setSaveMessage("Storefront basics saved.");

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["seller-profile", session.pubkey] }),
        queryClient.invalidateQueries({
          queryKey: ["seller-notification-email", session.pubkey],
        }),
      ]);
    } catch (caughtError) {
      const message =
        caughtError instanceof Error
          ? caughtError.message
          : "Failed to save storefront basics.";
      setSaveError(message);
      setSlugState((currentState) =>
        currentState.status === "saving"
          ? {
              ...currentState,
              status: "error",
              error: message,
            }
          : currentState
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScreenScrollView>
      <ScreenTitle
        eyebrow="Storefront basics"
        title="Edit the seller storefront core"
        description="Phase 2 only supports the fields we can confidently save across mobile and web today: shop name, about text, notification email, and public slug."
      />

      <SellerCard
        title="Current storefront state"
        description="Advanced storefront theme, sections, policies, and media editing remain intentionally deferred."
      >
        {storefrontLoadErrorMessage ? (
          <Text style={styles.errorText}>{storefrontLoadErrorMessage}</Text>
        ) : null}
        <StatusPill
          tone={shopProfile?.content.name ? "success" : "warning"}
          label={shopProfile?.content.name ? "Storefront basics saved" : "Needs seller details"}
        />
        <Text style={styles.summaryText}>
          Public slug: {shopProfile?.content.storefront?.shopSlug ?? "not set"}
        </Text>
      </SellerCard>

      <SellerCard title="Seller storefront form">
        <SellerField
          label="Shop name"
          value={draft.shopName}
          onChangeText={(value) => handleFieldChange("shopName", value)}
          placeholder="Milk Market Farm"
          error={errors.shopName}
        />
        <SellerField
          label="About"
          value={draft.about}
          onChangeText={(value) => handleFieldChange("about", value)}
          placeholder="Tell buyers what makes your storefront special."
          multiline
          error={errors.about}
        />
        <SellerField
          label="Notification email"
          value={draft.notificationEmail}
          onChangeText={(value) => handleFieldChange("notificationEmail", value)}
          placeholder="seller@example.com"
          keyboardType="email-address"
          autoCapitalize="none"
          error={errors.notificationEmail}
        />
        <SellerField
          label="Shop slug"
          value={draft.shopSlug}
          onChangeText={(value) => handleFieldChange("shopSlug", value)}
          placeholder="milk-market-farm"
          autoCapitalize="none"
          error={errors.shopSlug || slugState.error}
        />
        <Text style={styles.helperText}>
          Slugs are normalized to lowercase and used for the seller storefront URL.
        </Text>
        {saveError ? <Text style={styles.errorText}>{saveError}</Text> : null}
        {saveMessage ? <Text style={styles.successText}>{saveMessage}</Text> : null}
        <ActionButton
          label="Save storefront basics"
          onPress={handleSave}
          loading={saving}
          disabled={profileQuery.isFetching || notificationEmailQuery.isFetching}
        />
      </SellerCard>
    </ScreenScrollView>
  );
}

const styles = StyleSheet.create({
  summaryText: {
    color: sellerThemeTokens.text,
    fontSize: 15,
    lineHeight: 22,
  },
  helperText: {
    color: sellerThemeTokens.mutedText,
    fontSize: 14,
    lineHeight: 21,
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
