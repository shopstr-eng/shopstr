import { Redirect, useRouter, type Href } from "expo-router";
import { StyleSheet, Text, View } from "react-native";

import { useSessionUiStore } from "@/stores/session-ui-store";
import { useSessionStore } from "@/stores/session-store";
import { sellerThemeTokens } from "@/theme/tokens";
import {
  ActionButton,
  ScreenScrollView,
  ScreenTitle,
  SellerCard,
} from "@/components/seller-ui";

export default function SignInScreen() {
  const router = useRouter();
  const session = useSessionStore((state) => state.session);
  const lastUsedAuthMethod = useSessionUiStore((state) => state.lastUsedAuthMethod);

  if (session) {
    return <Redirect href="/" />;
  }

  return (
    <ScreenScrollView>
      <ScreenTitle
        eyebrow="Phase 2 seller foundation"
        title="Sign in to your seller workspace"
        description="Phase 2 supports email access and nsec-based seller keys. Buyer flows, OAuth, and bunker login remain out of scope for now."
      />

      <SellerCard
        title="Seller access options"
        description="Use the same seller identity model as the web app, but store it securely on-device."
      >
        <ActionButton
          label="Email sign in or sign up"
          onPress={() => router.push("/email-auth" as Href)}
        />
        <ActionButton
          label="Import existing nsec"
          onPress={() => router.push("/nsec-import" as Href)}
          variant="secondary"
        />
        <ActionButton
          label="Create a new seller key"
          onPress={() => router.push("/nsec-create" as Href)}
          variant="secondary"
        />
      </SellerCard>

      <View style={styles.tipCard}>
        <Text style={styles.tipTitle}>Current focus</Text>
        <Text style={styles.tipBody}>
          This mobile phase is seller-only. After sign-in, you can review seller
          setup status, edit storefront basics, and view listings in read-only form.
        </Text>
        {lastUsedAuthMethod ? (
          <Text style={styles.tipMeta}>
            Last successful sign-in method: {lastUsedAuthMethod}
          </Text>
        ) : null}
      </View>
    </ScreenScrollView>
  );
}

const styles = StyleSheet.create({
  tipCard: {
    gap: 8,
    padding: 18,
    backgroundColor: sellerThemeTokens.subduedSurface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: sellerThemeTokens.border,
  },
  tipTitle: {
    color: sellerThemeTokens.text,
    fontSize: 18,
    fontWeight: "700",
  },
  tipBody: {
    color: sellerThemeTokens.mutedText,
    fontSize: 15,
    lineHeight: 22,
  },
  tipMeta: {
    color: sellerThemeTokens.primary,
    fontSize: 13,
    fontWeight: "700",
  },
});
