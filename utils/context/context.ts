import { createContext } from "react";
import { NostrMessageEvent, ProfileData, ShopSettings } from "../types/types";
import { Proof } from "@cashu/cashu-ts";

export interface ProfileContextInterface {
  profileData: Map<string, any>;
  isLoading: boolean;
  updateProfileData: (profileData: ProfileData) => void;
}

export const ProfileMapContext = createContext({
  profileData: new Map(),
  isLoading: true,
} as ProfileContextInterface);

export interface ShopContextInterface {
  shopData: Map<string, ShopSettings>;
  isLoading: boolean;
  updateShopData: (shopData: ShopSettings) => void;
}

export const ShopMapContext = createContext({
  shopData: new Map(),
  isLoading: true,
} as ShopContextInterface);

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

export interface ReviewsContextInterface {
  merchantReviewsData: Map<string, number[]>;
  productReviewsData: Map<string, Map<string, Map<string, string[][]>>>;
  isLoading: boolean;
  updateMerchantReviewsData: (
    merchantPubkey: string,
    merchantReviewsData: number[],
  ) => void;
  updateProductReviewsData: (
    merchantPubkey: string,
    productDTag: string,
    productReviewsData: Map<string, string[][]>,
  ) => void;
}

export const ReviewsContext = createContext({
  merchantReviewsData: new Map(),
  productReviewsData: new Map(),
  isLoading: true,
  updateMerchantReviewsData: (
    merchantPubkey: string,
    merchantReviewsData: number[],
  ) => {},
  updateProductReviewsData: (
    merchantPubkey: string,
    productDTag: string,
    productReviewsData: Map<string, string[][]>,
  ) => {},
} as ReviewsContextInterface);

export interface CartContextInterface {
  cartAddresses: string[][];
  isLoading: boolean;
  addProductToCart: (productData: any) => void;
  removeProductFromCart: (productData: any) => void;
}

export const CartContext = createContext({
  cartAddresses: [],
  isLoading: true,
  addProductToCart: (productData: any) => {},
  removeProductFromCart: (productData: any) => {},
} as CartContextInterface);

export type ChatsMap = Map<string, NostrMessageEvent[]>;

export interface ChatsContextInterface {
  chatsMap: ChatsMap;
  isLoading: boolean;
  addNewlyCreatedMessageEvent: (
    messageEvent: NostrMessageEvent,
    sent?: boolean,
  ) => void;
}

export const ChatsContext = createContext({
  chatsMap: new Map(),
  isLoading: true,
  addNewlyCreatedMessageEvent: (
    messageEvent: NostrMessageEvent,
    sent?: boolean,
  ) => {},
} as ChatsContextInterface);

export interface FollowsContextInterface {
  followList: string[];
  firstDegreeFollowsLength: number;
  isLoading: boolean;
}

export const FollowsContext = createContext({
  followList: [],
  firstDegreeFollowsLength: 0,
  isLoading: true,
} as FollowsContextInterface);

export interface RelaysContextInterface {
  relayList: string[];
  readRelayList: string[];
  writeRelayList: string[];
  isLoading: boolean;
}

export const RelaysContext = createContext({
  relayList: [],
  readRelayList: [],
  writeRelayList: [],
  isLoading: true,
} as RelaysContextInterface);

export interface CashuWalletContextInterface {
  proofEvents: any[];
  cashuMints: string[];
  cashuProofs: Proof[];
  isLoading: boolean;
}

export const CashuWalletContext = createContext({
  proofEvents: [],
  cashuMints: [],
  cashuProofs: [],
  isLoading: true,
} as CashuWalletContextInterface);
