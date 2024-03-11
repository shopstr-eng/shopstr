import { createContext } from "react";
import { NostrMessageEvent, ProfileData } from "../types/types";
import { ProductData } from "@/components/utility/product-parser-functions";

export interface ProfileContextInterface {
  profileData: Map<string, ProfileData>;
  isLoading: boolean;
  updateProfileData: (profileData: ProfileData) => void;
}

export const ProfileMapContext = createContext<ProfileContextInterface>({
  profileData: new Map<string, ProfileData>(),
  isLoading: true,
  updateProfileData: () => {},
});

export interface ProductContextInterface {
  productEvents: ProductData[];
  isLoading: boolean;
  setIsLoading: (isLoading: boolean) => void;
  filters: {
    searchQuery: string;
    categories: Set<string>;
    location: string | null;
  };
  setFilters: (filters: ProductContextInterface["filters"]) => void;
  addNewlyCreatedProductEvents: (
    productEvents: ProductData[],
    replace?: boolean,
  ) => void;
  removeDeletedProductEvent: (productId: string) => void;
}

export const ProductContext = createContext<ProductContextInterface>({
  productEvents: [],
  isLoading: true,
  setIsLoading: () => {},
  filters: {
    searchQuery: "",
    categories: new Set<string>([]),
    location: null,
  },
  setFilters: () => {},
  addNewlyCreatedProductEvents: () => {},
  removeDeletedProductEvent: () => {},
});

export const MyListingsContext = createContext<ProductContextInterface>({
  productEvents: [],
  isLoading: true,
  setIsLoading: () => {},
  filters: {
    searchQuery: "",
    categories: new Set<string>([]),
    location: null,
  },
  setFilters: () => {},
  addNewlyCreatedProductEvents: () => {},
  removeDeletedProductEvent: () => {},
});

export type ChatsMap = Map<string, NostrMessageEvent[]>;

export interface ChatsContextInterface {
  chatsMap: ChatsMap;
  isLoading: boolean;
}

export const ChatsContext = createContext<ChatsContextInterface>({
  chatsMap: new Map<string, NostrMessageEvent[]>(),
  isLoading: true,
});
