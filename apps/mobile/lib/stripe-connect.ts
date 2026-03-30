import * as Linking from "expo-linking";

export type StripeConnectCallbackStatus = "success" | "refresh";

export function createStripeConnectRedirectBaseUrl() {
  return Linking.createURL("/stripe-connect-return", {
    scheme: "milkmarket",
  });
}

export function createStripeConnectRedirectUrl(
  status?: StripeConnectCallbackStatus
) {
  return Linking.createURL("/stripe-connect-return", {
    scheme: "milkmarket",
    queryParams:
      status === "success"
        ? { success: "true" }
        : status === "refresh"
          ? { refresh: "true" }
          : undefined,
  });
}

export function getStripeConnectCallbackStatus(
  input?: string | null
): StripeConnectCallbackStatus | null {
  if (!input) {
    return null;
  }

  const parsed = Linking.parse(input);
  const success = parsed.queryParams?.success;
  if (success === "true") {
    return "success";
  }

  const refresh = parsed.queryParams?.refresh;
  if (refresh === "true") {
    return "refresh";
  }

  return null;
}
