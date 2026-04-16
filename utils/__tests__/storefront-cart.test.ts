import { getStorefrontCartQuantity } from "../storefront-cart";

describe("getStorefrontCartQuantity", () => {
  beforeEach(() => {
    localStorage.clear();
    jest.restoreAllMocks();
  });

  it("returns the total cart count when no seller pubkey is provided", () => {
    localStorage.setItem(
      "cart",
      JSON.stringify([
        { id: "1", pubkey: "seller-a" },
        { id: "2", pubkey: "seller-b" },
        { id: "3", pubkey: "seller-a" },
      ])
    );

    expect(getStorefrontCartQuantity()).toBe(3);
  });

  it("returns only the matching seller count for storefront carts", () => {
    localStorage.setItem(
      "cart",
      JSON.stringify([
        { id: "1", pubkey: "seller-a" },
        { id: "2", pubkey: "seller-b" },
        { id: "3", pubkey: "seller-a" },
      ])
    );

    expect(getStorefrontCartQuantity("seller-a")).toBe(2);
    expect(getStorefrontCartQuantity("seller-b")).toBe(1);
  });

  it("returns zero and removes malformed cart storage", () => {
    const removeItemSpy = jest.spyOn(Storage.prototype, "removeItem");
    localStorage.setItem("cart", "{bad-json");

    expect(getStorefrontCartQuantity("seller-a")).toBe(0);
    expect(removeItemSpy).toHaveBeenCalledWith("cart");
  });

  it("returns zero and removes non-array cart storage", () => {
    const removeItemSpy = jest.spyOn(Storage.prototype, "removeItem");
    localStorage.setItem("cart", JSON.stringify({ pubkey: "seller-a" }));

    expect(getStorefrontCartQuantity("seller-a")).toBe(0);
    expect(removeItemSpy).toHaveBeenCalledWith("cart");
  });
});
