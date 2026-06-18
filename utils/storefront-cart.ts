import { storage, STORAGE_KEYS } from "./storage";

type StorefrontCartItem = {
  pubkey?: string;
};

export const getStorefrontCartQuantity = (sellerPubkey = "") => {
  const cartItems = storage.getJson<StorefrontCartItem[]>(
    STORAGE_KEYS.CART,
    [],
    {
      removeOnError: true,
      validate: Array.isArray,
    }
  );

  if (!sellerPubkey) {
    return cartItems.length;
  }

  return cartItems.filter((item) => item?.pubkey === sellerPubkey).length;
};
