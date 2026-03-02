import { createContext } from "react";
import type {
  NostrEvent,
  NostrMessageEvent,
  ProfileData,
  ShopProfile,
  Community,
  CommunityPost,
} from "../types/types";
import type { Proof } from "@cashu/cashu-ts";

export interface CashuProofEvent {
  id: string;
  proofs: Proof[];
  [key: string]: unknown;
}

export interface ProfileContextInterface {
  profileData: Map<string, ProfileData>;
  isLoading: boolean;
  updateProfileData: (profileData: ProfileData) => void;
}

export const ProfileMapContext = createContext({
  profileData: new Map<string, ProfileData>(),
  isLoading: true,
} as ProfileContextInterface);

export interface ShopContextInterface {
  shopData: Map<string, ShopProfile>;
  isLoading: boolean;
  updateShopData: (shopData: ShopProfile) => void;
}

export const ShopMapContext = createContext({
  shopData: new Map(),
  isLoading: true,
} as ShopContextInterface);

export interface ProductContextInterface {
  productEvents: NostrEvent[];
  isLoading: boolean;
  addNewlyCreatedProductEvent: (productEvent: NostrEvent) => void;
  removeDeletedProductEvent: (productId: string) => void;
}

export const ProductContext = createContext({
  productEvents: [] as NostrEvent[],
  isLoading: true,
  addNewlyCreatedProductEvent: (_productEvent: NostrEvent) => {},
  removeDeletedProductEvent: (_productId: string) => {},
} as ProductContextInterface);

export interface ReviewsContextInterface {
  merchantReviewsData: Map<string, number[]>;
  productReviewsData: Map<string, Map<string, Map<string, string[][]>>>;
  isLoading: boolean;
  updateMerchantReviewsData: (
    merchantPubkey: string,
    merchantReviewsData: number[]
  ) => void;
  updateProductReviewsData: (
    merchantPubkey: string,
    productDTag: string,
    productReviewsData: Map<string, string[][]>
  ) => void;
}

export const ReviewsContext = createContext({
  merchantReviewsData: new Map(),
  productReviewsData: new Map(),
  isLoading: true,
  updateMerchantReviewsData: (
    _merchantPubkey: string,
    _merchantReviewsData: number[]
  ) => {},
  updateProductReviewsData: (
    _merchantPubkey: string,
    _productDTag: string,
    _productReviewsData: Map<string, string[][]>
  ) => {},
} as ReviewsContextInterface);

export interface CartContextInterface {
  cartAddresses: string[][];
  isLoading: boolean;
  addProductToCart: (productData: unknown) => void;
  removeProductFromCart: (productData: unknown) => void;
}

export const CartContext = createContext({
  cartAddresses: [],
  isLoading: true,
  addProductToCart: (_productData: unknown) => {},
  removeProductFromCart: (_productData: unknown) => {},
} as CartContextInterface);

export type ChatsMap = Map<string, NostrMessageEvent[]>;

export interface ChatsContextInterface {
  chatsMap: ChatsMap;
  isLoading: boolean;
  addNewlyCreatedMessageEvent: (
    messageEvent: NostrMessageEvent,
    sent?: boolean
  ) => void;
  markAllMessagesAsRead: () => Promise<string[]>;
  newOrderIds: Set<string>;
}

export const ChatsContext = createContext({
  chatsMap: new Map(),
  isLoading: true,
  addNewlyCreatedMessageEvent: (
    _messageEvent: NostrMessageEvent,
    _sent?: boolean
  ) => {},
  markAllMessagesAsRead: async () => [] as string[],
  newOrderIds: new Set<string>(),
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

export interface BlossomContextInterface {
  blossomServers: string[];
  isLoading: boolean;
}

export const BlossomContext = createContext({
  blossomServers: [],
  isLoading: true,
} as BlossomContextInterface);

export interface CashuWalletContextInterface {
  proofEvents: CashuProofEvent[];
  cashuMints: string[];
  cashuProofs: Proof[];
  isLoading: boolean;
}

export const CashuWalletContext = createContext({
  proofEvents: [] as CashuProofEvent[],
  cashuMints: [],
  cashuProofs: [],
  isLoading: true,
} as CashuWalletContextInterface);

export interface CommunityContextInterface {
  communities: Map<string, Community>; // key is event id
  posts: Map<string, CommunityPost[]>; // key is community address (a-tag)
  isLoading: boolean;
  addCommunity: (community: Community) => void;
}

export const CommunityContext = createContext({
  communities: new Map(),
  posts: new Map(),
  isLoading: true,
  addCommunity: (_community: Community) => {},
} as CommunityContextInterface);
