import { Event } from "nostr-tools";
export type ItemType = "products" | "profiles" | "chats";

export interface NostrEvent extends Event {};

export interface NostrMessageEvent extends NostrEvent {
  read: boolean;
}

export interface ChatObject {
  unreadCount: number;
  decryptedChat: NostrMessageEvent[];
}
