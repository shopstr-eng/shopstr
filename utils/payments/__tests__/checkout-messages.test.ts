import {
  buildProductDetailsSuffix,
  splitDonationAndSellerAmount,
  isEligibleForLightningPayout,
  buildLightningPaymentMessage,
  buildEcashPaymentMessage,
  buildShipProductMessage,
  buildShippingAddressTag,
  buildOrderProcessedReceiptMessage,
  buildThankYouReceiptMessage,
  type ShippingAddressInput,
} from "../checkout-messages";

describe("buildProductDetailsSuffix", () => {
  it("returns an empty string when nothing is selected", () => {
    expect(buildProductDetailsSuffix({})).toBe("");
  });

  it("renders size alone as 'in size S'", () => {
    expect(buildProductDetailsSuffix({ selectedSize: "S" })).toBe(" in size S");
  });

  it("renders volume alone as 'in a 500ml' (leading phrase)", () => {
    expect(buildProductDetailsSuffix({ selectedVolume: "500ml" })).toBe(
      " in a 500ml"
    );
  });

  it("joins size + volume with 'and a' once details already exist", () => {
    expect(
      buildProductDetailsSuffix({ selectedSize: "S", selectedVolume: "500ml" })
    ).toBe(" in size S and a 500ml");
  });

  it("renders weight alone as 'in 2kg' (leading phrase)", () => {
    expect(buildProductDetailsSuffix({ selectedWeight: "2kg" })).toBe(
      " in 2kg"
    );
  });

  it("joins weight after existing details with 'and' (no article)", () => {
    expect(
      buildProductDetailsSuffix({ selectedSize: "S", selectedWeight: "2kg" })
    ).toBe(" in size S and 2kg");
  });

  it("always appends bulk as '(bulk: N units)' regardless of prior details", () => {
    expect(buildProductDetailsSuffix({ selectedBulkOption: 5 })).toBe(
      " (bulk: 5 units)"
    );
    expect(
      buildProductDetailsSuffix({ selectedSize: "S", selectedBulkOption: 5 })
    ).toBe(" in size S (bulk: 5 units)");
  });

  it("always appends pickup as '(pickup at: X)' regardless of prior details", () => {
    expect(
      buildProductDetailsSuffix({ pickupLocation: "Downtown Store" })
    ).toBe(" (pickup at: Downtown Store)");
  });

  it("combines every field in the original size/volume/weight/bulk/pickup order", () => {
    expect(
      buildProductDetailsSuffix({
        selectedSize: "S",
        selectedVolume: "500ml",
        selectedWeight: "2kg",
        selectedBulkOption: 5,
        pickupLocation: "Downtown Store",
      })
    ).toBe(
      " in size S and a 500ml and 2kg (bulk: 5 units) (pickup at: Downtown Store)"
    );
  });
});

describe("splitDonationAndSellerAmount", () => {
  it("rounds the donation up to the nearest sat and gives the seller the remainder", () => {
    expect(splitDonationAndSellerAmount(1000, 2.1)).toEqual({
      donationAmount: 21,
      sellerAmount: 979,
    });
  });

  it("returns a 0 donation and the full amount to the seller at 0%", () => {
    expect(splitDonationAndSellerAmount(1000, 0)).toEqual({
      donationAmount: 0,
      sellerAmount: 1000,
    });
  });
});

describe("isEligibleForLightningPayout", () => {
  it("is eligible when payment_preference is lightning and lud16 is a valid non-zeuspay address", () => {
    expect(
      isEligibleForLightningPayout({
        sellerP2pk: undefined,
        paymentPreference: "lightning",
        lnurl: "seller@getalby.com",
      })
    ).toBe(true);
  });

  it("is not eligible when payment_preference is not lightning", () => {
    expect(
      isEligibleForLightningPayout({
        sellerP2pk: undefined,
        paymentPreference: "ecash",
        lnurl: "seller@getalby.com",
      })
    ).toBe(false);
  });

  it("is not eligible when lnurl is missing or empty", () => {
    expect(
      isEligibleForLightningPayout({
        sellerP2pk: undefined,
        paymentPreference: "lightning",
        lnurl: undefined,
      })
    ).toBe(false);
    expect(
      isEligibleForLightningPayout({
        sellerP2pk: undefined,
        paymentPreference: "lightning",
        lnurl: "",
      })
    ).toBe(false);
  });

  it("is not eligible when lnurl is a @zeuspay.com address", () => {
    expect(
      isEligibleForLightningPayout({
        sellerP2pk: undefined,
        paymentPreference: "lightning",
        lnurl: "seller@zeuspay.com",
      })
    ).toBe(false);
  });

  it("is not eligible when the seller's P2PK escrow is active", () => {
    expect(
      isEligibleForLightningPayout({
        sellerP2pk: {
          enabled: true,
          pubkey: "seller_pubkey",
          refundDelayDays: 7,
        },
        paymentPreference: "lightning",
        lnurl: "seller@getalby.com",
      })
    ).toBe(false);
  });
});

