import { screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { useContext } from "react";
import {
  makeProductData,
  makeShopProfile,
  makeMintQuoteResponse,
  installFetchMock,
  mockFetchJsonOnce,
  mockP2pkCheckoutModule,
  renderWithCheckoutContext,
} from "@/test-utils/checkout-test-helpers";
import { SignerContext } from "@/components/utility-components/nostr-context-provider";
import { CashuWalletContext } from "@/utils/context/context";

function Probe() {
  const { pubkey, isLoggedIn } = useContext(SignerContext);
  const { cashuMints } = useContext(CashuWalletContext);
  return (
    <div>
      <span>pubkey:{pubkey}</span>
      <span>isLoggedIn:{String(isLoggedIn)}</span>
      <span>mints:{cashuMints.join(",")}</span>
    </div>
  );
}

describe("checkout-test-helpers", () => {
  it("makeProductData applies overrides on top of sane defaults", () => {
    const product = makeProductData({ title: "Custom Title", price: 1200 });
    expect(product.title).toBe("Custom Title");
    expect(product.price).toBe(1200);
    expect(product.currency).toBe("SATS");
  });

  it("makeShopProfile merges content overrides instead of replacing the whole object", () => {
    const shop = makeShopProfile({
      content: { name: "Custom Shop" } as any,
    });
    expect(shop.content.name).toBe("Custom Shop");
    expect(shop.content.ui).toBeDefined();
  });

  it("makeMintQuoteResponse keeps default SATS pricing coherent with amount", () => {
    const quote = makeMintQuoteResponse({ amount: 750 });
    expect(quote).toMatchObject({
      request: expect.any(String),
      quote: expect.any(String),
      amount: 750,
      mintUrl: expect.any(String),
      pricing: expect.objectContaining({
        unitPrice: 750,
        subtotal: 750,
        total: 750,
      }),
    });
  });

  it("renderWithCheckoutContext wires default context values through useContext", () => {
    renderWithCheckoutContext(<Probe />);
    expect(screen.getByText("pubkey:buyer_pubkey")).toBeInTheDocument();
    expect(screen.getByText("isLoggedIn:true")).toBeInTheDocument();
  });

  it("renderWithCheckoutContext applies per-context overrides", () => {
    renderWithCheckoutContext(<Probe />, {
      signer: { pubkey: "other_pubkey", isLoggedIn: false },
      cashuWallet: { cashuMints: ["https://mint.example.com"] },
    });
    expect(screen.getByText("pubkey:other_pubkey")).toBeInTheDocument();
    expect(screen.getByText("isLoggedIn:false")).toBeInTheDocument();
    expect(
      screen.getByText("mints:https://mint.example.com")
    ).toBeInTheDocument();
  });

  it("mockP2pkCheckoutModule includes the ProductInvoiceCard runtime contract", () => {
    const p2pkModule = mockP2pkCheckoutModule();

    expect(p2pkModule.isSellerP2pkEscrowActive).toEqual(expect.any(Function));
    expect(p2pkModule.isSellerP2pkEscrowActive(undefined)).toBe(false);
  });

  describe("fetch mocking", () => {
    beforeEach(() => {
      installFetchMock();
    });

    it("mockFetchJsonOnce queues a resolvable Response-shaped value", async () => {
      mockFetchJsonOnce(makeMintQuoteResponse({ amount: 999 }));
      const response = await fetch("/api/listing/mint-quote");
      expect(response.ok).toBe(true);
      const payload = await response.json();
      expect(payload.amount).toBe(999);
    });

    it("mockFetchJsonOnce can queue a non-ok response", async () => {
      mockFetchJsonOnce({ error: "nope" }, { ok: false, status: 400 });
      const response = await fetch("/api/listing/mint-quote");
      expect(response.ok).toBe(false);
      expect(response.status).toBe(400);
    });
  });
});
