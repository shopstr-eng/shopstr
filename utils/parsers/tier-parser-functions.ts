import { NostrEvent, FundstrTierData, KIND_FUNDSTR_TIER } from "@/utils/types/types";

export function parseTierEvent(event: NostrEvent): FundstrTierData | null {
  if (event.kind !== KIND_FUNDSTR_TIER) {
    return null; // Not a Fundstr tier event
  }

  const parsedData: Partial<FundstrTierData> = {
    id: event.id,
    pubkey: event.pubkey,
    createdAt: event.created_at,
  };

  event.tags.forEach((tag) => {
    const [key, value] = tag;
    switch (key) {
      case "d":
        parsedData.d = value;
        break;
      case "title":
        parsedData.title = value;
        break;
      case "description":
        parsedData.description = value;
        break;
      case "amount":
        parsedData.amount = value;
        break;
      case "currency":
        parsedData.currency = value;
        break;
      case "recurrence":
        // Basic validation, can be expanded if needed
        if (value === "daily" || value === "weekly" || value === "monthly") {
          parsedData.recurrence = value;
        }
        break;
      case "image":
        parsedData.image = value;
        break;
      case "active":
        if (value === "true" || value === "false") {
          parsedData.active = value;
        }
        break;
      // Add other cases if new tags are introduced
    }
  });

  // Validate required fields before casting
  if (
    !parsedData.d ||
    !parsedData.title ||
    !parsedData.description ||
    !parsedData.amount ||
    !parsedData.currency ||
    !parsedData.recurrence ||
    !parsedData.active // active is also required
  ) {
    console.warn("Failed to parse tier event, missing required tags:", event);
    return null; // Or throw an error, depending on desired error handling
  }

  return parsedData as FundstrTierData;
}

// Optional: Add an export default if it's common practice in this project,
// or if multiple parsing functions will be added here later.
// export default parseTierEvent;
