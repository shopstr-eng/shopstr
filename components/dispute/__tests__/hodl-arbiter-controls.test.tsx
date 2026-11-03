import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import HodlArbiterControls from "../hodl-arbiter-controls";
import {
  NostrContext,
  SignerContext,
} from "@/components/utility-components/nostr-context-provider";
import { publishHodlReleaseEvent } from "@/utils/nostr/hodl-escrow-records";
import { resolveHodlDispute } from "@/utils/lightning/hodl-order-client";

jest.mock("@/utils/nostr/hodl-escrow-records", () => ({
  publishHodlReleaseEvent: jest.fn(),
}));

jest.mock("@/utils/lightning/hodl-order-client", () => ({
  resolveHodlDispute: jest.fn(),
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
  };
});

jest.mock("@/components/utility-components/confirmation-modal", () => {
  const React = require("react");
  return function MockConfirmationModal({
    isOpen,
    message,
    onConfirm,
    onCancel,
  }: {
    isOpen: boolean;
    message: string;
    onConfirm: () => void;
    onCancel: () => void;
  }) {
    if (!isOpen) return null;
    return React.createElement(
      "div",
      { role: "dialog" },
      React.createElement("div", null, message),
      React.createElement(
        "button",
        { type: "button", onClick: onConfirm },
        "Confirm Ruling"
      ),
      React.createElement(
        "button",
        { type: "button", onClick: onCancel },
        "Cancel"
      )
    );
  };
});

const mockPublishHodlReleaseEvent = publishHodlReleaseEvent as jest.Mock;
const mockResolveHodlDispute = resolveHodlDispute as jest.Mock;

const ARBITER_PUBKEY = "a".repeat(64);
const PAYMENT_HASH = "b".repeat(64);

function renderControls(
  {
    pubkey = ARBITER_PUBKEY,
    signer = {} as any,
    nostr = {} as any,
    onResolved = jest.fn(),
  } = {} as any
) {
  render(
    <NostrContext.Provider value={{ nostr } as any}>
      <SignerContext.Provider value={{ signer, pubkey } as any}>
        <HodlArbiterControls
          paymentHash={PAYMENT_HASH}
          description="never arrived"
          onResolved={onResolved}
        />
      </SignerContext.Provider>
    </NostrContext.Provider>
  );
  return { onResolved };
}

