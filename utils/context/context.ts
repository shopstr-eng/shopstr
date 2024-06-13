import { createContext } from "react";
import { NostrMessageEvent, ProfileData } from "../types/types";

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
}

export const ChatsContext = createContext({
  chatsMap: new Map(),
  isLoading: true,
} as ChatsContextInterface);

export interface FollowsAndRelaysContextInterface {
  followList: string[];
  firstDegreeFollowsLength: number;
  relayList: string[];
  readRelayList: string[];
  writeRelayList: string[];
  isLoading: boolean;
}

export const FollowsAndRelaysContext = createContext({
  followList: [],
  firstDegreeFollowsLength: 0,
  relayList: [],
  readRelayList: [],
  writeRelayList: [],
  isLoading: true,
} as FollowsAndRelaysContextInterface);
