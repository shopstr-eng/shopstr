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

export interface ProfileData {
  pubkey: string;
  content: {
    name: string;
    picture: string;
    about: string;
    banner: string;
    lud16: string;
    nip05: string;
  };
  created_at: number;
}
