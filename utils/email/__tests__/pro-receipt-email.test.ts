import { proReceiptEmail } from "@/utils/email/email-templates";

describe("proReceiptEmail", () => {
  const base = {
    amountCents: 1500,
    currency: "usd",
    term: "monthly" as const,
    method: "bitcoin" as const,
    paidAt: "2026-05-30T12:00:00.000Z",
  };

  it("renders the amount, date, term label, and payment method", () => {
    const { subject, html } = proReceiptEmail(base);

    expect(html).toContain("$15.00");
    // Date formatted as long en-US date.
    expect(html).toContain("May 30, 2026");
    expect(html).toContain("Monthly Pro");
    expect(html).toContain("Bitcoin");
    expect(subject).toContain("$15.00");
  });

  it("labels yearly terms as Annual and stripe as Card (Stripe)", () => {
    const { html } = proReceiptEmail({
      ...base,
      term: "yearly",
      method: "stripe",
    });

    expect(html).toContain("Annual Pro");
    expect(html).toContain("Card (Stripe)");
  });

  it("labels fiat payments and a null term with the em-dash placeholder", () => {
    const { html } = proReceiptEmail({
      ...base,
      term: null,
      method: "fiat",
    });

    expect(html).toContain("Fiat");
    expect(html).toContain("— Pro");
  });

  it("formats non-USD amounts with the currency code suffix", () => {
    const { html, subject } = proReceiptEmail({
      ...base,
      amountCents: 2000,
      currency: "eur",
    });

    expect(html).toContain("20.00 EUR");
    expect(subject).toContain("20.00 EUR");
  });

  it("omits the date row when paidAt is null", () => {
    const { html } = proReceiptEmail({ ...base, paidAt: null });

    expect(html).not.toContain(">Date<");
  });

  it("includes the Stripe receipt link only when receiptUrl is provided", () => {
    const without = proReceiptEmail(base);
    expect(without.html).not.toContain("View receipt");

    const withLink = proReceiptEmail({
      ...base,
      receiptUrl: "https://stripe.test/receipt/abc",
    });
    expect(withLink.html).toContain("View receipt");
    expect(withLink.html).toContain("https://stripe.test/receipt/abc");
  });

  it("includes the PDF link only when invoicePdfUrl is provided", () => {
    const without = proReceiptEmail(base);
    expect(without.html).not.toContain("Download PDF");

    const withPdf = proReceiptEmail({
      ...base,
      invoicePdfUrl: "https://stripe.test/invoice/abc.pdf",
    });
    expect(withPdf.html).toContain("Download PDF");
    expect(withPdf.html).toContain("https://stripe.test/invoice/abc.pdf");
  });
});
