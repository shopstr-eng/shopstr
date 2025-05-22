import { NostrEvent, FundstrPledgeData, KIND_FUNDSTR_PLEDGE } from "@/utils/types/types";

export function parsePledgeEvent(event: NostrEvent): FundstrPledgeData | null {
  if (event.kind !== KIND_FUNDSTR_PLEDGE) {
    return null; // Not a Fundstr pledge event
  }

  const parsedData: Partial<FundstrPledgeData> = {
    id: event.id,
    pubkey: event.pubkey, // Supporter's pubkey
    createdAt: event.created_at,
    encrypted_note: event.content, // Store the raw content, could be plain or encrypted
  };

  event.tags.forEach((tag) => {
    const [key, value, ...rest] = tag; // value might be undefined if tag is just [key]
    switch (key) {
      case "d":
        parsedData.d = value;
        break;
      case "a":
        parsedData.a = value; // Format: KIND_FUNDSTR_TIER:creator_pubkey:tier_d_tag
        break;
      case "p":
        parsedData.p = value; // Creator's pubkey
        break;
      case "amount":
        parsedData.amount = value;
        break;
      case "currency":
        parsedData.currency = value;
        break;
      case "recurrence":
        if (value === "daily" || value === "weekly") {
          parsedData.recurrence = value;
        }
        break;
      case "start_date":
        parsedData.start_date = value ? parseInt(value, 10) : undefined;
        break;
      case "status":
        if (value === "active" || value === "paused" || value === "cancelled") {
          parsedData.status = value;
        }
        break;
      case "payment_method":
        parsedData.payment_method = value;
        break;
      case "last_payment_date":
        parsedData.last_payment_date = value ? parseInt(value, 10) : undefined;
        break;
      case "next_payment_date":
        parsedData.next_payment_date = value ? parseInt(value, 10) : undefined;
        break;
      // Add other cases if new tags are introduced for pledges
    }
  });

  // Validate required fields before casting
  if (
    !parsedData.d ||
    !parsedData.a ||
    !parsedData.p ||
    !parsedData.amount ||
    !parsedData.currency ||
    !parsedData.recurrence ||
    !parsedData.status
  ) {
    console.warn("Failed to parse pledge event, missing required tags:", event);
    return null; // Or throw an error
  }

  return parsedData as FundstrPledgeData;
}

// Optional: export default parsePledgeEvent;
