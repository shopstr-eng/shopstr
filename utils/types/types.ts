import { Event } from "nostr-tools";
export type ItemType = "products" | "profiles" | "chats";

export interface NostrEvent extends Event {}

export interface NostrMessageEvent extends NostrEvent {
  read: boolean;
}

export interface ChatObject {
  unreadCount: number;
  decryptedChat: NostrMessageEvent[];
}

export interface ShopSettings {
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
    shopstr_donation?: number;
  };
  created_at: number;
}

export interface Transaction {
  type: number;
  amount: number;
  date: number;
}

declare global {
  interface Window {
    webln: any;
  }
}
