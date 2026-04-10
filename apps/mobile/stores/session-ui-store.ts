import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import type { SellerAuthMethod } from "@milk-market/domain";

type SessionUiStoreState = {
  lastUsedAuthMethod: SellerAuthMethod | null;
  setLastUsedAuthMethod: (method: SellerAuthMethod) => void;
};

export const useSessionUiStore = create<SessionUiStoreState>()(
  persist(
    (set) => ({
      lastUsedAuthMethod: null,
      setLastUsedAuthMethod: (method) => {
        set({ lastUsedAuthMethod: method });
      },
    }),
    {
      name: "milk-market-seller-ui",
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
