import { Link } from "expo-router";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { API_CLIENT_PACKAGE_READY } from "@milk-market/api-client";
import { CATEGORIES } from "@milk-market/domain";
import { NOSTR_PACKAGE_READY } from "@milk-market/nostr";

import { sellerThemeTokens } from "@/theme/tokens";

const packageStatus = [
  { label: "Domain package", ready: true },
  { label: "Nostr package", ready: NOSTR_PACKAGE_READY },
  { label: "API client package", ready: API_CLIENT_PACKAGE_READY },
];

export default function DashboardScreen() {
  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.eyebrow}>Phase 1 workspace foundation</Text>
      <Text style={styles.title}>Seller mobile shell is wired and ready for feature work.</Text>
      <Text style={styles.description}>
        This screen exists to prove the monorepo, Expo Router, deep-link scheme, and
        shared package imports are working before seller functionality is added.
      </Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Workspace package status</Text>
        {packageStatus.map((item) => (
          <View key={item.label} style={styles.statusRow}>
            <Text style={styles.statusLabel}>{item.label}</Text>
            <Text style={styles.statusValue}>{item.ready ? "Ready" : "Pending"}</Text>
          </View>
        ))}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Initial seller categories</Text>
        <View style={styles.chipWrap}>
          {CATEGORIES.slice(0, 6).map((category) => (
            <View key={category} style={styles.chip}>
              <Text style={styles.chipText}>{category}</Text>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.actionsRow}>
        <Link href="/listings" style={styles.linkButton}>
          Open listings shell
        </Link>
        <Link href="/storefront" style={styles.linkButtonSecondary}>
          Open storefront shell
        </Link>
        <Link
          href={{ pathname: "/phase-one-check", params: { source: "dashboard" } }}
          style={styles.linkButtonSecondary}
        >
          Open Phase 1 check
        </Link>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 20,
    gap: 16,
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
    gap: 12,
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
    fontSize: 15,
    fontWeight: "700",
  },
  chipWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    backgroundColor: sellerThemeTokens.background,
    borderColor: sellerThemeTokens.border,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  chipText: {
    color: sellerThemeTokens.text,
    fontSize: 14,
    fontWeight: "600",
  },
  actionsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  linkButton: {
    backgroundColor: sellerThemeTokens.primary,
    color: sellerThemeTokens.surface,
    borderRadius: 14,
    overflow: "hidden",
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontWeight: "700",
  },
  linkButtonSecondary: {
    backgroundColor: sellerThemeTokens.surface,
    borderColor: sellerThemeTokens.border,
    borderRadius: 14,
    borderWidth: 1,
    color: sellerThemeTokens.text,
    overflow: "hidden",
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontWeight: "700",
  },
});
