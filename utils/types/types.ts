import { Event } from "nostr-tools";

export const KIND_FUNDSTR_TIER = 30078;
export const KIND_FUNDSTR_PLEDGE = 30079;
export const KIND_FUNDSTR_PAYMENT_RECEIPT = 30080;

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

export interface FundstrTierData {
  id: string; // Event ID
  pubkey: string; // Creator's pubkey
  d: string; // Unique identifier for the tier (tag 'd')
  title: string; // Name of the tier (tag 'title')
  description: string; // Benefits or description (tag 'description')
  amount: string; // Suggested support amount (tag 'amount') - using string for flexibility with sats/fiat
  currency: string; // Currency of the amount (tag 'currency')
  recurrence: "daily" | "weekly" | "monthly"; // Recurrence interval (tag 'recurrence')
  image?: string; // Optional image for the tier (tag 'image')
  active: "true" | "false"; // Tier status (tag 'active') - using string as per event structure example
  createdAt: number; // Timestamp of event creation
}

export interface FundstrPledgeData {
  id: string; // Event ID
  pubkey: string; // Supporter's pubkey
  d: string; // Unique identifier for the pledge (tag 'd')
  a: string; // Address of the FundstrTierData event (tag 'a': KIND_FUNDSTR_TIER:creator_pubkey:tier_d_tag)
  p: string; // Creator's public key being supported (tag 'p')
  amount: string; // Actual amount committed (tag 'amount') - using string
  currency: string; // Currency of the pledge (tag 'currency')
  recurrence: "daily" | "weekly"; // Chosen recurrence (tag 'recurrence')
  start_date?: number; // Optional: Timestamp for when recurring support starts (tag 'start_date')
  status: "active" | "paused" | "cancelled"; // Pledge status (tag 'status')
  payment_method?: string; // Optional: e.g., "lightning", "lnurl" (tag 'payment_method')
  last_payment_date?: number; // Optional: Timestamp of the last successful payment (tag 'last_payment_date')
  next_payment_date?: number; // Optional: Timestamp for the next scheduled payment (tag 'next_payment_date')
  encrypted_note?: string; // Optional: Content of the event, potentially encrypted (event.content)
  createdAt: number; // Timestamp of event creation
}

export interface PaymentReceiptData {
  id: string; // Event ID
  pubkey: string; // Pubkey of the entity that created the receipt (supporter or a payment agent)
  e: string; // Reference to the FundstrPledgeData event (tag 'e': KIND_FUNDSTR_PLEDGE:supporter_pubkey:pledge_d_tag)
  p: string; // Creator's pubkey who received the payment (tag 'p')
  bolt11?: string; // Optional: The Lightning invoice that was paid (tag 'bolt11')
  preimage?: string; // Optional: The payment preimage (tag 'preimage')
  amount_paid: string; // Amount paid, using string for consistency (tag 'amount_paid')
  currency_paid?: string; // Optional: currency of amount_paid, defaults to sats if not present (tag 'currency_paid')
  payment_date: number; // Timestamp of when the payment was made (tag 'payment_date')
  created_at: number; // Timestamp of the receipt event creation
  // Potentially other tags like transaction_id if from a specific payment processor
}
