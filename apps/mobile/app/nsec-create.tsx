import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { createSellerSessionFromNsec, generateSellerNsecCredentials } from "@milk-market/nostr";

import { ActionButton, ScreenScrollView, ScreenTitle, SellerCard } from "@/components/seller-ui";
import { useSessionUiStore } from "@/stores/session-ui-store";
import { useSessionStore } from "@/stores/session-store";
import { sellerThemeTokens } from "@/theme/tokens";

export default function NsecCreateScreen() {
  const router = useRouter();
  const saveSession = useSessionStore((state) => state.saveSession);
  const setLastUsedAuthMethod = useSessionUiStore((state) => state.setLastUsedAuthMethod);

  const [nsec, setNsec] = useState("");
  const [pubkey, setPubkey] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);

  const generateFreshCredentials = () => {
    try {
      const nextCredentials = generateSellerNsecCredentials();
      setNsec(nextCredentials.nsec);
      setPubkey(nextCredentials.pubkey);
      setGenerationError(null);
    } catch (error) {
      setNsec("");
      setPubkey("");
      setGenerationError(
        error instanceof Error
          ? error.message
          : "Unable to generate a seller key on this device right now."
      );
    }
  };

  useEffect(() => {
    generateFreshCredentials();
  }, []);

  const handleContinue = async () => {
    setSubmitting(true);
    try {
      await saveSession(
        createSellerSessionFromNsec(nsec, {
          authMethod: "nsec",
        })
      );
      setLastUsedAuthMethod("nsec");
      router.replace("/");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScreenScrollView>
      <ScreenTitle
        eyebrow="Seller access"
        title="Create a new seller key"
        description="Phase 2 generates a new seller nsec locally. Save it now if you want to reuse the same seller identity on web later."
      />

      <SellerCard title="Generated seller key">
        {generationError ? (
          <Text style={styles.errorText}>{generationError}</Text>
        ) : null}
        <View style={styles.secretBox}>
          <Text style={styles.secretLabel}>nsec</Text>
          <Text style={styles.secretValue}>{nsec}</Text>
        </View>
        <View style={styles.secretBox}>
          <Text style={styles.secretLabel}>pubkey</Text>
          <Text style={styles.secretValue}>{pubkey}</Text>
        </View>
        <Text style={styles.note}>
          Keep this nsec somewhere safe before continuing. Phase 2 does not
          include key export or recovery tooling yet.
        </Text>
        <ActionButton label="Generate another key" onPress={generateFreshCredentials} variant="secondary" />
        <ActionButton
          label="Continue with this seller key"
          onPress={handleContinue}
          loading={submitting}
          disabled={!nsec || !pubkey}
        />
      </SellerCard>
    </ScreenScrollView>
  );
}

const styles = StyleSheet.create({
  secretBox: {
    gap: 6,
    padding: 14,
    borderRadius: 14,
    backgroundColor: sellerThemeTokens.subduedSurface,
  },
  secretLabel: {
    color: sellerThemeTokens.primary,
    fontSize: 13,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  secretValue: {
    color: sellerThemeTokens.text,
    fontSize: 14,
    lineHeight: 21,
  },
  note: {
    color: sellerThemeTokens.warning,
    fontSize: 14,
    lineHeight: 21,
  },
  errorText: {
    color: sellerThemeTokens.danger,
    fontSize: 14,
    lineHeight: 21,
  },
});
