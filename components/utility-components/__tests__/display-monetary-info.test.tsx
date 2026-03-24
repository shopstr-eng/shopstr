import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import CompactPriceDisplay, {
  DisplayCheckoutCost,
  calculateTotalCost,
  formatWithCommas,
} from "../display-monetary-info";

describe("CompactPriceDisplay", () => {
  it("formats large prices with compact notation", () => {
    const monetaryInfo = { price: 50000, currency: "SATS" };
    render(<CompactPriceDisplay monetaryInfo={monetaryInfo} />);
    expect(screen.getByText(/50K SATS/)).toBeInTheDocument();
  });

  it('displays "Added Cost" shipping correctly', () => {
    const monetaryInfo = {
      price: 1000,
      currency: "USD",
      shippingType: "Added Cost",
      shippingCost: 50,
    };
    render(<CompactPriceDisplay monetaryInfo={monetaryInfo} />);
    expect(screen.getByText(/1K USD \+ 50 USD Shipping/)).toBeInTheDocument();
  });

  it('displays "Free Shipping" correctly', () => {
    const monetaryInfo = {
      price: 2000,
      currency: "SATS",
      shippingType: "Free",
    };
    render(<CompactPriceDisplay monetaryInfo={monetaryInfo} />);
    expect(screen.getByText(/2K SATS - Free Shipping/)).toBeInTheDocument();
  });

  it('displays "Pickup Only" correctly', () => {
    const monetaryInfo = {
      price: 300,
      currency: "SATS",
      shippingType: "Pickup",
    };
    render(<CompactPriceDisplay monetaryInfo={monetaryInfo} />);
    expect(screen.getByText(/300 SATS - Pickup Only/)).toBeInTheDocument();
  });

  it('displays "Free / Pickup" correctly', () => {
    const monetaryInfo = {
      price: 450,
      currency: "SATS",
      shippingType: "Free/Pickup",
    };
    render(<CompactPriceDisplay monetaryInfo={monetaryInfo} />);
    expect(screen.getByText(/450 SATS - Free \/ Pickup/)).toBeInTheDocument();
  });

  it('displays "Added Cost / Pickup" correctly', () => {
    const monetaryInfo = {
      price: 1000,
      currency: "SATS",
      shippingType: "Added Cost/Pickup",
      shippingCost: 50,
    };
    render(<CompactPriceDisplay monetaryInfo={monetaryInfo} />);
    expect(
      screen.getByText(/1k SATS \+ 50 SATS Shipping or Pickup/)
    ).toBeInTheDocument();
  });

  it("does not display a shipping label if no shipping type is provided", () => {
    const monetaryInfo = { price: 100, currency: "SATS" };
    render(<CompactPriceDisplay monetaryInfo={monetaryInfo} />);
    const mainSpan = screen.getByText(/100 SATS/);
    expect(mainSpan.textContent?.trim()).toBe("100 SATS");
  });
});

describe("DisplayCheckoutCost", () => {
  it("renders price and shipping type correctly", () => {
    const monetaryInfo = { price: 1500, currency: "USD", shippingType: "Free" };
    render(<DisplayCheckoutCost monetaryInfo={monetaryInfo} />);
    expect(screen.getByText("1,500 USD")).toBeInTheDocument();
    expect(screen.getByText("Shipping: Free")).toBeInTheDocument();
  });

  it("renders only price if shipping type is not provided", () => {
    const monetaryInfo = { price: 2500, currency: "SATS" };
    render(<DisplayCheckoutCost monetaryInfo={monetaryInfo} />);
    expect(screen.getByText("2,500 SATS")).toBeInTheDocument();
    expect(screen.queryByText(/Shipping:/)).not.toBeInTheDocument();
  });
});

describe("calculateTotalCost", () => {
  it("adds shipping cost to the price", () => {
    const info = { price: 100, shippingCost: 50, currency: "USD" };
    expect(calculateTotalCost(info)).toBe(150);
  });

  it("handles missing shipping cost by adding 0", () => {
    const info = { price: 100, currency: "USD" };
    expect(calculateTotalCost(info)).toBe(100);
  });

  it("works with zero values", () => {
    const info = { price: 0, shippingCost: 0, currency: "USD" };
    expect(calculateTotalCost(info)).toBe(0);
  });
});

describe("formatWithCommas", () => {
  it("formats a number with commas", () => {
    expect(formatWithCommas(1234567, "SATS")).toBe("1,234,567 SATS");
  });

  it("does not add commas to numbers less than 1000", () => {
    expect(formatWithCommas(999, "SATS")).toBe("999 SATS");
  });

  it("handles numbers with decimal points", () => {
    expect(formatWithCommas(1234.56, "SATS")).toBe("1,234.56 SATS");
  });

  it('returns "0 SATS" for an amount of 0', () => {
    expect(formatWithCommas(0, "SATS")).toBe("0 SATS");
  });
});
