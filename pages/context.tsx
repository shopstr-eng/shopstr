import { createContext } from "react";

export const ProfileMapContext = createContext({});

export interface ProductContextInterface {
  productData: any;
  isLoading: boolean;
}
export const ProductContext = createContext({
  productData: {},
  isLoading: true,
} as ProductContextInterface);
