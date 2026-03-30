import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import { sellerThemeTokens } from "@/theme/tokens";

export default function LoadingScreen({
  message,
}: {
  message: string;
}) {
  return (
    <View style={styles.container}>
      <ActivityIndicator color={sellerThemeTokens.primary} size="large" />
      <Text style={styles.message}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    padding: 24,
    backgroundColor: sellerThemeTokens.background,
  },
  message: {
    color: sellerThemeTokens.mutedText,
    fontSize: 16,
    textAlign: "center",
  },
});
