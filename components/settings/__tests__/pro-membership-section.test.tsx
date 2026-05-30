import {
  render,
  screen,
  fireEvent,
  waitFor,
  within,
} from "@testing-library/react";
import "@testing-library/jest-dom";

import ProMembershipSection from "../pro-membership-section";
import type { MembershipView } from "@/utils/pro/constants";

const mockRouterPush = jest.fn();
jest.mock("next/router", () => ({
  useRouter: jest.fn(() => ({ push: mockRouterPush })),
}));

// Heroui renders complex portals/animations that don't play well in jsdom, so
// swap each piece for a minimal element that preserves the behaviour the tests
// care about (onClick, disabled, and Modal honouring isOpen).
jest.mock("@heroui/react", () => ({
  Button: ({ children, onClick, isDisabled, isLoading }: any) => (
    <button onClick={onClick} disabled={isDisabled || isLoading}>
      {children}
    </button>
  ),
  Card: ({ children }: any) => <div>{children}</div>,
  CardBody: ({ children }: any) => <div>{children}</div>,
  Modal: ({ children, isOpen }: any) =>
    isOpen ? <div role="dialog">{children}</div> : null,
  ModalContent: ({ children }: any) => <div>{children}</div>,
  ModalHeader: ({ children }: any) => <header>{children}</header>,
  ModalBody: ({ children }: any) => <div>{children}</div>,
  ModalFooter: ({ children }: any) => <footer>{children}</footer>,
  Spinner: () => <div data-testid="spinner" />,
}));

jest.mock("@heroicons/react/24/outline", () => ({
  ArrowDownTrayIcon: () => <span data-testid="pdf-icon" />,
  ArrowTopRightOnSquareIcon: () => <span data-testid="receipt-icon" />,
  InformationCircleIcon: () => <span data-testid="info-icon" />,
}));

jest.mock("@/components/pro/pro-badge", () => ({
  __esModule: true,
  default: ({ variant }: { variant?: string }) => (
    <span data-testid="pro-badge">{variant}</span>
  ),
}));

jest.mock("@/components/utility-components/success-modal", () => ({
  __esModule: true,
  default: ({ isOpen, bodyText }: { isOpen: boolean; bodyText: string }) =>
    isOpen ? <div data-testid="success-modal">{bodyText}</div> : null,
}));

jest.mock("@/components/utility-components/failure-modal", () => ({
  __esModule: true,
  default: ({ isOpen, bodyText }: { isOpen: boolean; bodyText: string }) =>
    isOpen ? <div data-testid="failure-modal">{bodyText}</div> : null,
}));

const mockCancel = jest.fn();
const mockFetchHistory = jest.fn();
let mockContextValue: any;

jest.mock("@/components/utility-components/pro-membership-context", () => ({
  useProMembership: () => mockContextValue,
}));

function makeMembership(
  overrides: Partial<MembershipView> = {}
): MembershipView {
  return {
    pubkey: "pk",
    status: "active",
    isPro: true,
    canEdit: true,
    isTrialing: false,
    isReadOnly: false,
    isHidden: false,
    isPubliclyVisible: true,
    billingMethod: "stripe",
    term: "monthly",
    trialEnd: null,
    currentPeriodEnd: "2026-07-01T00:00:00.000Z",
    graceUntil: null,
    readonlyUntil: null,
    cancelAtPeriodEnd: false,
    ...overrides,
  };
}

function setContext(
  membership: MembershipView,
  opts: { loading?: boolean } = {}
) {
  mockContextValue = {
    membership,
    loading: opts.loading ?? false,
    isPro: membership.isPro,
    refresh: jest.fn(),
    startStripeSubscription: jest.fn(),
    syncStripe: jest.fn(),
    cancel: mockCancel,
    createManualInvoice: jest.fn(),
    verifyManualInvoice: jest.fn(),
    fetchHistory: mockFetchHistory,
  };
}

// Wait for the billing-history effect to settle so async state updates don't
// leak across tests / trigger act warnings.
async function settleHistory() {
  await waitFor(() => expect(mockFetchHistory).toHaveBeenCalled());
}

beforeEach(() => {
  mockRouterPush.mockClear();
  mockCancel.mockReset();
  mockFetchHistory.mockReset();
  mockFetchHistory.mockResolvedValue([]);
});

