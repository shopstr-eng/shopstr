import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { createSellerSessionFromNsec } from "@milk-market/nostr";

import {
  ActionButton,
  ScreenScrollView,
  ScreenTitle,
  SellerCard,
  SellerField,
} from "@/components/seller-ui";
import { mobileApiClient } from "@/lib/api-client";
import { useSessionUiStore } from "@/stores/session-ui-store";
import { useSessionStore } from "@/stores/session-store";
import { sellerThemeTokens } from "@/theme/tokens";

export default function EmailAuthScreen() {
  const router = useRouter();
  const saveSession = useSessionStore((state) => state.saveSession);
  const setLastUsedAuthMethod = useSessionUiStore(
    (state) => state.setLastUsedAuthMethod
  );

  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    setSubmitting(true);
    setError("");

    try {
      const response =
        mode === "sign-in"
          ? await mobileApiClient.emailSignIn({ email, password })
          : await mobileApiClient.emailSignUp({ email, password });

      const session = createSellerSessionFromNsec(response.nsec, {
        authMethod: "email",
        email: email.trim(),
      });

      await saveSession(session);
      setLastUsedAuthMethod("email");
      router.replace("/");
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Email access failed. Please try again."
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScreenScrollView>
      <ScreenTitle
        eyebrow="Seller access"
        title={mode === "sign-in" ? "Email sign in" : "Create seller account"}
        description="These flows reuse the existing web auth endpoints and restore the seller session securely on-device."
      />

      <SellerCard title="Email credentials">
        <View style={styles.toggleRow}>
          {(["sign-in", "sign-up"] as const).map((value) => (
            <Pressable
              key={value}
              style={[
                styles.toggleButton,
                mode === value ? styles.toggleButtonActive : null,
              ]}
              onPress={() => setMode(value)}
            >
              <Text
                style={[
                  styles.toggleLabel,
                  mode === value ? styles.toggleLabelActive : null,
                ]}
              >
                {value === "sign-in" ? "Sign in" : "Sign up"}
              </Text>
            </Pressable>
          ))}
        </View>

        <SellerField
          label="Email"
          value={email}
          onChangeText={setEmail}
          placeholder="seller@example.com"
          keyboardType="email-address"
          autoCapitalize="none"
        />
        <SellerField
          label="Password"
          value={password}
          onChangeText={setPassword}
          placeholder="Enter your password"
          autoCapitalize="none"
          secureTextEntry
        />
        {error ? <Text style={styles.errorText}>{error}</Text> : null}
        <ActionButton
          label={
            mode === "sign-in"
              ? "Continue to seller workspace"
              : "Create seller account"
          }
          onPress={handleSubmit}
          loading={submitting}
          disabled={!email.trim() || !password.trim()}
        />
      </SellerCard>
    </ScreenScrollView>
  );
}

const styles = StyleSheet.create({
  toggleRow: {
    flexDirection: "row",
    gap: 8,
    padding: 4,
    borderRadius: 16,
    backgroundColor: sellerThemeTokens.subduedSurface,
  },
  toggleButton: {
    flex: 1,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
  },
  toggleButtonActive: {
    backgroundColor: sellerThemeTokens.surface,
  },
  toggleLabel: {
    color: sellerThemeTokens.mutedText,
    fontSize: 14,
    fontWeight: "700",
  },
  toggleLabelActive: {
    color: sellerThemeTokens.text,
  },
  errorText: {
    color: sellerThemeTokens.danger,
    fontSize: 14,
    fontWeight: "600",
  },
});
