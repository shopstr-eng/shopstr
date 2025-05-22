import { NostrEvent, FundstrTierData } from "@/utils/types/types";

export const parseTierEvent = (event: NostrEvent): FundstrTierData => {
  const parsed: FundstrTierData = {
    id: event.id,
    pubkey: event.pubkey,
    createdAt: event.created_at,
    d: undefined,
    title: "",
    description: "",
    amount: 0,
    currency: "",
    recurrence: "",
    image: undefined,
    active: false,
  };

  const tags = event.tags || [];
  for (const tag of tags) {
    const [key, ...values] = tag;
    switch (key) {
      case "d":
        parsed.d = values[0];
        break;
      case "title":
        parsed.title = values[0] || "";
        break;
      case "description":
        parsed.description = values[0] || "";
        break;
      case "amount":
        parsed.amount = Number(values[0]);
        break;
      case "currency":
        parsed.currency = values[0] || "";
        break;
      case "recurrence":
        parsed.recurrence = values[0] || "";
        break;
      case "image":
        parsed.image = values[0];
        break;
      case "active":
        parsed.active = values[0] === "true";
        break;
      default:
        break;
    }
  }

  return parsed;
};
