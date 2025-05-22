import { NostrEvent, FundstrPledgeData } from "@/utils/types/types";

export const parsePledgeEvent = (event: NostrEvent): FundstrPledgeData => {
  const parsed: FundstrPledgeData = {
    id: event.id,
    pubkey: event.pubkey,
    createdAt: event.created_at,
    d: undefined,
    address: "",
    creator: "",
    amount: 0,
    currency: "",
    recurrence: "",
    startDate: undefined,
    status: "",
    paymentMethod: undefined,
    lastPaymentDate: undefined,
    nextPaymentDate: undefined,
  };

  const tags = event.tags || [];
  for (const tag of tags) {
    const [key, ...values] = tag;
    switch (key) {
      case "d":
        parsed.d = values[0];
        break;
      case "address":
        parsed.address = values[0] || "";
        break;
      case "creator":
        parsed.creator = values[0] || "";
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
      case "start_date":
        parsed.startDate = values[0];
        break;
      case "status":
        parsed.status = values[0] || "";
        break;
      case "payment_method":
        parsed.paymentMethod = values[0];
        break;
      case "last_payment_date":
        parsed.lastPaymentDate = values[0];
        break;
      case "next_payment_date":
        parsed.nextPaymentDate = values[0];
        break;
      default:
        break;
    }
  }

  return parsed;
};
