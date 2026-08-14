import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import HodlOrderActions from "../hodl-order-actions";
import {
  NostrContext,
  SignerContext,
} from "@/components/utility-components/nostr-context-provider";
import {
  publishHodlConfirmEvent,
  publishHodlDisputeEvent,
} from "@/utils/nostr/hodl-escrow-records";
import {
  getClientArbiterNostrPubkey,
  getHodlOrderStatus,
  settleHodlInvoice,
} from "@/utils/lightning/hodl-order-client";

jest.mock("@/utils/nostr/hodl-escrow-records", () => ({
  publishHodlConfirmEvent: jest.fn(),
  publishHodlDisputeEvent: jest.fn(),
}));

jest.mock("@/utils/lightning/hodl-order-client", () => ({
  getClientArbiterNostrPubkey: jest.fn(),
  getHodlOrderStatus: jest.fn(),
  settleHodlInvoice: jest.fn(),
}));

jest.mock("@heroui/react", () => {
  const React = require("react");
  return {
    Button: ({
      children,
      isDisabled,
      isLoading,
      onPress,
    }: {
      children: any;
      isDisabled?: boolean;
      isLoading?: boolean;
      onPress?: () => void;
    }) =>
      React.createElement(
        "button",
        { disabled: isDisabled || isLoading, onClick: onPress, type: "button" },
        children
      ),
    Spinner: () => React.createElement("div", null, "Loading"),
  };
});

jest.mock("@/components/utility-components/confirmation-modal", () => {
  const React = require("react");
  return function MockConfirmationModal({
    isOpen,
    title,
    confirmText,
    onConfirm,
    onCancel,
  }: {
    isOpen: boolean;
    title: string;
    confirmText: string;
    onConfirm: () => void;
    onCancel: () => void;
  }) {
    if (!isOpen) return null;
    return React.createElement(
      "div",
      { role: "dialog" },
      React.createElement("h2", null, title),
      React.createElement(
        "button",
        { type: "button", onClick: onConfirm },
        `${confirmText} (confirm)`
      ),
      React.createElement(
        "button",
        { type: "button", onClick: onCancel },
        "Cancel"
      )
    );
  };
});

const mockPublishHodlConfirmEvent = publishHodlConfirmEvent as jest.Mock;
const mockPublishHodlDisputeEvent = publishHodlDisputeEvent as jest.Mock;
const mockGetClientArbiterNostrPubkey =
  getClientArbiterNostrPubkey as jest.Mock;
const mockGetHodlOrderStatus = getHodlOrderStatus as jest.Mock;
const mockSettleHodlInvoice = settleHodlInvoice as jest.Mock;

const PAYMENT_HASH = "b".repeat(64);
const ARBITER_PUBKEY = "a".repeat(64);

function renderActions({ isSale = false, signer = {} as any } = {}) {
  return render(
    <NostrContext.Provider value={{ nostr: {} } as any}>
      <SignerContext.Provider value={{ signer, pubkey: "1".repeat(64) } as any}>
        <HodlOrderActions paymentHash={PAYMENT_HASH} isSale={isSale} />
      </SignerContext.Provider>
    </NostrContext.Provider>
  );
}

