import { getLocalStorageJson } from "./safe-json";

type StorefrontCartItem = {
  pubkey?: string;
};

export const getStorefrontCartQuantity = (sellerPubkey = "") => {
  const cartItems = getLocalStorageJson<StorefrontCartItem[]>("cart", [], {
    removeOnError: true,
    validate: Array.isArray,
  });

  if (!sellerPubkey) {
    return cartItems.length;
  }

  return cartItems.filter((item) => item?.pubkey === sellerPubkey).length;
};
