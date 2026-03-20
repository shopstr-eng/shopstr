import { Link, useLocalSearchParams, usePathname } from "expo-router";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { API_CLIENT_PACKAGE_READY } from "@milk-market/api-client";
import { CATEGORIES } from "@milk-market/domain";
import { NOSTR_PACKAGE_READY } from "@milk-market/nostr";

import { sellerThemeTokens } from "@/theme/tokens";

const acceptanceChecks = [
  "The app boots inside a native simulator through the Expo dev client.",
  "Expo Router can navigate to a standalone stack route.",
  "Workspace imports resolve at runtime from all shared packages.",
  "The custom milkmarket:// scheme can open this route directly.",
];

export default function PhaseOneCheckScreen() {
  const pathname = usePathname();
  const params = useLocalSearchParams<{ source?: string }>();

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.eyebrow}>Phase 1 acceptance route</Text>
      <Text style={styles.title}>Native runtime validation</Text>
      <Text style={styles.description}>
        Use this screen in the iOS Simulator or Android Emulator to close out Phase 1.
      </Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Runtime proof</Text>
        <View style={styles.statusRow}>
          <Text style={styles.statusLabel}>Current pathname</Text>
          <Text style={styles.statusValue}>{pathname}</Text>
        </View>
        <View style={styles.statusRow}>
          <Text style={styles.statusLabel}>Launch source</Text>
          <Text style={styles.statusValue}>{params.source ?? "direct"}</Text>
        </View>
        <View style={styles.statusRow}>
          <Text style={styles.statusLabel}>Domain package</Text>
          <Text style={styles.statusValue}>{CATEGORIES.length > 0 ? "Ready" : "Pending"}</Text>
        </View>
        <View style={styles.statusRow}>
          <Text style={styles.statusLabel}>Nostr package</Text>
          <Text style={styles.statusValue}>{NOSTR_PACKAGE_READY ? "Ready" : "Pending"}</Text>
        </View>
        <View style={styles.statusRow}>
          <Text style={styles.statusLabel}>API client package</Text>
          <Text style={styles.statusValue}>{API_CLIENT_PACKAGE_READY ? "Ready" : "Pending"}</Text>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Deep-link test URL</Text>
        <Text style={styles.codeBlock}>milkmarket://phase-one-check?source=deeplink</Text>
        <Text style={styles.helpText}>
          Open that URL from the simulator to confirm the custom scheme lands on this route.
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Acceptance checks</Text>
        {acceptanceChecks.map((item) => (
          <Text key={item} style={styles.listItem}>
            • {item}
          </Text>
        ))}
      </View>

      <Link href="/" style={styles.linkButton}>
        Back to dashboard
      </Link>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 20,
    gap: 16,
    backgroundColor: sellerThemeTokens.background,
  },
  eyebrow: {
    color: sellerThemeTokens.primary,
    fontSize: 13,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  title: {
    color: sellerThemeTokens.text,
    fontSize: 28,
    fontWeight: "800",
    lineHeight: 34,
  },
  description: {
    color: sellerThemeTokens.mutedText,
    fontSize: 16,
    lineHeight: 24,
  },
  card: {
    backgroundColor: sellerThemeTokens.surface,
    borderColor: sellerThemeTokens.border,
    borderWidth: 1,
    borderRadius: 18,
    padding: 18,
    gap: 10,
  },
  cardTitle: {
    color: sellerThemeTokens.text,
    fontSize: 18,
    fontWeight: "700",
  },
  statusRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 16,
  },
  statusLabel: {
    color: sellerThemeTokens.text,
    fontSize: 15,
  },
  statusValue: {
    color: sellerThemeTokens.primary,
    flexShrink: 1,
    fontSize: 15,
    fontWeight: "700",
    textAlign: "right",
  },
  codeBlock: {
    backgroundColor: sellerThemeTokens.background,
    borderColor: sellerThemeTokens.border,
    borderWidth: 1,
    borderRadius: 12,
    color: sellerThemeTokens.text,
    fontFamily: "Courier",
    fontSize: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  helpText: {
    color: sellerThemeTokens.mutedText,
    fontSize: 14,
    lineHeight: 20,
  },
  listItem: {
    color: sellerThemeTokens.text,
    fontSize: 15,
    lineHeight: 22,
  },
  linkButton: {
    backgroundColor: sellerThemeTokens.primary,
    borderRadius: 14,
    color: sellerThemeTokens.surface,
    fontWeight: "700",
    overflow: "hidden",
    paddingHorizontal: 16,
    paddingVertical: 12,
    textAlign: "center",
  },
});
