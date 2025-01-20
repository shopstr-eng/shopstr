import axios from "axios";
import { getLocalStorageData } from "./nostr-helper-functions";
import { ProductData } from "./product-parser-functions";

export async function capturePostListingMetric(id: string, tags: any[]) {
  const { userPubkey, relays } = getLocalStorageData();
  axios({
    method: "POST",
    url: "/api/metrics/post-listing",
    headers: {
      "Content-Type": "application/json",
    },
    data: {
      listing_id: id,
      merchant_id: userPubkey,
      merchant_location:
        tags.find(([key]: [key: string]) => key === "location")?.[1] || "",
      relays,
    },
  });
}

export const captureInvoicePaidmetric = async (
  hash: string,
  productData: ProductData,
) => {
  const { mints } = getLocalStorageData();
  await axios({
    method: "POST",
    url: "/api/metrics/post-invoice-status",
    headers: {
      "Content-Type": "application/json",
    },
    data: {
      hash,
      listing_id: productData.id,
      total: productData.totalCost,
      sub_total: productData.price,
      tip_total: 0,
      shipping_total: productData.shippingCost,
      discount_total: 0,
      fee_total: 0,
      tax_total: 0,
      currency: "SATS",
      merchant_id: productData.pubkey,
      merchant_location: productData.location,
      mint: mints[0],
    },
  });
};

export const captureCashuPaidMetric = async (productData: ProductData) => {
  const { mints } = getLocalStorageData();
  await axios({
    method: "POST",
    url: "/api/metrics/post-cashu-status",
    headers: {
      "Content-Type": "application/json",
    },
    data: {
      listing_id: productData.id,
      total: productData.totalCost,
      sub_total: productData.price,
      tip_total: 0,
      shipping_total: productData.shippingCost,
      discount_total: 0,
      fee_total: 0,
      tax_total: 0,
      currency: "SATS",
      merchant_id: productData.pubkey,
      merchant_location: productData.location,
      mint: mints[0],
    },
  });
};
