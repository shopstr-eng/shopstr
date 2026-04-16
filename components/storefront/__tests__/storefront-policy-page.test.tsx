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
  it("renders the supported markdown subset as real elements", () => {
    render(
      <StorefrontPolicyPage
        policy={{
          enabled: true,
          content:
            "# Terms\n\nPlain **bold** and *italic* text.\n\n- First\n- Second",
        }}
        colors={colors}
      />
    );

    expect(
      screen.getByRole("heading", { level: 1, name: "Terms" })
    ).toBeInTheDocument();

    const bold = screen.getByText("bold");
    expect(bold.tagName).toBe("STRONG");

    const italic = screen.getByText("italic");
    expect(italic.tagName).toBe("EM");

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
    expect(
      (window as unknown as { __shopstrXss?: number }).__shopstrXss
    ).toBeUndefined();
  });

  it("treats a backslash-escaped asterisk as a literal character", () => {
    render(
      <StorefrontPolicyPage
        policy={{
          enabled: true,
          content: "Use \\*literal\\* stars, not emphasis.",
        }}
        colors={colors}
      />
    );

    expect(
      screen.getByText("Use *literal* stars, not emphasis.")
    ).toBeInTheDocument();
    expect(screen.queryByText("literal")).not.toBeInTheDocument();
  });

  it("leaves an unmatched asterisk as a literal character", () => {
    render(
      <StorefrontPolicyPage
        policy={{
          enabled: true,
          content: "Price: 5 * 2 = 10.",
        }}
        colors={colors}
      />
    );

    expect(screen.getByText("Price: 5 * 2 = 10.")).toBeInTheDocument();
  });

  it("nests italic inside bold", () => {
    render(
      <StorefrontPolicyPage
        policy={{
          enabled: true,
          content: "This is **bold with *nested* italic** here.",
        }}
        colors={colors}
      />
    );

    const nested = screen.getByText("nested");
    expect(nested.tagName).toBe("EM");
    expect(nested.parentElement?.tagName).toBe("STRONG");
  });
});
