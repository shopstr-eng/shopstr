import {
  Mint as CashuMint,
  Wallet as CashuWallet,
  getEncodedToken,
} from "@cashu/cashu-ts";
import { generateSecretKey, nip19 } from "nostr-tools";
import { bytesToHex } from "@noble/hashes/utils.js";
import { safeSwap } from "@/utils/cashu/swap-retry-service";
import { sumProofAmounts } from "@/utils/cashu/proof-amount";
import { decryptNsec } from "@/utils/mcp/nostr-signing";
import { sendServerGiftWrappedDm } from "@/utils/nostr/server-gift-wrap";
import {
  buildEcashPaymentMessage,
  buildProductDetailsSuffix,
} from "@/utils/payments/checkout-messages";

/** A payment failure that can be shown to the buyer as is. */
export class OrderPaymentError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message);
    this.name = "OrderPaymentError";
  }
}

export type CashuSettlement = {
  sellerToken: string;
  changeToken: string | null;
  changeAmount: number;
  /** Everything the swap produced. Handed back if the order cannot go through. */
  refundToken: string;
  refundAmount: number;
};

/**
 * Swaps the buyer's token at the mint into one token for the seller and one
 * for the buyer's change. The swap spends the buyer's proofs, so the caller
 * must hand `refundToken` back if anything after this point fails.
 */
export async function swapCashuPayment(
  token: string,
  mintUrl: string,
  sellerAmount: number
): Promise<CashuSettlement> {
  const wallet = new CashuWallet(new CashuMint(mintUrl));
  await wallet.loadMint();
  const inputProofs = wallet.decodeToken(token).proofs;

  const outcome = await safeSwap(wallet, sellerAmount, inputProofs, {
    sendConfig: { includeFees: true },
  });

  if (outcome.status === "unswapped") {
    throw new OrderPaymentError(
      400,
      "The mint did not accept the Cashu token. It may be spent, or too small to cover the order plus mint fees."
    );
  }
  if (outcome.status === "unknown") {
    throw new OrderPaymentError(
      502,
      "The mint did not confirm the swap. The token may be spent, so do not retry until you have checked it."
    );
  }

  const { send, keep } = outcome;
  const encode = (proofs: typeof send) =>
    getEncodedToken({ mint: mintUrl, proofs, unit: "sat" });
  const changeAmount = sumProofAmounts(keep);

  return {
    sellerToken: encode(send),
    changeToken: keep.length > 0 ? encode(keep) : null,
    changeAmount,
    refundToken: encode([...send, ...keep]),
    refundAmount: sumProofAmounts(send) + changeAmount,
  };
}

type OrderPaymentDm = {
  orderId: string;
  buyerPubkey: string;
  sellerPubkey: string;
  productAddress: string;
  productTitle: string;
  quantity: number;
  amount: number;
  token: string;
  selectedSpecs?: {
    size?: string;
    volume?: string;
    weight?: string;
    bulk?: { units: number };
  };
  shippingAddress?: Record<string, string> | null;
  /** The buyer's stored nsec. Without one the DM is sent from a one-off key. */
  encryptedNsec?: string | null;
};

function formatShippingAddress(address: Record<string, string>): string {
  const { name, address: street, unit, city, stateProvince } = address;
  return [
    name,
    street,
    unit,
    city,
    stateProvince,
    address.postalCode,
    address.country,
  ]
    .filter(Boolean)
    .join(", ");
}

/**
 * Tells the seller about the order and hands over the payment, in the same
 * `order-payment` DM the web checkout sends. The orders dashboard shows it
 * with a claimable token.
 */
export async function sendOrderPaymentDm(params: OrderPaymentDm) {
  const { selectedSpecs, shippingAddress } = params;
  const senderKey = params.encryptedNsec
    ? decryptNsec(params.encryptedNsec)
    : bytesToHex(generateSecretKey());

  const tags: string[][] = [
    ["subject", "order-payment"],
    ["order", params.orderId],
    ["b", params.buyerPubkey],
    ["type", "2"],
    ["amount", String(params.amount)],
    ["payment", "ecash", params.token],
    ["item", params.productAddress, String(params.quantity)],
  ];
  if (shippingAddress) {
    tags.push(["address", formatShippingAddress(shippingAddress)]);
  }
  if (selectedSpecs?.size) tags.push(["size", selectedSpecs.size]);
  if (selectedSpecs?.volume) tags.push(["volume", selectedSpecs.volume]);
  if (selectedSpecs?.weight) tags.push(["weight", selectedSpecs.weight]);
  if (selectedSpecs?.bulk) {
    tags.push(["bulk", String(selectedSpecs.bulk.units)]);
  }

  await sendServerGiftWrappedDm({
    senderPrivkeyHexOrNsec: senderKey,
    recipientPubkey: params.sellerPubkey,
    content: buildEcashPaymentMessage({
      buyerNpub: nip19.npubEncode(params.buyerPubkey),
      title: params.productTitle,
      productDetails: buildProductDetailsSuffix({
        selectedSize: selectedSpecs?.size,
        selectedVolume: selectedSpecs?.volume,
        selectedWeight: selectedSpecs?.weight,
        selectedBulkOption: selectedSpecs?.bulk?.units,
      }),
      quantity: params.quantity,
      token: params.token,
    }),
    tags,
  });
}
