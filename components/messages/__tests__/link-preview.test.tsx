import { render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";

import LinkPreview from "../link-preview";

describe("LinkPreview", () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });

  it("does not render a script scheme from OpenGraph data as the preview href", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({
        title: "Order receipt",
        url: "javascript:alert(1)",
      }),
    });

    render(
      <LinkPreview url="https://attacker.example/order" isUserMessage={false} />
    );

    const title = await screen.findByText("Order receipt");
    const previewLink = title.closest("a");

    await waitFor(() => {
      expect(previewLink).toHaveAttribute(
        "href",
        "https://attacker.example/order"
      );
    });
  });

  it("uses safe OpenGraph URLs for the preview href", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({
        title: "Order receipt",
        url: "https://seller.example/orders/123",
      }),
    });

    render(
      <LinkPreview url="https://seller.example/listing" isUserMessage={false} />
    );

    const title = await screen.findByText("Order receipt");
    expect(title.closest("a")).toHaveAttribute(
      "href",
      "https://seller.example/orders/123"
    );
  });
});
