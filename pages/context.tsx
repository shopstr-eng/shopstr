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

export interface ChatsContextInterface {
  chats: Map<string, any>;
  isLoading: boolean;
}

export const ChatsContext = createContext({
  chats: new Map(),
  isLoading: true,
} as ChatsContextInterface);
