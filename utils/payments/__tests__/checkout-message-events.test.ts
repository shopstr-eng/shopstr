import type { ProductData } from "@/utils/parsers/product-parser-functions";
import { constructGiftWrappedEvent } from "@/utils/nostr/gift-wrap";
import {
  buildEcashPaymentMessage,
  buildPaymentEventOptions,
  buildProductDetailsSuffix,
  buildShipProductMessage,
  buildShippingAddressTag,
  splitDonationAndSellerAmount,
} from "../checkout-messages";

const expectUniqueTags = (tags: string[][], expectedTags: string[][]) => {
  for (const expectedTag of expectedTags) {
    expect(tags.filter((tag) => tag[0] === expectedTag[0])).toEqual([
      expectedTag,
    ]);
  }
};

describe("invoice checkout message event contracts", () => {
  const senderPubkey = "a".repeat(64);
  const sellerPubkey = "b".repeat(64);
  const buyerPubkey = "c".repeat(64);
  const relay = "wss://relay.example";

  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem("relays", JSON.stringify([relay]));
  });

  it("preserves the product invoice ecash message and seller event tags", async () => {
    const token = "cashuAproducttoken";
    const pickup = "Downtown Store";
    const productData = {
      pubkey: sellerPubkey,
      d: "handmade-mug",
      title: "Handmade Mug",
      selectedSize: "M",
    } as ProductData;
    const productDetails = buildProductDetailsSuffix({
      selectedSize: productData.selectedSize,
      pickupLocation: pickup,
    });
    const address = buildShippingAddressTag({
      name: "Ada Lovelace",
      address: "123 Main St",
      unitNo: "Apt 4",
      city: "Metropolis",
      state: "NY",
      postalCode: "12345",
      country: "USA",
    });
    const { donationAmount, sellerAmount } = splitDonationAndSellerAmount(
      1000,
      2.1
    );
    const message = buildEcashPaymentMessage({
      buyerNpub: "npub1buyer",
      title: productData.title,
      productDetails,
      token,
    });

    const paymentEvent = await constructGiftWrappedEvent(
      senderPubkey,
      sellerPubkey,
      message,
      "order-payment",
      buildPaymentEventOptions({
        orderId: "product-order-1",
        orderAmount: sellerAmount,
        productData,
        quantity: 1,
        paymentType: "ecash",
        paymentReference: token,
        pickup,
        selectedSize: productData.selectedSize,
        buyerPubkey,
        donationAmount,
        donationPercentage: 2.1,
      })
    );

    expect(paymentEvent.content).toBe(
      "This is a Cashu token payment from npub1buyer for your Handmade Mug listing" +
        " in size M (pickup at: Downtown Store) on Shopstr: cashuAproducttoken"
    );
    expectUniqueTags(paymentEvent.tags, [
      ["subject", "order-payment"],
      ["order", "product-order-1"],
      ["b", buyerPubkey],
      ["type", "2"],
      ["amount", "979"],
      ["payment", "ecash", token],
      ["item", `30402:${sellerPubkey}:handmade-mug`, "1"],
      ["pickup", pickup],
      ["size", "M"],
      ["donation_amount", "21", "2.1"],
    ]);

    const shippingMessage = buildShipProductMessage(productDetails, {
      name: "Ada Lovelace",
      address: "123 Main St",
      unitNo: "Apt 4",
      city: "Metropolis",
      state: "NY",
      postalCode: "12345",
      country: "USA",
    });
    const shippingEvent = await constructGiftWrappedEvent(
      senderPubkey,
      sellerPubkey,
      shippingMessage,
      "order-info",
      {
        isOrder: true,
        type: 1,
        orderId: "product-order-1",
        orderAmount: 1000,
        productData,
        quantity: 1,
        address,
        pickup,
        selectedSize: productData.selectedSize,
        buyerPubkey,
        donationAmount,
        donationPercentage: 2.1,
      }
    );

    expect(shippingEvent.content).toBe(
      "Please ship the product in size M (pickup at: Downtown Store) to " +
        "Ada Lovelace at 123 Main St Apt 4, Metropolis, NY, 12345, USA."
    );
    expectUniqueTags(shippingEvent.tags, [
      ["subject", "order-info"],
      ["order", "product-order-1"],
      ["type", "1"],
      ["amount", "1000"],
      [
        "address",
        "Ada Lovelace, 123 Main St, Apt 4, Metropolis, NY, 12345, USA",
      ],
      ["pickup", pickup],
      ["donation_amount", "21", "2.1"],
    ]);
  });

  it("preserves the cart invoice ecash message, quantity, and seller event tags", async () => {
    const quantity = 3;
    const token = "cashuAcarttoken";
    const pickup = "Warehouse Counter";
    const productData = {
      pubkey: sellerPubkey,
      d: "coffee-beans",
      title: "Coffee Beans",
      selectedWeight: "1kg",
      selectedBulkOption: 3,
    } as ProductData;
    const productDetails = buildProductDetailsSuffix({
      selectedWeight: productData.selectedWeight,
      selectedBulkOption: productData.selectedBulkOption,
      pickupLocation: pickup,
    });
    const address = buildShippingAddressTag({
      name: "Grace Hopper",
      address: "456 Oak Ave",
      city: "Arlington",
      state: "VA",
      postalCode: "22201",
      country: "USA",
    });
    const { donationAmount, sellerAmount } = splitDonationAndSellerAmount(
      3000,
      2.1
    );
    const message = buildEcashPaymentMessage({
      buyerNpub: "npub1buyer",
      title: productData.title,
      productDetails,
      quantity,
      token,
    });

    const event = await constructGiftWrappedEvent(
      senderPubkey,
      sellerPubkey,
      message,
      "order-payment",
      buildPaymentEventOptions({
        orderId: "cart-order-1",
        orderAmount: sellerAmount,
        productData,
        quantity,
        paymentType: "ecash",
        paymentReference: token,
        address,
        pickup,
        selectedWeight: productData.selectedWeight,
        selectedBulkOption: productData.selectedBulkOption,
        buyerPubkey,
        donationAmount,
        donationPercentage: 2.1,
      })
    );

    expect(event.content).toBe(
      "This is a Cashu token payment from npub1buyer for 3 of your Coffee Beans listing" +
        " in 1kg (bulk: 3 units) (pickup at: Warehouse Counter) on Shopstr: cashuAcarttoken"
    );
    expectUniqueTags(event.tags, [
      ["subject", "order-payment"],
      ["order", "cart-order-1"],
      ["b", buyerPubkey],
      ["type", "2"],
      ["amount", "2937"],
      ["payment", "ecash", token],
      ["item", `30402:${sellerPubkey}:coffee-beans`, "3"],
      ["address", "Grace Hopper, 456 Oak Ave, Arlington, VA, 22201, USA"],
      ["pickup", pickup],
      ["weight", "1kg"],
      ["bulk", "3"],
      ["donation_amount", "63", "2.1"],
    ]);
  });
});
