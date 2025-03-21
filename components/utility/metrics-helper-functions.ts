import axios from "axios";
import { getLocalStorageData } from "./nostr-helper-functions";
import { ProductData } from "./product-parser-functions";
import { NostrSigner } from "@/utils/nostr/signers/nostr-signer";

const METRICS_TIMEOUT = 4200;

export async function capturePostListingMetric(
  signer: NostrSigner,
  id: string,
  tags: any[],
) {
  try {
    const userPubkey = await signer?.getPubKey?.();
    const { relays } = getLocalStorageData();
    await axios({
      method: "POST",
      url: "/api/metrics/post-listing",
      timeout: METRICS_TIMEOUT,
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
  } catch (error) {
    console.error("Failed to capture post listing metric:", error);
  }
}

export const captureInvoicePaidmetric = async (
  hash: string,
  productData: ProductData,
) => {
  try {
    const { mints } = getLocalStorageData();
    await axios({
      method: "POST",
      url: "/api/metrics/post-invoice-status",
      timeout: METRICS_TIMEOUT,
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
        currency: productData.currency,
        merchant_id: productData.pubkey,
        merchant_location: productData.location,
        mint: mints[0],
      },
    });
  } catch (error) {
    console.error("Failed to capture invoice paid metric:", error);
  }
};

export const captureCashuPaidMetric = async (productData: ProductData) => {
  try {
    const { mints } = getLocalStorageData();
    await axios({
      method: "POST",
      url: "/api/metrics/post-cashu-status",
      timeout: METRICS_TIMEOUT,
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
        currency: productData.currency,
        merchant_id: productData.pubkey,
        merchant_location: productData.location,
        mint: mints[0],
      },
    });
  } catch (error) {
    console.error("Failed to capture cashu paid metric:", error);
  }
};
