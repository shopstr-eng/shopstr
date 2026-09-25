import { Invoice, LightningAddress } from "@getalby/lightning-tools";
import { verifyEvent } from "nostr-tools";
import { NostrManager } from "@/utils/nostr/nostr-manager";
import { getDefaultRelays, withBlastr } from "@/utils/nostr/relay-config";
import {
  withHodlPayout,
  listOwedHodlPayouts,
} from "@/utils/db/hodl-payout-store";
import { getLndPaymentClient, LndPaymentError } from "./lnd-payment-client";

export const MAX_HODL_SELLER_PAYOUT_ATTEMPTS = 5;
type InvoiceInfo = Pick<
  Invoice,
  "paymentRequest" | "paymentHash" | "satoshi" | "hasExpired"
>;
type PaymentState = {
  status: "succeeded" | "failed" | "unknown" | "not_found";
};
export interface PayoutDependencies {
  resolveAddress(pubkey: string): Promise<string | null>;
  requestInvoice(address: string, amount: number): Promise<InvoiceInfo>;
  decodeInvoice(request: string): InvoiceInfo;
  trackPayment(hash: string): Promise<PaymentState>;
  sendPayment(request: string, amount: number): Promise<PaymentState>;
}
export type HodlSellerPayoutResult = {
  status:
    | "paid"
    | "already_paid"
    | "failed"
    | "abandoned"
    | "in_progress"
    | "unverified"
    | "no_order"
    | "not_settled";
  reason?: string;
};

export async function resolveHodlSellerAddress(
  pubkey: string
): Promise<string | null> {
  const nostr = new NostrManager(withBlastr(getDefaultRelays()));
  try {
    const result = await nostr.fetchWithStatus(
      [{ kinds: [0], authors: [pubkey] }],
      undefined,
      undefined,
      10_000
    );
    if (!result.complete) throw new Error("Profile lookup incomplete");
    const event = result.events
      .filter((e) => e.kind === 0 && e.pubkey === pubkey && verifyEvent(e))
      .sort((a, b) => b.created_at - a.created_at)[0];
    if (!event) return null;
    const profile = JSON.parse(event.content);
    const address = profile.lud16 ?? profile.lnurl;
    return typeof address === "string" &&
      address.length <= 254 &&
      address.includes("@")
      ? address.trim()
      : null;
  } finally {
    nostr.close();
  }
}

async function withTimeout<T>(work: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("Invoice lookup timed out")),
          15_000
        );
      }),
    ]);
  } finally {
    clearTimeout(timer!);
  }
}
const defaults: PayoutDependencies = {
  resolveAddress: resolveHodlSellerAddress,
  async requestInvoice(address, amount) {
    // The library uses its fixed HTTPS proxy. Never fetch a seller-supplied verify URL.
    const ln = new LightningAddress(address);
    return withTimeout(
      (async () => {
        await ln.fetch();
        return ln.requestInvoice({ satoshi: amount });
      })()
    );
  },
  decodeInvoice: (request) => new Invoice({ pr: request }),
  async trackPayment(hash) {
    try {
      return await getLndPaymentClient().trackPayment({ paymentHash: hash });
    } catch (error) {
      if (error instanceof LndPaymentError && error.grpcCode === 5)
        return { status: "not_found" };
      throw error;
    }
  },
  sendPayment: (request, amount) => {
    if (process.env.HODL_INVOICE_PROVIDER?.trim().toLowerCase() !== "lnd")
      throw new Error("Real payouts require the LND escrow provider");
    return getLndPaymentClient().sendPayment({
      paymentRequest: request,
      feeLimitSat: Math.max(10, Math.ceil(amount * 0.01)),
    });
  },
};

/** One immutable payout invoice per order. LND's payment hash deduplication survives worker crashes. */
export async function payoutToSeller(
  paymentHash: string,
  overrides: Partial<PayoutDependencies> = {}
): Promise<HodlSellerPayoutResult> {
  if (!/^[0-9a-f]{64}$/i.test(paymentHash)) return { status: "no_order" };
  const deps = { ...defaults, ...overrides };
  try {
    return (
      (await withHodlPayout<HodlSellerPayoutResult>(
        paymentHash.toLowerCase(),
        async (row) => {
          if (!row) return { status: "no_order" };
          if (row.orderStatus !== "settled") return { status: "not_settled" };
          if (row.status === "paid") return { status: "already_paid" };
          // Even abandoned invoices can reconcile a late success, but must never be resent.
          let invoice: InvoiceInfo;
          if (row.invoice) {
            invoice = deps.decodeInvoice(row.invoice);
            let state;
            try {
              state = await deps.trackPayment(invoice.paymentHash);
            } catch {
              await row.finish(row.status, "LND payment status unavailable");
              return { status: "unverified" };
            }
            if (state.status === "succeeded") {
              await row.finish("paid", null);
              return { status: "already_paid" };
            }
            if (state.status === "unknown") {
              await row.finish(row.status, "Payment still in flight");
              return { status: "unverified" };
            }
            if (
              row.status === "abandoned" ||
              invoice.hasExpired() ||
              row.attemptCount >= MAX_HODL_SELLER_PAYOUT_ATTEMPTS
            ) {
              await row.finish(
                "abandoned",
                "Payout needs reconciliation; the seller remains owed. Do not replace its recorded invoice without checking LND."
              );
              return { status: "abandoned" };
            }
          } else {
            if (row.status === "abandoned") return { status: "abandoned" };
            try {
              const address = await deps.resolveAddress(row.sellerNostrPubkey);
              if (!address)
                throw new Error("Seller Lightning address unavailable");
              invoice = await deps.requestInvoice(address, row.amountSats);
              if (
                invoice.satoshi !== row.amountSats ||
                !/^[0-9a-f]{64}$/i.test(invoice.paymentHash) ||
                invoice.hasExpired()
              )
                throw new Error("Invalid payout invoice");
              await row.saveInvoice(invoice.paymentRequest);
            } catch {
              await row.finish(
                "failed",
                "Could not prepare the seller payout. Check the seller address and Lightning configuration."
              );
              return { status: "failed" };
            }
          }
          if (invoice.satoshi !== row.amountSats) {
            await row.finish(
              "abandoned",
              "Recorded invoice amount does not match order"
            );
            return { status: "abandoned" };
          }
          await row.recordAttempt();
          try {
            const state = await deps.sendPayment(
              invoice.paymentRequest,
              row.amountSats
            );
            if (state.status === "succeeded") {
              await row.finish("paid", null);
              return { status: "paid" };
            }
            await row.finish(
              state.status === "failed" ? "failed" : "pending",
              "Payment not confirmed; reconcile with LND before retrying"
            );
          } catch {
            await row.finish(
              "pending",
              "Payment outcome unknown; reconcile with LND before retrying"
            );
          }
          return { status: "unverified" };
        }
      )) ?? { status: "in_progress" }
    );
  } catch {
    // Errors may include invoice/preimage/credential data; never log driver payloads.
    console.error("HODL payout could not be reconciled");
    return { status: "unverified" };
  }
}

export function schedulePayoutToSeller(paymentHash: string): void {
  void payoutToSeller(paymentHash); // Latency optimization; the durable scan below is the recovery path.
}

export async function reconcileHodlPayouts(): Promise<void> {
  const hashes = await listOwedHodlPayouts();
  for (let i = 0; i < hashes.length; i += 4)
    await Promise.all(
      hashes.slice(i, i + 4).map((hash) => payoutToSeller(hash))
    );
}
