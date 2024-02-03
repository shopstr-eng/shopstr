import { createContext } from "react";

export interface ProfileContextInterface {
  profileData: Map<string, any>;
  mergeProfileMaps: (profileMap: Map<string, any>) => void;
}

export const ProfileMapContext = createContext({
  profileData: new Map(),
  mergeProfileMaps: (profileMap: Map<string, any>) => {},
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