describe("ProMembershipSection — status line and buttons", () => {
  it("shows a loading spinner while membership is loading", () => {
    setContext(makeMembership({ status: "free", isPro: false }), {
      loading: true,
    });
    render(<ProMembershipSection />);

    expect(screen.getByTestId("spinner")).toBeInTheDocument();
    expect(screen.getByText("Loading your membership…")).toBeInTheDocument();
    // History is hidden while loading.
    expect(screen.queryByText("Billing history")).not.toBeInTheDocument();
    expect(mockFetchHistory).not.toHaveBeenCalled();
  });

  it("shows the free-plan upgrade nudge and routes to /pro", () => {
    setContext(
      makeMembership({
        status: "free",
        isPro: false,
        billingMethod: null,
        term: null,
        currentPeriodEnd: null,
      })
    );
    render(<ProMembershipSection />);

    expect(screen.getByText("You're on the Free plan")).toBeInTheDocument();
    // Free sellers never had a billing account → no history fetch.
    expect(mockFetchHistory).not.toHaveBeenCalled();
    expect(screen.queryByText("Billing history")).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("Upgrade to Pro"));
    expect(mockRouterPush).toHaveBeenCalledWith("/pro");
  });

  it("renders a trialing membership with a trial badge and trial copy", async () => {
    setContext(
      makeMembership({
        status: "trialing",
        isTrialing: true,
        currentPeriodEnd: null,
        trialEnd: "2026-08-01T00:00:00.000Z",
      })
    );
    render(<ProMembershipSection />);
    await settleHistory();

    expect(screen.getByTestId("pro-badge")).toHaveTextContent("trial");
    expect(
      screen.getByText(/Your free trial is active until/)
    ).toBeInTheDocument();
  });

  it("renders an active Stripe membership with cancel and view-plans buttons", async () => {
    setContext(makeMembership());
    render(<ProMembershipSection />);
    await settleHistory();

    expect(screen.getByText("Pro · Monthly")).toBeInTheDocument();
    expect(screen.getByTestId("pro-badge")).toHaveTextContent("active");
    expect(screen.getByText(/Your membership renews on/)).toBeInTheDocument();
    expect(screen.getByText("Cancel membership")).toBeInTheDocument();
    expect(screen.getByText("View plans")).toBeInTheDocument();
    expect(screen.queryByText("Re-subscribe")).not.toBeInTheDocument();
  });

  it("hides the cancel button when already set to cancel at period end", async () => {
    setContext(makeMembership({ cancelAtPeriodEnd: true }));
    render(<ProMembershipSection />);
    await settleHistory();

    expect(
      screen.getByText(/Your membership is set to cancel/)
    ).toBeInTheDocument();
    expect(screen.queryByText("Cancel membership")).not.toBeInTheDocument();
  });

  it("shows grace-period copy and still allows cancelling", async () => {
    setContext(
      makeMembership({
        status: "grace",
        graceUntil: "2026-07-10T00:00:00.000Z",
      })
    );
    render(<ProMembershipSection />);
    await settleHistory();

    expect(
      screen.getByText(/Your last payment didn't go through/)
    ).toBeInTheDocument();
    expect(screen.getByText("Cancel membership")).toBeInTheDocument();
  });

  it("renders a read-only lapsed membership with a re-subscribe button", async () => {
    setContext(
      makeMembership({
        status: "readonly",
        isPro: false,
        isReadOnly: true,
        currentPeriodEnd: null,
        readonlyUntil: "2026-09-01T00:00:00.000Z",
      })
    );
    render(<ProMembershipSection />);
    await settleHistory();

    expect(screen.getByText(/Your Pro plan has lapsed/)).toBeInTheDocument();
    expect(screen.getByText("Re-subscribe")).toBeInTheDocument();
    expect(screen.queryByText("Cancel membership")).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("Re-subscribe"));
    expect(mockRouterPush).toHaveBeenCalledWith("/pro");
  });

  it("renders a hidden lapsed membership with a re-subscribe button", async () => {
    setContext(
      makeMembership({
        status: "hidden",
        isPro: false,
        isHidden: true,
        currentPeriodEnd: null,
      })
    );
    render(<ProMembershipSection />);
    await settleHistory();

    expect(screen.getByText(/your Pro content is hidden/)).toBeInTheDocument();
    expect(screen.getByText("Re-subscribe")).toBeInTheDocument();
  });

  it("renders a manual (Bitcoin/fiat) membership with renew copy and no cancel", async () => {
    setContext(makeMembership({ billingMethod: "manual" }));
    render(<ProMembershipSection />);
    await settleHistory();

    expect(screen.getByTestId("info-icon")).toBeInTheDocument();
    expect(
      screen.getByText(/Your membership is paid manually/)
    ).toBeInTheDocument();
    expect(screen.getByText("Renew membership")).toBeInTheDocument();
    // Cancel is Stripe-only.
    expect(screen.queryByText("Cancel membership")).not.toBeInTheDocument();
  });
});

