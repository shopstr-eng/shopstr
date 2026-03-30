import { useRouter } from "expo-router";
import { useState } from "react";
import { StyleSheet, Text } from "react-native";

import { createSellerSessionFromNsec, validateSellerNsec } from "@milk-market/nostr";

import { ActionButton, ScreenScrollView, ScreenTitle, SellerCard, SellerField } from "@/components/seller-ui";
import { useSessionUiStore } from "@/stores/session-ui-store";
import { useSessionStore } from "@/stores/session-store";
import { sellerThemeTokens } from "@/theme/tokens";

export default function NsecImportScreen() {
  const router = useRouter();
  const saveSession = useSessionStore((state) => state.saveSession);
  const setLastUsedAuthMethod = useSessionUiStore((state) => state.setLastUsedAuthMethod);

  const [nsec, setNsec] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleImport = async () => {
    const validation = validateSellerNsec(nsec);
    if (!validation.valid || !validation.normalized) {
      setError(validation.error ?? "Enter a valid nsec key.");
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      await saveSession(
        createSellerSessionFromNsec(validation.normalized, {
          authMethod: "nsec",
        })
      );
      setLastUsedAuthMethod("nsec");
      router.replace("/");
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Failed to import your seller key."
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScreenScrollView>
      <ScreenTitle
        eyebrow="Seller access"
        title="Import an existing nsec"
        description="Use this when you already manage the same Milk Market seller identity on web and want to continue with that account on mobile."
      />

      <SellerCard title="Nostr secret key">
        <SellerField
          label="nsec"
          value={nsec}
          onChangeText={(value) => {
            setNsec(value);
            if (error) {
              setError("");
            }
          }}
          placeholder="nsec1..."
          autoCapitalize="none"
        />
        <Text style={styles.helpText}>
          The key is stored in SecureStore. Phase 2 does not support bunker or
          extension sign-in yet.
        </Text>
        {error ? <Text style={styles.errorText}>{error}</Text> : null}
        <ActionButton
          label="Import seller key"
          onPress={handleImport}
          loading={submitting}
          disabled={!nsec.trim()}
        />
      </SellerCard>
    </ScreenScrollView>
  );
}

const styles = StyleSheet.create({
  helpText: {
    color: sellerThemeTokens.mutedText,
    fontSize: 14,
    lineHeight: 21,
  },
  errorText: {
    color: sellerThemeTokens.danger,
    fontSize: 14,
    fontWeight: "600",
  },
});
