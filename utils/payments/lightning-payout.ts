import { Wallet as CashuWallet, Proof } from "@cashu/cashu-ts";
import { LightningAddress } from "@getalby/lightning-tools";
import { safeMeltProofs } from "@/utils/cashu/melt-retry-service";
import { safeSwap } from "@/utils/cashu/swap-retry-service";
import { sumProofAmounts } from "@/utils/cashu/proof-amount";

export type LightningPayoutOutcome =
  | {
      status: "fallback";
      reason: "no-quote" | "swap-unswapped" | "melt-unpaid";
      fallbackProofs: Proof[];
      fallbackAmount: number;
      errorMessage?: string;
    }
  | {
      status: "pending" | "unknown";
      meltQuoteId: string;
      recoverableProofs: Proof[];
      quarantinedProofs: Proof[];
      errorMessage: string;
    }
  | {
      status: "completed";
      meltAmount: number;
      changeProofs: Proof[];
      changeAmount: number;
    };

export async function executeSellerLightningPayout(
  wallet: CashuWallet,
  lnurl: string,
  sellerAmount: number,
  sellerProofs: Proof[]
): Promise<LightningPayoutOutcome> {
  const newAmount = Math.floor(sellerAmount * 0.98 - 2);
  const ln = new LightningAddress(lnurl);
  await wallet.loadMint();
  await ln.fetch();
  const invoice = await ln.requestInvoice({ satoshi: newAmount });
  const meltQuote = await wallet.createMeltQuoteBolt11(invoice.paymentRequest);
  if (!meltQuote) {
    return {
      status: "fallback",
      reason: "no-quote",
      fallbackProofs: sellerProofs,
      fallbackAmount: sumProofAmounts(sellerProofs),
    };
  }

  const meltQuoteTotal =
    meltQuote.amount.toNumber() + meltQuote.fee_reserve.toNumber();
  const swapOutcome = await safeSwap(wallet, meltQuoteTotal, sellerProofs, {
    sendConfig: { includeFees: true },
  });
  if (swapOutcome.status === "unswapped") {
    return {
      status: "fallback",
      reason: "swap-unswapped",
      fallbackProofs: sellerProofs,
      fallbackAmount: sumProofAmounts(sellerProofs),
      errorMessage: swapOutcome.errorMessage,
    };
  }
  if (swapOutcome.status === "unknown") {
    return {
      status: "unknown",
      meltQuoteId: meltQuote.quote,
      recoverableProofs: [],
      quarantinedProofs: sellerProofs,
      errorMessage:
        swapOutcome.errorMessage ??
        `Pre-melt swap did not complete (${swapOutcome.status})`,
    };
  }

  const { keep, send } = swapOutcome;
  const meltOutcome = await safeMeltProofs(wallet, meltQuote, send);
  if (meltOutcome.status === "unpaid") {
    const fallbackProofs = [...keep, ...send];
    return {
      status: "fallback",
      reason: "melt-unpaid",
      fallbackProofs,
      fallbackAmount: sumProofAmounts(fallbackProofs),
      errorMessage: meltOutcome.errorMessage,
    };
  }
  if (meltOutcome.status === "pending" || meltOutcome.status === "unknown") {
    return {
      status: meltOutcome.status,
      meltQuoteId: meltOutcome.meltQuote.quote,
      recoverableProofs: keep,
      quarantinedProofs: send,
      errorMessage:
        meltOutcome.errorMessage ??
        `Melt did not complete (${meltOutcome.status})`,
    };
  }

  const meltAmount = meltOutcome.meltQuote.amount.toNumber();
  const changeProofs = [...keep, ...meltOutcome.changeProofs];
  const changeAmount =
    changeProofs.length > 0 ? sumProofAmounts(changeProofs) : 0;

  return { status: "completed", meltAmount, changeProofs, changeAmount };
}
