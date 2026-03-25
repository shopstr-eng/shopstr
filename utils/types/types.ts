import type { StorefrontConfig } from "@milk-market/domain";
import { Event } from "nostr-tools";

export type {
  CombinedFormData,
  ContactFormData,
  ProductFormValues,
  ShippingFormData,
  StorefrontColorScheme,
  StorefrontComparisonColumn,
  StorefrontConfig,
  StorefrontEmailPopup,
  StorefrontFaqItem,
  StorefrontFooter,
  StorefrontIngredientItem,
  StorefrontNavLink,
  StorefrontPage,
  StorefrontPolicies,
  StorefrontPolicy,
  StorefrontSection,
  StorefrontSectionType,
  StorefrontSocialLink,
  StorefrontTestimonial,
  StorefrontTimelineItem,
} from "@milk-market/domain";

export type ItemType = "products" | "profiles" | "chats" | "communities";

export interface NostrEvent extends Event {}

export interface NostrMessageEvent extends NostrEvent {
  read: boolean;
  wrappedEventId?: string;
}

export interface ChatObject {
  unreadCount: number;
  decryptedChat: NostrMessageEvent[];
}

export interface CommunityRelays {
  approvals: string[];
  requests: string[];
  metadata: string[];
  all: string[];
}

export interface Community {
  id: string;
  kind: number;
  pubkey: string;
  createdAt: number;
  d: string;
  name: string;
  description: string;
  image: string;
  moderators: string[];
  relays: CommunityRelays;
  relaysList?: string[];
}

export interface CommunityPost extends NostrEvent {
  approved?: boolean;
  approvalEventId?: string;
  approvedBy?: string;
}
export interface ShopProfile {
  pubkey: string;
  content: {
    name: string;
    about: string;
    ui: {
      picture: string;
      banner: string;
      theme: string;
      darkMode: boolean;
    };
    merchants: string[];
    freeShippingThreshold?: number;
    freeShippingCurrency?: string;
    paymentMethodDiscounts?: { [method: string]: number };
    storefront?: StorefrontConfig;
  };
  created_at: number;
  event?: NostrEvent;
}

export interface ProfileData {
  pubkey: string;
  content: {
    name?: string;
    picture?: string;
    about?: string;
    banner?: string;
    lud16?: string;
    nip05?: string;
    payment_preference?: string;
    fiat_options?: string[];
    shopstr_donation?: number;
  };
  created_at: number;
}

export interface Transaction {
  type: number;
  amount: number;
  date: number;
}

export type FiatOptionsType = {
  [key: string]: string;
};

declare global {
  interface Window {
    nostr: {
      getPublicKey: () => Promise<string>;
      signEvent: (event: any) => Promise<any>;
      nip44: {
        encrypt: (pubkey: string, plainText: string) => Promise<string>;
        decrypt: (pubkey: string, cipherText: string) => Promise<string>;
      };
    };
    webln: any;
  }
}
