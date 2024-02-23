import axios from "axios";
import { getLocalStorageData } from "./nostr-helper-functions";

export async function capturePostListingMetric(id, tags) {
  const { decryptedNpub, relays } = getLocalStorageData();
  axios({
    method: "POST",
    url: "/api/metrics/post-listing",
    headers: {
      "Content-Type": "application/json",
    },
    data: {
      listing_id: id,
      merchant_id: decryptedNpub,
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
    },
  });
};
