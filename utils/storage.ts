import { parseJsonWithFallback } from "./safe-json";
import type { StorageParseOptions } from "./safe-json";

/**
 * Storage Schema definition for consistent key management and type safety.
 * This acts as a single source of truth for all localStorage keys used in Shopstr.
 */
export const STORAGE_KEYS = {
  // Auth & Signer keys inherited from existing constants
  SIGNER: "signer",
  SIGN_IN_METHOD: "signInMethod",
  ENCRYPTED_PRIVATE_KEY: "encryptedPrivateKey",
  CLIENT_PUBKEY: "clientPubkey",
  CLIENT_PRIVKEY: "clientPrivkey",

  // Nostr & Relays
  RELAYS: "relays",
  READ_RELAYS: "readRelays",
  WRITE_RELAYS: "writeRelays",
  BLOSSOM_SERVERS: "blossomServers",

  // Wallet & Cashu
  MINTS: "mints",
  TOKENS: "tokens",
  HISTORY: "history",
  WOT: "wot",
  PENDING_MINT_QUOTES: "shopstr.pendingMintQuotes",

  // NWC
  NWC_STRING: "nwcString",
  NWC_INFO: "nwcInfo",

  // Bunker & Remote Signer
  BUNKER_REMOTE_PUBKEY: "bunkerRemotePubkey",
  BUNKER_RELAYS: "bunkerRelays",
  BUNKER_SECRET: "bunkerSecret",

  // Storefront & Cart (These were mostly unmanaged string literals)
  CART: "cart",
  CART_DISCOUNTS: "cartDiscounts",
  SF_SELLER_PUBKEY: "sf_seller_pubkey",
  SF_SHOP_SLUG: "sf_shop_slug",
  SHIPPING_INFO: "shopstr_shipping_info",
  ORDER_SUMMARY: "orderSummary",

  // System
  MIGRATION_COMPLETE: "migrationComplete",
  THEME: "theme",
  USER_NPUB: "userNPub",
  USER_PUBKEY: "userPubkey",
} as const;

export type StorageKey =
  | (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS]
  | string;

class StorageManager {
  /**
   * Safe check for browser environment to prevent Next.js SSR hydration crashes
   */
  private get isBrowser(): boolean {
    return typeof window !== "undefined";
  }

  /**
   * Get a string item from localStorage
   */
  getItem(key: StorageKey): string | null {
    if (!this.isBrowser) return null;
    return localStorage.getItem(key);
  }

  /**
   * Set a string item in localStorage
   */
  setItem(key: StorageKey, value: string): void {
    if (!this.isBrowser) return;
    localStorage.setItem(key, value);
  }

  /**
   * Remove an item from localStorage
   */
  removeItem(key: StorageKey): void {
    if (!this.isBrowser) return;
    localStorage.removeItem(key);
  }

  /**
   * Get and parse JSON data with a fallback and type-safety
   */
  getJson<T>(
    key: StorageKey,
    fallback: T,
    options?: StorageParseOptions<T>
  ): T {
    if (!this.isBrowser) return fallback;
    const raw = localStorage.getItem(key);
    return parseJsonWithFallback(raw, fallback, {
      ...options,
      onError: (err) => {
        options?.onError?.(err);
        console.warn(`Storage parse error for key "${key}":`, err);
      },
    });
  }

  /**
   * Stringify and set JSON data in localStorage safely
   */
  setJson<T>(key: StorageKey, value: T): void {
    if (!this.isBrowser) return;
    try {
      const serialized = JSON.stringify(value);
      localStorage.setItem(key, serialized);
    } catch (err) {
      console.error(`Failed to serialize data for storage key "${key}":`, err);
    }
  }

  /**
   * Clear multiple specific keys. Useful for logout routines.
   */
  clearKeys(keys: StorageKey[]): void {
    if (!this.isBrowser) return;
    keys.forEach((key) => localStorage.removeItem(key));
  }

  /**
   * Clear ALL Shopstr-related storage.
   */
  clearAll(): void {
    if (!this.isBrowser) return;
    localStorage.clear();
    sessionStorage.clear();
  }

  // Session Storage Helpers (for non-persistent session data)

  setSessionItem(key: string, value: string): void {
    if (!this.isBrowser) return;
    sessionStorage.setItem(key, value);
  }

  getSessionItem(key: string): string | null {
    if (!this.isBrowser) return null;
    return sessionStorage.getItem(key);
  }

  /**
   * Get and parse JSON data from sessionStorage
   */
  getSessionJson<T>(
    key: string,
    fallback: T,
    options?: StorageParseOptions<T>
  ): T {
    if (!this.isBrowser) return fallback;
    const raw = sessionStorage.getItem(key);
    return parseJsonWithFallback(raw, fallback, {
      ...options,
      onError: (err) => {
        options?.onError?.(err);
        console.warn(`SessionStorage parse error for key "${key}":`, err);
      },
    });
  }

  /**
   * Stringify and set JSON data in sessionStorage
   */
  setSessionJson<T>(key: string, value: T): void {
    if (!this.isBrowser) return;
    try {
      const serialized = JSON.stringify(value);
      sessionStorage.setItem(key, serialized);
    } catch (err) {
      console.error(`Failed to serialize session data for key "${key}":`, err);
    }
  }

  /**
   * Remove an item from sessionStorage
   */
  removeSessionItem(key: string): void {
    if (!this.isBrowser) return;
    sessionStorage.removeItem(key);
  }
}

export const storage = new StorageManager();