describe("buildLightningPaymentMessage", () => {
  it("uses singular phrasing and 'on Shopstr' when quantity is absent", () => {
    expect(
      buildLightningPaymentMessage({
        buyerNpub: "npub1buyer",
        title: "Handmade Mug",
        productDetails: " in size S",
        lnurl: "seller@getalby.com",
      })
    ).toBe(
      "You have received a payment from npub1buyer for your Handmade Mug listing in size S" +
        " on Shopstr! Check your Lightning address (seller@getalby.com) for your sats."
    );
  });

  it("pluralizes for quantity > 1", () => {
    expect(
      buildLightningPaymentMessage({
        buyerNpub: "npub1buyer",
        title: "Handmade Mug",
        productDetails: "",
        lnurl: "seller@getalby.com",
        quantity: 3,
      })
    ).toBe(
      "You have received a payment from npub1buyer for 3 of your Handmade Mug listing" +
        " on Shopstr! Check your Lightning address (seller@getalby.com) for your sats."
    );
  });

  it("falls back to 'a guest buyer' when no npub is available", () => {
    expect(
      buildLightningPaymentMessage({
        title: "Handmade Mug",
        productDetails: "",
        lnurl: "seller@getalby.com",
      })
    ).toContain("from a guest buyer for your");
  });
});

describe("buildEcashPaymentMessage", () => {
  it("embeds the token and uses singular phrasing when quantity is absent", () => {
    expect(
      buildEcashPaymentMessage({
        buyerNpub: "npub1buyer",
        title: "Handmade Mug",
        productDetails: "",
        token: "cashuAmocktoken",
      })
    ).toBe(
      "This is a Cashu token payment from npub1buyer for your Handmade Mug listing on Shopstr: cashuAmocktoken"
    );
  });

  it("pluralizes for quantity > 1", () => {
    expect(
      buildEcashPaymentMessage({
        buyerNpub: "npub1buyer",
        title: "Handmade Mug",
        productDetails: "",
        token: "cashuAmocktoken",
        quantity: 2,
      })
    ).toContain("for 2 of your Handmade Mug listing");
  });
});

describe("buildShipProductMessage / buildShippingAddressTag", () => {
  const addrNoUnit: ShippingAddressInput = {
    name: "Ada Lovelace",
    address: "123 Main St",
    city: "Metropolis",
    postalCode: "12345",
    state: "NY",
    country: "USA",
  };
  const addrWithUnit: ShippingAddressInput = { ...addrNoUnit, unitNo: "Apt 4" };

  it("builds the ship-product message without a unit number", () => {
    expect(buildShipProductMessage("", addrNoUnit)).toBe(
      "Please ship the product to Ada Lovelace at 123 Main St, Metropolis, NY, 12345, USA."
    );
  });

  it("inserts the unit number into the ship-product message when present", () => {
    expect(buildShipProductMessage("", addrWithUnit)).toBe(
      "Please ship the product to Ada Lovelace at 123 Main St Apt 4, Metropolis, NY, 12345, USA."
    );
  });

  it("includes the product details suffix immediately after 'product'", () => {
    expect(buildShipProductMessage(" in size S", addrNoUnit)).toContain(
      "Please ship the product in size S to Ada Lovelace"
    );
  });

  it("uses the same city/state/postalCode order as buildShipProductMessage, without a unit", () => {
    expect(buildShippingAddressTag(addrNoUnit)).toBe(
      "Ada Lovelace, 123 Main St, Metropolis, NY, 12345, USA"
    );
  });

  it("inserts the unit number into the address tag when present", () => {
    expect(buildShippingAddressTag(addrWithUnit)).toBe(
      "Ada Lovelace, 123 Main St, Apt 4, Metropolis, NY, 12345, USA"
    );
  });
});

describe("buildOrderProcessedReceiptMessage", () => {
  it("builds the shipping/pickup-followup receipt text", () => {
    expect(
      buildOrderProcessedReceiptMessage("Handmade Mug", "", "npub1seller")
    ).toBe(
      "Your order for Handmade Mug was processed successfully! If applicable, you should be receiving delivery information from npub1seller as soon as they review your order."
    );
  });
});

describe("buildThankYouReceiptMessage", () => {
  it("builds the plain digital-purchase receipt text", () => {
    expect(
      buildThankYouReceiptMessage("Handmade Mug", " in size S", "npub1seller")
    ).toBe(
      "Thank you for your purchase of Handmade Mug in size S from npub1seller."
    );
  });
});
