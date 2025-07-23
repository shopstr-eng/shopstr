import { Event } from "nostr-tools";

export type ItemType = "products" | "profiles" | "chats";

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
    webln: any;
    nostr: any;
  }
}
