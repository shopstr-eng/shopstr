import { createContext } from "react";

export interface ProfileContextInterface {
  profileData: Map<string, any>;
  addPubkeyToFetch: (pubkey: [string]) => void;
}

export const ProfileMapContext = createContext({
  profileData: new Map(),
  addPubkeyToFetch: (pubkey: [string]) => {},
} as ProfileContextInterface);

export interface ProductContextInterface {
  productEvents: any;
  isLoading: boolean;
}

export const ProductContext = createContext({
  productEvents: {},
  isLoading: true,
} as ProductContextInterface);

export interface ChatContextInterface {
  chatPubkeys: string[];
  isLoading: boolean;
}

export const ChatContext = createContext({
  chatPubkeys: [],
  isLoading: true,
} as ChatContextInterface);

export interface MessageContextInterface {
  chatPubkeys: any;
  isLoading: boolean;
}

export const MessageContext = createContext({
  messages: {},
  isLoading: true,
} as MessageContextInterface);
