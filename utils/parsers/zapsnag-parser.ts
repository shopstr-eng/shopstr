import { NostrEvent } from "@/utils/types/types";
import { ProductData } from "./product-parser-functions";

export const parseZapsnagNote = (event: NostrEvent): ProductData => {
  const content = event.content;

  const priceRegex =
    /(?:price|cost|⚡)\s*[:=-]?\s*(\d+[\d,]*)\s*(sats?|satoshis?|usd|eur)?/i;
  const match = content.match(priceRegex);

  let price = 0;
  let currency = "sats";

  if (match && match[1]) {
    price = parseInt(match[1].replace(/,/g, ""));
    if (match[2]) {
      const curr = match[2].toLowerCase();
      if (curr.includes("usd")) currency = "USD";
      else if (curr.includes("eur")) currency = "EUR";
    }
  }

  const imageRegex = /(https?:\/\/[^\s]+\.(?:png|jpg|jpeg|gif|webp))/i;
  const imageMatch = content.match(imageRegex);
  let image = imageMatch ? imageMatch[0] : `https://robohash.org/${event.id}`;

  if (!image.startsWith("http")) {
    image = `https://robohash.org/${event.id}`;
  }

  const cleanContent = content
    .replace(priceRegex, "")
    .replace(/#milk-market-zapsnag/gi, "")
    .replace(imageRegex, "")
    .trim();

  const title =
    cleanContent.length > 0
      ? cleanContent.length > 50
        ? cleanContent.substring(0, 50) + "..."
        : cleanContent
      : "Flash Sale Item";

  return {
    id: event.id,
    pubkey: event.pubkey,
    createdAt: event.created_at,
    title: title,
    summary: content,
    publishedAt: String(event.created_at),
    images: [image],
    categories: ["zapsnag"],
    location: "Global",
    price: price,
    currency: currency,
    totalCost: price,
    shippingType: "Free",
    d: "zapsnag",
    status: "active",
    rawEvent: event,
  };
};
