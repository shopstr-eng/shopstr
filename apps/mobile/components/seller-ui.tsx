import type { PropsWithChildren } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  type TextInputProps,
  View,
  type KeyboardTypeOptions,
} from "react-native";

import { sellerThemeTokens } from "@/theme/tokens";

export function ScreenScrollView({ children }: PropsWithChildren) {
  return (
    <ScrollView
      contentContainerStyle={styles.screen}
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  );
}

export function ScreenTitle({
  eyebrow,
  title,
  description,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
}) {
  return (
    <View style={styles.titleBlock}>
      {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
      <Text style={styles.title}>{title}</Text>
      {description ? <Text style={styles.description}>{description}</Text> : null}
    </View>
  );
}

export function SellerCard({
  title,
  description,
  children,
}: PropsWithChildren<{
  title: string;
  description?: string;
}>) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle}>{title}</Text>
        {description ? <Text style={styles.cardDescription}>{description}</Text> : null}
      </View>
      {children}
    </View>
  );
}

export function SellerField({
  label,
  value,
  placeholder,
  onChangeText,
  multiline = false,
  keyboardType = "default",
  autoCapitalize = "sentences",
  secureTextEntry = false,
  error,
}: {
  label: string;
  value: string;
  placeholder?: string;
  onChangeText: (value: string) => void;
  multiline?: boolean;
  keyboardType?: KeyboardTypeOptions;
  autoCapitalize?: TextInputProps["autoCapitalize"];
  secureTextEntry?: boolean;
  error?: string;
}) {
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={[styles.fieldInput, multiline ? styles.fieldTextarea : null, error ? styles.fieldError : null]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={sellerThemeTokens.mutedText}
        multiline={multiline}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        secureTextEntry={secureTextEntry}
        textAlignVertical={multiline ? "top" : "center"}
      />
      {error ? <Text style={styles.fieldErrorText}>{error}</Text> : null}
    </View>
  );
}

export function ActionButton({
  label,
  onPress,
  variant = "primary",
  disabled = false,
  loading = false,
}: {
  label: string;
  onPress: () => void;
  variant?: "primary" | "secondary";
  disabled?: boolean;
  loading?: boolean;
}) {
  const isPrimary = variant === "primary";

  return (
    <Pressable
      style={({ pressed }) => [
        styles.button,
        isPrimary ? styles.buttonPrimary : styles.buttonSecondary,
        (disabled || loading) ? styles.buttonDisabled : null,
        pressed && !(disabled || loading) ? styles.buttonPressed : null,
      ]}
      disabled={disabled || loading}
      onPress={onPress}
    >
      {loading ? (
        <ActivityIndicator color={isPrimary ? sellerThemeTokens.surface : sellerThemeTokens.primary} />
      ) : (
        <Text
          style={[
            styles.buttonLabel,
            isPrimary ? styles.buttonLabelPrimary : styles.buttonLabelSecondary,
          ]}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}

export function StatusPill({
  tone,
  label,
}: {
  tone: "success" | "warning" | "danger" | "neutral";
  label: string;
}) {
  const toneStyle =
    tone === "success"
      ? styles.pillSuccess
      : tone === "warning"
        ? styles.pillWarning
        : tone === "danger"
          ? styles.pillDanger
          : styles.pillNeutral;

  return (
    <View style={[styles.pill, toneStyle]}>
      <Text style={styles.pillLabel}>{label}</Text>
    </View>
  );
}

export function EmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <View style={styles.emptyState}>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyDescription}>{description}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    padding: 20,
    gap: 16,
    backgroundColor: sellerThemeTokens.background,
  },
  titleBlock: {
    gap: 8,
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
    fontSize: 30,
    fontWeight: "800",
    lineHeight: 36,
  },
  description: {
    color: sellerThemeTokens.mutedText,
    fontSize: 16,
    lineHeight: 24,
  },
  card: {
    gap: 14,
    padding: 18,
    backgroundColor: sellerThemeTokens.surface,
    borderColor: sellerThemeTokens.border,
    borderWidth: 1,
    borderRadius: 18,
  },
  cardHeader: {
    gap: 6,
  },
  cardTitle: {
    color: sellerThemeTokens.text,
    fontSize: 19,
    fontWeight: "700",
  },
  cardDescription: {
    color: sellerThemeTokens.mutedText,
    fontSize: 14,
    lineHeight: 20,
  },
  fieldWrap: {
    gap: 8,
  },
  fieldLabel: {
    color: sellerThemeTokens.text,
    fontSize: 14,
    fontWeight: "700",
  },
  fieldInput: {
    minHeight: 52,
    borderWidth: 1,
    borderColor: sellerThemeTokens.border,
    borderRadius: 14,
    backgroundColor: sellerThemeTokens.surface,
    paddingHorizontal: 14,
    color: sellerThemeTokens.text,
    fontSize: 15,
  },
  fieldTextarea: {
    minHeight: 132,
    paddingTop: 14,
  },
  fieldError: {
    borderColor: sellerThemeTokens.danger,
  },
  fieldErrorText: {
    color: sellerThemeTokens.danger,
    fontSize: 13,
  },
  button: {
    minHeight: 50,
    paddingHorizontal: 16,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonPrimary: {
    backgroundColor: sellerThemeTokens.primary,
  },
  buttonSecondary: {
    backgroundColor: sellerThemeTokens.surface,
    borderWidth: 1,
    borderColor: sellerThemeTokens.border,
  },
  buttonDisabled: {
    opacity: 0.55,
  },
  buttonPressed: {
    transform: [{ translateY: 1 }],
  },
  buttonLabel: {
    fontSize: 15,
    fontWeight: "700",
  },
  buttonLabelPrimary: {
    color: sellerThemeTokens.surface,
  },
  buttonLabelSecondary: {
    color: sellerThemeTokens.text,
  },
  pill: {
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  pillSuccess: {
    backgroundColor: "#E7F7EF",
  },
  pillWarning: {
    backgroundColor: "#F8EFD9",
  },
  pillDanger: {
    backgroundColor: "#FBE8E6",
  },
  pillNeutral: {
    backgroundColor: sellerThemeTokens.subduedSurface,
  },
  pillLabel: {
    color: sellerThemeTokens.text,
    fontSize: 12,
    fontWeight: "700",
  },
  emptyState: {
    gap: 8,
    padding: 18,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: sellerThemeTokens.border,
    backgroundColor: sellerThemeTokens.subduedSurface,
  },
  emptyTitle: {
    color: sellerThemeTokens.text,
    fontSize: 18,
    fontWeight: "700",
  },
  emptyDescription: {
    color: sellerThemeTokens.mutedText,
    fontSize: 15,
    lineHeight: 22,
  },
});