describe("ProMembershipSection — cancel flow", () => {
  it("opens the confirmation modal, calls cancel(), and shows success", async () => {
    mockCancel.mockResolvedValue(makeMembership({ cancelAtPeriodEnd: true }));
    setContext(makeMembership());
    render(<ProMembershipSection />);
    await settleHistory();

    // Open the modal from the card button.
    fireEvent.click(screen.getByText("Cancel membership"));
    const dialog = screen.getByRole("dialog");
    expect(
      within(dialog).getByText("Cancel Pro membership?")
    ).toBeInTheDocument();

    // Confirm inside the modal footer.
    fireEvent.click(within(dialog).getByText("Cancel membership"));

    await waitFor(() =>
      expect(screen.getByTestId("success-modal")).toBeInTheDocument()
    );
    expect(mockCancel).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("success-modal")).toHaveTextContent(
      /membership has been canceled/
    );
    // Modal closes on success.
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("shows the failure modal with the error message when cancel() rejects", async () => {
    mockCancel.mockRejectedValue(new Error("Stripe is down"));
    setContext(makeMembership());
    render(<ProMembershipSection />);
    await settleHistory();

    fireEvent.click(screen.getByText("Cancel membership"));
    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByText("Cancel membership"));

    await waitFor(() =>
      expect(screen.getByTestId("failure-modal")).toBeInTheDocument()
    );
    expect(mockCancel).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("failure-modal")).toHaveTextContent(
      "Stripe is down"
    );
  });

  it("keeps the membership when the user backs out of the modal", async () => {
    setContext(makeMembership());
    render(<ProMembershipSection />);
    await settleHistory();

    fireEvent.click(screen.getByText("Cancel membership"));
    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByText("Keep membership"));

    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    );
    expect(mockCancel).not.toHaveBeenCalled();
  });
});

describe("ProMembershipSection — billing history", () => {
  it("renders charges returned from fetchHistory", async () => {
    mockFetchHistory.mockResolvedValue([
      {
        id: "ch_1",
        source: "stripe",
        paidAt: "2026-06-01T00:00:00.000Z",
        amountCents: 2100,
        currency: "usd",
        term: "monthly",
        method: "stripe",
        receiptUrl: "https://stripe.test/receipt",
        invoicePdfUrl: "https://stripe.test/invoice.pdf",
      },
    ]);
    setContext(makeMembership());
    render(<ProMembershipSection />);
    await settleHistory();

    expect(await screen.findByText("Billing history")).toBeInTheDocument();
    expect(screen.getByText("$21.00")).toBeInTheDocument();
    expect(screen.getByText("Card")).toBeInTheDocument();
    expect(screen.getByText("View")).toBeInTheDocument();
    expect(screen.getByText("PDF")).toBeInTheDocument();
  });

  it("shows an error and a retry button when history fails to load", async () => {
    mockFetchHistory.mockRejectedValueOnce(new Error("history boom"));
    setContext(makeMembership());
    render(<ProMembershipSection />);
    await settleHistory();

    expect(await screen.findByText("history boom")).toBeInTheDocument();

    // Retrying re-invokes fetchHistory (now succeeds → empty state).
    mockFetchHistory.mockResolvedValueOnce([]);
    fireEvent.click(screen.getByText("Try again"));
    await waitFor(() => expect(mockFetchHistory).toHaveBeenCalledTimes(2));
    expect(await screen.findByText(/No charges yet/)).toBeInTheDocument();
  });
});
