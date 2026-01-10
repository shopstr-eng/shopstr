import { Event } from "nostr-tools";

export type ItemType = "products" | "profiles" | "chats" | "communities";

type ProductFormValue = [key: string, ...values: string[]];
export type ProductFormValues = ProductFormValue[];

export interface NostrEvent extends Event {}

export interface NostrMessageEvent extends NostrEvent {
  read: boolean;
}

export interface ChatObject {
  unreadCount: number;
  decryptedChat: NostrMessageEvent[];
}

export interface CommunityRelays {
  approvals: string[]; // relays to publish/fetch approvals
  requests: string[]; // relays to publish/fetch post requests
  metadata: string[]; // relays for community author metadata (profile)
  all: string[]; // flattened list of all relays declared
}

export interface Community {
  id: string; // community definition event id
  kind: number;
  pubkey: string; // author pubkey
  createdAt: number;
  d: string; // identifier (a-tag identifier)
  name: string;
  description: string;
  image: string;
  moderators: string[];
  relays: CommunityRelays;
  // backward compatibility: keep a simple relays array optional
  relaysList?: string[];
}

export interface CommunityPost extends NostrEvent {
  // Augmented by fetchCommunityPosts: optional approval metadata
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

export interface ShippingFormData {
  Name: string;
  Address: string;
  Unit?: string;
  City: string;
  "Postal Code": string;
  "State/Province": string;
  Country: string;
  Required?: string;
}

export interface ContactFormData {
  Contact: string;
  "Contact Type": string;
  Instructions: string;
  Required?: string;
}

export interface CombinedFormData {
  Name: string;
  Address: string;
  Unit?: string;
  City: string;
  "Postal Code": string;
  "State/Province": string;
  Country: string;
  Contact: string;
  "Contact Type": string;
  Instructions: string;
  Required?: string;
}

declare global {
  interface Window {
    // For NIP-07 browser extensions
    nostr: {
      getPublicKey: () => Promise<string>;
      signEvent: (event: any) => Promise<any>;
      nip44: {
        encrypt: (pubkey: string, plainText: string) => Promise<string>;
        decrypt: (pubkey: string, cipherText: string) => Promise<string>;
      };
    };
    // For WebLN (which Alby SDK also polyfills)
    webln: any;
  }
}