describe("HodlArbiterControls", () => {
  const originalArbiterPubkey = process.env.NEXT_PUBLIC_ARBITER_NOSTR_PUBKEY;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.NEXT_PUBLIC_ARBITER_NOSTR_PUBKEY = ARBITER_PUBKEY;
    mockPublishHodlReleaseEvent.mockResolvedValue(undefined);
    mockResolveHodlDispute.mockResolvedValue(undefined);
  });

  afterAll(() => {
    process.env.NEXT_PUBLIC_ARBITER_NOSTR_PUBKEY = originalArbiterPubkey;
  });

  it("renders nothing for a viewer who is not the arbiter", () => {
    const { container } = render(
      <NostrContext.Provider value={{ nostr: {} } as any}>
        <SignerContext.Provider
          value={{ signer: {}, pubkey: "e".repeat(64) } as any}
        >
          <HodlArbiterControls
            paymentHash={PAYMENT_HASH}
            description="never arrived"
            onResolved={jest.fn()}
          />
        </SignerContext.Provider>
      </NostrContext.Provider>
    );

    // Second gate. The page redirects non-arbiters, but the controls must be
    // inert on their own if they are ever rendered somewhere that does not.
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when no arbiter is configured at all", () => {
    delete process.env.NEXT_PUBLIC_ARBITER_NOSTR_PUBKEY;

    const { container } = render(
      <NostrContext.Provider value={{ nostr: {} } as any}>
        <SignerContext.Provider
          value={{ signer: {}, pubkey: undefined } as any}
        >
          <HodlArbiterControls
            paymentHash={PAYMENT_HASH}
            description="never arrived"
            onResolved={jest.fn()}
          />
        </SignerContext.Provider>
      </NostrContext.Provider>
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("asks for confirmation before ruling rather than acting on the first click", () => {
    renderControls();
    fireEvent.click(screen.getByText("Release to Buyer"));

    expect(mockPublishHodlReleaseEvent).not.toHaveBeenCalled();
    expect(mockResolveHodlDispute).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("publishes the ruling to relays before asking the server to act on it", async () => {
    const order: string[] = [];
    mockPublishHodlReleaseEvent.mockImplementation(async () => {
      order.push("publish");
    });
    mockResolveHodlDispute.mockImplementation(async () => {
      order.push("resolve");
    });

    renderControls();
    fireEvent.click(screen.getByText("Release to Buyer"));
    fireEvent.click(screen.getByText("Confirm Ruling"));

    // The resolve endpoint takes only a payment hash and finds the ruling on
    // relays itself, so a ruling that has not landed yet reads as no ruling.
    await waitFor(() => expect(order).toEqual(["publish", "resolve"]));
  });

  it("signs a release-to-buyer decision for this payment hash", async () => {
    renderControls();
    fireEvent.click(screen.getByText("Release to Buyer"));
    fireEvent.click(screen.getByText("Confirm Ruling"));

    await waitFor(() =>
      expect(mockPublishHodlReleaseEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          paymentHash: PAYMENT_HASH,
          decision: "release:buyer",
        })
      )
    );
    expect(mockResolveHodlDispute).toHaveBeenCalledWith(PAYMENT_HASH);
  });

  it("signs a release-to-seller decision when the seller wins", async () => {
    renderControls();
    fireEvent.click(screen.getByText("Release to Seller"));
    fireEvent.click(screen.getByText("Confirm Ruling"));

    await waitFor(() =>
      expect(mockPublishHodlReleaseEvent).toHaveBeenCalledWith(
        expect.objectContaining({ decision: "release:seller" })
      )
    );
  });

  it("names the winning party in the confirmation prompt", () => {
    renderControls();
    fireEvent.click(screen.getByText("Release to Seller"));

    expect(screen.getByRole("dialog").textContent).toContain("the seller");
  });

  it("tells the caller the ruling landed", async () => {
    const onResolved = jest.fn();
    renderControls({ onResolved });

    fireEvent.click(screen.getByText("Release to Buyer"));
    fireEvent.click(screen.getByText("Confirm Ruling"));

    await waitFor(() =>
      expect(onResolved).toHaveBeenCalledWith("release:buyer")
    );
  });

  it("does not report a ruling as landed when the server refused it", async () => {
    const onResolved = jest.fn();
    mockResolveHodlDispute.mockRejectedValue(
      new Error("Escrow order not found")
    );
    renderControls({ onResolved });

    fireEvent.click(screen.getByText("Release to Buyer"));
    fireEvent.click(screen.getByText("Confirm Ruling"));

    expect(
      await screen.findByText("Escrow order not found")
    ).toBeInTheDocument();
    expect(onResolved).not.toHaveBeenCalled();
  });

  it("does not call the server when publishing to relays failed", async () => {
    mockPublishHodlReleaseEvent.mockRejectedValue(
      new Error("No relay accepted the event")
    );
    renderControls();

    fireEvent.click(screen.getByText("Release to Buyer"));
    fireEvent.click(screen.getByText("Confirm Ruling"));

    await screen.findByText("No relay accepted the event");
    expect(mockResolveHodlDispute).not.toHaveBeenCalled();
  });

  it("shows a countdown, not an error, while a seller dispute is still in its waiting period", async () => {
    const notYet = Object.assign(new Error("Dispute not yet actionable"), {
      status: 403,
      reason: "dispute_not_yet_actionable",
      remainingSeconds: 3 * 3600 + 120,
    });
    mockResolveHodlDispute.mockRejectedValue(notYet);
    const onResolved = jest.fn();
    renderControls({ onResolved });

    fireEvent.click(screen.getByText("Release to Buyer"));
    fireEvent.click(screen.getByText("Confirm Ruling"));

    // A seller's dispute is deliberately unruleable for four hours. That is a
    // "not yet", so it must not read as a failed ruling.
    expect(await screen.findByText(/another 3h 2m/)).toBeInTheDocument();
    expect(screen.queryByText("Dispute not yet actionable")).toBeNull();
    expect(onResolved).not.toHaveBeenCalled();
  });

  it("refuses to rule without a signer", async () => {
    renderControls({ signer: null });

    fireEvent.click(screen.getByText("Release to Buyer"));
    fireEvent.click(screen.getByText("Confirm Ruling"));

    expect(
      await screen.findByText("Signer not available.")
    ).toBeInTheDocument();
    expect(mockPublishHodlReleaseEvent).not.toHaveBeenCalled();
  });

  it("closes the prompt on cancel without ruling", () => {
    renderControls();
    fireEvent.click(screen.getByText("Release to Buyer"));
    fireEvent.click(screen.getByText("Cancel"));

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(mockPublishHodlReleaseEvent).not.toHaveBeenCalled();
  });
});