describe("HodlOrderActions", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetClientArbiterNostrPubkey.mockReturnValue(ARBITER_PUBKEY);
    mockGetHodlOrderStatus.mockResolvedValue({
      status: "accepted",
      role: "buyer",
    });
    mockPublishHodlConfirmEvent.mockResolvedValue(undefined);
    mockPublishHodlDisputeEvent.mockResolvedValue(undefined);
    mockSettleHodlInvoice.mockResolvedValue(undefined);
  });

  it("reads the live status from the server rather than trusting the order DM", async () => {
    renderActions();

    await waitFor(() =>
      expect(mockGetHodlOrderStatus).toHaveBeenCalledWith(
        expect.anything(),
        PAYMENT_HASH
      )
    );
  });

  it("offers the buyer Confirm Receipt on a locked order", async () => {
    renderActions();

    expect(await screen.findByText("Confirm Receipt")).toBeInTheDocument();
    expect(screen.queryByText("Collect")).toBeNull();
  });

  it("offers the seller Collect on the same order", async () => {
    mockGetHodlOrderStatus.mockResolvedValue({
      status: "accepted",
      role: "seller",
    });
    renderActions({ isSale: true });

    expect(await screen.findByText("Collect")).toBeInTheDocument();
    expect(screen.queryByText("Confirm Receipt")).toBeNull();
  });

  it("publishes the buyer's confirmation before settling", async () => {
    const order: string[] = [];
    mockPublishHodlConfirmEvent.mockImplementation(async () => {
      order.push("publish");
    });
    mockSettleHodlInvoice.mockImplementation(async () => {
      order.push("settle");
    });

    renderActions();
    fireEvent.click(await screen.findByText("Confirm Receipt"));
    fireEvent.click(screen.getByText("Confirm Receipt (confirm)"));

    // The settle endpoint fetches the kind-30408 event from relays itself, so
    // settling first would look to the server like no confirmation exists.
    await waitFor(() => expect(order).toEqual(["publish", "settle"]));
  });

  it("does not settle on the buyer's first click, only after confirmation", async () => {
    renderActions();
    fireEvent.click(await screen.findByText("Confirm Receipt"));

    expect(mockPublishHodlConfirmEvent).not.toHaveBeenCalled();
    expect(mockSettleHodlInvoice).not.toHaveBeenCalled();
  });

  it("re-reads the status after a successful confirmation", async () => {
    renderActions();
    fireEvent.click(await screen.findByText("Confirm Receipt"));
    fireEvent.click(screen.getByText("Confirm Receipt (confirm)"));

    await waitFor(() =>
      expect(mockGetHodlOrderStatus).toHaveBeenCalledTimes(2)
    );
  });

  it("collects immediately, with no confirmation prompt", async () => {
    mockGetHodlOrderStatus.mockResolvedValue({
      status: "accepted",
      role: "seller",
    });
    renderActions({ isSale: true });
    fireEvent.click(await screen.findByText("Collect"));

    await waitFor(() =>
      expect(mockSettleHodlInvoice).toHaveBeenCalledWith(PAYMENT_HASH)
    );
  });

  it("tells the seller the buyer has not confirmed yet, instead of showing an error", async () => {
    mockGetHodlOrderStatus.mockResolvedValue({
      status: "accepted",
      role: "seller",
    });
    mockSettleHodlInvoice.mockRejectedValue(
      Object.assign(new Error("No buyer confirmation found"), {
        status: 403,
        reason: "no_confirmation",
      })
    );

    renderActions({ isSale: true });
    fireEvent.click(await screen.findByText("Collect"));

    // Collect before the buyer confirms is the normal state of an order in
    // transit, not a fault.
    expect(
      await screen.findByText(/buyer has not confirmed receipt yet/)
    ).toBeInTheDocument();
    expect(screen.queryByText("No buyer confirmation found")).toBeNull();
  });

  it("still surfaces a genuine settle failure to the seller", async () => {
    mockGetHodlOrderStatus.mockResolvedValue({
      status: "accepted",
      role: "seller",
    });
    mockSettleHodlInvoice.mockRejectedValue(
      new Error("Lightning node unreachable")
    );

    renderActions({ isSale: true });
    fireEvent.click(await screen.findByText("Collect"));

    expect(
      await screen.findByText("Lightning node unreachable")
    ).toBeInTheDocument();
  });

  it("raises a dispute naming the configured arbiter", async () => {
    renderActions();
    fireEvent.click(await screen.findByText("Raise Dispute"));
    fireEvent.click(screen.getByText("Raise Dispute (confirm)"));

    await waitFor(() =>
      expect(mockPublishHodlDisputeEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          paymentHash: PAYMENT_HASH,
          arbiterPubkey: ARBITER_PUBKEY,
        })
      )
    );
  });

  it("offers the seller a dispute too", async () => {
    mockGetHodlOrderStatus.mockResolvedValue({
      status: "accepted",
      role: "seller",
    });
    renderActions({ isSale: true });

    expect(await screen.findByText("Raise Dispute")).toBeInTheDocument();
  });

  it("hides the dispute button when no arbiter is configured", async () => {
    mockGetClientArbiterNostrPubkey.mockReturnValue(null);
    renderActions();

    expect(await screen.findByText("Confirm Receipt")).toBeInTheDocument();
    expect(screen.queryByText("Raise Dispute")).toBeNull();
  });

  it("shows no actions while the invoice is still unpaid", async () => {
    mockGetHodlOrderStatus.mockResolvedValue({
      status: "open",
      role: "buyer",
    });
    renderActions();

    expect(
      await screen.findByText("Awaiting escrow payment")
    ).toBeInTheDocument();
    expect(screen.queryByText("Confirm Receipt")).toBeNull();
    expect(screen.queryByText("Raise Dispute")).toBeNull();
  });

  it("shows a settled order as paid, from each side's point of view", async () => {
    mockGetHodlOrderStatus.mockResolvedValue({
      status: "settled",
      role: "buyer",
    });
    const { unmount } = renderActions();
    expect(await screen.findByText("Payment Sent")).toBeInTheDocument();
    unmount();

    renderActions({ isSale: true });
    expect(await screen.findByText("Payment Released")).toBeInTheDocument();
  });

  it("shows a cancelled order as refunded to the buyer", async () => {
    mockGetHodlOrderStatus.mockResolvedValue({
      status: "cancelled",
      role: "buyer",
    });
    renderActions();

    expect(await screen.findByText("Refunded")).toBeInTheDocument();
    expect(screen.queryByText("Confirm Receipt")).toBeNull();
  });

  it("treats a 404 as nothing to act on, not as a failure", async () => {
    mockGetHodlOrderStatus.mockRejectedValue(
      Object.assign(new Error("No such escrow order"), { status: 404 })
    );
    renderActions();

    // The status route answers 404 both for an unregistered hash and for a
    // caller who is not a party, so this is the ordinary case for an old DM.
    expect(await screen.findByText("Lightning Escrow")).toBeInTheDocument();
    expect(screen.queryByText("No such escrow order")).toBeNull();
  });

  it("surfaces a status lookup that failed for any other reason", async () => {
    mockGetHodlOrderStatus.mockRejectedValue(
      Object.assign(new Error("Lightning escrow is not available"), {
        status: 503,
      })
    );
    renderActions();

    expect(
      await screen.findByText("Lightning escrow is not available")
    ).toBeInTheDocument();
  });

  it("does not query the server without a signer", async () => {
    renderActions({ signer: null });

    await waitFor(() =>
      expect(screen.getByText("Lightning Escrow")).toBeInTheDocument()
    );
    expect(mockGetHodlOrderStatus).not.toHaveBeenCalled();
  });
});
