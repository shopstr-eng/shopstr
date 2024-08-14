import { createContext } from "react";
import { NostrMessageEvent, ProfileData } from "../types/types";
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
  mostRecentWalletEvent: any;
  proofEvents: any[];
  cashuWalletRelays: string[];
  cashuMints: string[];
  cashuProofs: Proof[];
  isLoading: boolean;
}

export const CashuWalletContext = createContext({
  mostRecentWalletEvent: {},
  proofEvents: [],
  cashuWalletRelays: [],
  cashuMints: [],
  cashuProofs: [],
  isLoading: true,
} as CashuWalletContextInterface);
