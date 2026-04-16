import { render, screen } from "@testing-library/react";
import StorefrontPolicyPage from "@/components/storefront/storefront-policy-page";

const colors = {
  primary: "#000000",
  secondary: "#ffffff",
  accent: "#111111",
  background: "#ffffff",
  text: "#000000",
};

describe("StorefrontPolicyPage", () => {
  it("renders the supported markdown subset without injecting HTML", () => {
    render(
      <StorefrontPolicyPage
        policy={{
          enabled: true,
          content: "# Terms\n\nPlain **bold** and *italic* text.\n\n- First\n- Second",
        }}
        colors={colors}
      />
    );

    expect(
      screen.getByRole("heading", { level: 1, name: "Terms" })
    ).toBeInTheDocument();
    expect(screen.getByText("bold")).toContainHTML("<strong>bold</strong>");
    expect(screen.getByText("italic")).toContainHTML("<em>italic</em>");
    expect(screen.getByText("First")).toBeInTheDocument();
    expect(screen.getByText("Second")).toBeInTheDocument();
  });

  it("renders attacker HTML as inert text", () => {
    render(
      <StorefrontPolicyPage
        policy={{
          enabled: true,
          content:
            '<img alt="proof" src="x" onerror="window.__shopstrXss = 1">',
        }}
        colors={colors}
      />
    );

    expect(screen.queryByAltText("proof")).not.toBeInTheDocument();
    expect(
      screen.getByText(
        '<img alt="proof" src="x" onerror="window.__shopstrXss = 1">'
      )
    ).toBeInTheDocument();
  });
});
