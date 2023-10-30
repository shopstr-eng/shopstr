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
