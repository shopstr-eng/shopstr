import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import DisputesPage from "@/pages/disputes";
import {
  NostrContext,
  SignerContext,
} from "@/components/utility-components/nostr-context-provider";
import {
  fetchDisputeEvents,
  parseDisputeEvent,
} from "@/utils/nostr/dispute-records";
import { findIncomingEscrowPayload } from "@/utils/cashu/dispute-redemption";

const replaceMock = jest.fn();

jest.mock("next/router", () => ({
  useRouter: () => ({ replace: replaceMock }),
}));

jest.mock("@/components/utility-components/protected-route", () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock("@heroui/react", () => {
  const React = require("react");
  const Pass = ({ children }: { children: React.ReactNode }) =>
    React.createElement("div", null, children);
  return {
    Card: Pass,
    CardBody: Pass,
    CardHeader: Pass,
    Divider: () => React.createElement("hr"),
    Spinner: () => React.createElement("div", null, "Loading"),
  };
});

jest.mock("@/utils/nostr/dispute-records", () => ({
  fetchDisputeEvents: jest.fn(),
  parseDisputeEvent: jest.fn(),
}));

jest.mock("@/utils/cashu/dispute-redemption", () => ({
  findIncomingEscrowPayload: jest.fn(),
}));

jest.mock("@/components/dispute/arbiter-controls", () => ({
  __esModule: true,
  default: ({ onRuled }: { onRuled: () => void }) => (
    <button onClick={onRuled}>Complete ruling</button>
  ),
}));

const mockFetchDisputeEvents = fetchDisputeEvents as jest.Mock;
const mockParseDisputeEvent = parseDisputeEvent as jest.Mock;
const mockFindIncomingEscrowPayload = findIncomingEscrowPayload as jest.Mock;

function renderPage() {
  return render(
    <NostrContext.Provider value={{ nostr: {} } as any}>
      <SignerContext.Provider
        value={
          {
            signer: {},
            pubkey: "arbiter-pubkey",
            isAuthStateResolved: true,
          } as any
        }
      >
        <DisputesPage />
      </SignerContext.Provider>
    </NostrContext.Provider>
  );
}

describe("disputes dashboard", () => {
  const originalArbiterPubkey = process.env.NEXT_PUBLIC_ARBITER_NOSTR_PUBKEY;

  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    process.env.NEXT_PUBLIC_ARBITER_NOSTR_PUBKEY = "arbiter-pubkey";
    mockFetchDisputeEvents.mockResolvedValue([{ id: "open-event" }]);
    mockParseDisputeEvent.mockReturnValue({
      orderId: "order-1",
      reason: "item not delivered",
      buyerPubkey: "buyer-pubkey",
      sellerPubkey: "seller-pubkey",
      arbiterPubkey: "arbiter-pubkey",
      status: "open",
      createdAt: 100,
    });
    mockFindIncomingEscrowPayload.mockResolvedValue({
      type: "escrow-dispute",
      orderId: "order-1",
      token: "cashuAtoken",
      amount: 42,
    });
  });

  afterAll(() => {
    process.env.NEXT_PUBLIC_ARBITER_NOSTR_PUBKEY = originalArbiterPubkey;
  });

  it("does not let stale browser storage override protocol dispute state", async () => {
    localStorage.setItem(
      "shopstr.disputes.resolvedLocally",
      JSON.stringify(["order-1"])
    );

    renderPage();

    expect(await screen.findByText("Order: order-1")).toBeInTheDocument();
  });

  it("removes a successfully ruled row from the current view", async () => {
    renderPage();
    fireEvent.click(await screen.findByText("Complete ruling"));

    await waitFor(() =>
      expect(screen.queryByText("Order: order-1")).not.toBeInTheDocument()
    );
    expect(localStorage.getItem("shopstr.disputes.resolvedLocally")).toBeNull();
  });
});
