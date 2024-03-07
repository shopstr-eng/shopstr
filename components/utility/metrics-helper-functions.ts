import axios from "axios";
import { getLocalStorageData } from "./nostr-helper-functions";

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
  metricsInvoiceId: string,
  listingId: string,
) => {
  const { mints } = getLocalStorageData();
  await axios({
    method: "POST",
    url: "/api/metrics/post-invoice-status",
    headers: {
      "Content-Type": "application/json",
    },
    data: {
      id: metricsInvoiceId,
      listing_id: listingId,
      merchant_location: location,
      mint: mints[0],
    },
  });
};
