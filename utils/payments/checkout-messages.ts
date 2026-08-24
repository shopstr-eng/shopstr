import { isSellerP2pkEscrowActive } from "@/utils/cashu/p2pk-checkout";
import type { P2pkProfileSettings } from "@/utils/cashu/p2pk-checkout";
import type { ProductData } from "@/utils/parsers/product-parser-functions";

/**
 * The cart flow pluralizes for quantity > 1 via the `quantity` parameter;
 * product-invoice-card always passes quantity 1 (singular phrasing) since it
 * only ever checks out one unit at a time.
 */

export interface ProductDetailsSuffixInput {
  selectedSize?: string;
  selectedVolume?: string;
  selectedWeight?: string;
  selectedBulkOption?: string | number;
  pickupLocation?: string | null;
}

export function buildProductDetailsSuffix({
  selectedSize,
  selectedVolume,
  selectedWeight,
  selectedBulkOption,
  pickupLocation,
}: ProductDetailsSuffixInput): string {
  let productDetails = "";
  if (selectedSize) {
    productDetails += " in size " + selectedSize;
  }
  if (selectedVolume) {
    productDetails += productDetails
      ? " and a " + selectedVolume
      : " in a " + selectedVolume;
  }
  if (selectedWeight) {
    productDetails += productDetails
      ? " and " + selectedWeight
      : " in " + selectedWeight;
  }
  if (selectedBulkOption) {
    productDetails += " (bulk: " + selectedBulkOption + " units)";
  }
  if (pickupLocation) {
    productDetails += " (pickup at: " + pickupLocation + ")";
  }
  return productDetails;
}

/** Splits a seller's total payout into the marketplace donation and the
 * seller's remaining share, rounding the donation up to the nearest sat. */
export function splitDonationAndSellerAmount(
  totalAmount: number,
  donationPercentage: number
): { donationAmount: number; sellerAmount: number } {
  const donationAmount = Math.ceil((totalAmount * donationPercentage) / 100);
  return { donationAmount, sellerAmount: totalAmount - donationAmount };
}

/** Whether the seller's stated preferences make them eligible for an
 * automatic Lightning payout (vs. an ecash token message). Does not check
 * whether the buyer-side ecash swap that funds the payout actually
 * succeeded — callers combine this with their own `sellerProofs` check. */
export function isEligibleForLightningPayout({
  sellerP2pk,
  paymentPreference,
  lnurl,
}: {
  sellerP2pk: P2pkProfileSettings | undefined;
  paymentPreference?: string;
  lnurl?: string;
}): boolean {
  return (
    !isSellerP2pkEscrowActive(sellerP2pk) &&
    paymentPreference === "lightning" &&
    !!lnurl &&
    lnurl !== "" &&
    !lnurl.includes("@zeuspay.com")
  );
}

interface PaymentMessageInput {
  buyerNpub?: string;
  title: string;
  productDetails: string;
  quantity?: number;
}

export interface PaymentEventOptionsInput {
  orderId?: string;
  orderAmount: number;
  productData: ProductData;
  quantity: number;
  paymentType?: string;
  paymentReference?: string;
  paymentProof?: string;
  contact?: string;
  address?: string;
  pickup?: string;
  buyerPubkey?: string;
  donationAmount?: number;
  donationPercentage?: number;
  selectedSize?: string;
  selectedVolume?: string;
  selectedWeight?: string;
  selectedBulkOption?: number;
}

export function buildPaymentEventOptions(input: PaymentEventOptionsInput) {
  return {
    isOrder: true,
    type: 2,
    ...input,
  };
}

const forClause = (quantity: number | undefined) =>
  quantity && quantity > 1 ? `for ${quantity} of your` : "for your";

/** Notifies the seller a Lightning payout was sent to their Lightning
 * address (the `sendTokens` "seller prefers lightning" branch). */
export function buildLightningPaymentMessage({
  buyerNpub,
  title,
  productDetails,
  quantity,
  lnurl,
}: PaymentMessageInput & { lnurl: string }): string {
  const buyer = buyerNpub || "a guest buyer";
  return (
    `You have received a payment from ${buyer} ${forClause(quantity)} ${title} listing${productDetails}` +
    ` on Shopstr! Check your Lightning address (${lnurl}) for your sats.`
  );
}

/** Notifies the seller (or hands the buyer their change) via an embedded
 * Cashu token — used for the ecash payout branch, overpaid-fee change, and
 * unused-proofs fallback when a Lightning melt doesn't fully complete. */
export function buildEcashPaymentMessage({
  buyerNpub,
  title,
  productDetails,
  quantity,
  token,
}: PaymentMessageInput & { token: string }): string {
  const buyer = buyerNpub || "a guest buyer";
  return `This is a Cashu token payment from ${buyer} ${forClause(quantity)} ${title} listing${productDetails} on Shopstr: ${token}`;
}

export interface ShippingAddressInput {
  name: string;
  address: string;
  unitNo?: string;
  city: string;
  postalCode: string;
  state: string;
  country: string;
}

/** Instructs the seller where to ship the product. Field order
 * (city, state, postalCode, country) matches `buildShippingAddressTag`
 * below — the two builders previously used different orders (a harmless,
 * pre-existing inconsistency: the `address` tag is never parsed
 * positionally by any reader in this repo, only displayed as an opaque
 * string), unified here for readability. */
export function buildShipProductMessage(
  productDetails: string,
  addr: ShippingAddressInput
): string {
  const unitSuffix = addr.unitNo ? ` ${addr.unitNo}` : "";
  return (
    `Please ship the product${productDetails} to ${addr.name} at ${addr.address}${unitSuffix}, ` +
    `${addr.city}, ${addr.state}, ${addr.postalCode}, ${addr.country}.`
  );
}

/** Builds the `address` Nostr tag attached to order messages. Same field
 * order as `buildShipProductMessage` above. */
export function buildShippingAddressTag(addr: ShippingAddressInput): string {
  return addr.unitNo
    ? `${addr.name}, ${addr.address}, ${addr.unitNo}, ${addr.city}, ${addr.state}, ${addr.postalCode}, ${addr.country}`
    : `${addr.name}, ${addr.address}, ${addr.city}, ${addr.state}, ${addr.postalCode}, ${addr.country}`;
}

/** Buyer-facing receipt sent after a shipping or pickup order — tells them
 * to expect delivery/pickup details from the seller. */
export function buildOrderProcessedReceiptMessage(
  title: string,
  productDetails: string,
  sellerNpub: string
): string {
  return (
    `Your order for ${title}${productDetails} was processed successfully! If applicable, ` +
    `you should be receiving delivery information from ${sellerNpub} as soon as they review your order.`
  );
}

/** Buyer-facing receipt for digital/no-fulfillment-followup purchases. */
export function buildThankYouReceiptMessage(
  title: string,
  productDetails: string,
  sellerNpub: string
): string {
  return `Thank you for your purchase of ${title}${productDetails} from ${sellerNpub}.`;
}
