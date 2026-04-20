import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";

import SellerOrdersView from "../orders";

jest.mock("@/components/messages/orders-dashboard", () => {
  return function MockOrdersDashboard({
    sellerOnly,
    buyerOnly,
  }: {
    sellerOnly?: boolean;
    buyerOnly?: boolean;
  }) {
    return (
      <div data-testid="orders-dashboard-props">
        sellerOnly:{String(!!sellerOnly)} buyerOnly:{String(!!buyerOnly)}
      </div>
    );
  };
});

jest.mock("@/components/utility-components/protected-route", () => ({
  __esModule: true,
  default: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

describe("SellerOrdersView", () => {
  it("renders the seller-only orders dashboard", () => {
    render(<SellerOrdersView />);

    expect(screen.getByTestId("orders-dashboard-props")).toHaveTextContent(
      "sellerOnly:true buyerOnly:false"
    );
  });
});
