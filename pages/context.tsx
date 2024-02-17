import { createContext } from "react";

export interface ProfileContextInterface {
  profileData: Map<string, any>;
  isLoading: boolean;
}

export const ProfileMapContext = createContext({
  profileData: new Map(),
  isLoading: true,
} as ProfileContextInterface);

export interface ProductContextInterface {
  productEvents: any;
  isLoading: boolean;
  addNewlyCreatedProductEvent: (productEvent: any) => void;
  removeDeletedProductEvent: (productId: string) => void;
}

export const ProductContext = createContext({
  productEvents: {},
  isLoading: true,
  addNewlyCreatedProductEvent: (productEvent: any) => {},
  removeDeletedProductEvent: (productId: string) => {},
} as ProductContextInterface);

export interface ChatsContextInterface {
  chats: Map<string, any>;
  isLoading: boolean;
}

export const ChatsContext = createContext({
  chats: new Map(),
  isLoading: true,
} as ChatsContextInterface);
