import { Platform } from "react-native";

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

export function getApiBaseUrl(): string {
  const envUrl = process.env.EXPO_PUBLIC_API_BASE_URL?.trim();
  if (envUrl) {
    return trimTrailingSlash(envUrl);
  }

  if (Platform.OS === "android") {
    return "http://10.0.2.2:5000";
  }

  return "http://127.0.0.1:5000";
}
