/**
 * @jest-environment jsdom
 */
import { render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import userEvent from "@testing-library/user-event";
import PendingPayouts from "../pending-payouts";
import {
  NostrContext,
  SignerContext,
} from "@/components/utility-components/nostr-context-provider";
import { ChatsContext } from "@/utils/context/context";
import { resolvePendingSellerLightningPayout } from "@/utils/payments/resolve-pending-payouts";
import { notifySellerOfCompletedPayout } from "@/utils/payments/seller-payout-notification";
import { sendBuyerOrderReceipt } from "@/utils/payments/buyer-receipt-notification";
import {
  getPendingSellerLightningPayouts,
  recordPendingSellerLightningPayout,
  removePendingSellerLightningPayout,
} from "@/utils/payments/pending-lightning-payouts";

jest.mock("@/utils/payments/resolve-pending-payouts", () => ({
  resolvePendingSellerLightningPayout: jest.fn(),
}));
jest.mock("@/utils/payments/seller-payout-notification", () => ({
  notifySellerOfCompletedPayout: jest.fn(),
}));
jest.mock("@/utils/payments/buyer-receipt-notification", () => ({
  sendBuyerOrderReceipt: jest.fn(),
}));

const mockResolve = resolvePendingSellerLightningPayout as jest.Mock;
const mockNotifySeller = notifySellerOfCompletedPayout as jest.Mock;
const mockSendReceipt = sendBuyerOrderReceipt as jest.Mock;

const BUYER_PUBKEY = "c".repeat(64);

function seedRecord() {
  recordPendingSellerLightningPayout({
    orderId: "order-1",
    mintUrl: "https://mint.example",
    sellerPubkey: "b".repeat(64),
    buyerPubkey: BUYER_PUBKEY,
    lnurl: "seller@example.com",
    sellerAmount: 1000,
    status: "pending",
    meltQuoteId: "melt-quote-1",
    recoverableProofs: [],
    quarantinedProofs: [],
    errorMessage: "mint still processing",
  });
}

function renderPendingPayouts() {
  const addNewlyCreatedMessageEvent = jest.fn();
  render(
    <NostrContext.Provider value={{ nostr: {} } as any}>
      <SignerContext.Provider
        value={{ signer: {}, pubkey: BUYER_PUBKEY } as any}
      >
        <ChatsContext.Provider
          value={
            {
              chatsMap: new Map(),
              isLoading: false,
              addNewlyCreatedMessageEvent,
              markAllMessagesAsRead: jest.fn(),
              newOrderIds: new Set(),
            } as any
          }
        >
          <PendingPayouts />
        </ChatsContext.Provider>
      </SignerContext.Provider>
    </NostrContext.Provider>
  );
  return { addNewlyCreatedMessageEvent };
}

beforeEach(() => {
  jest.clearAllMocks();
  window.localStorage.clear();
  mockNotifySeller.mockResolvedValue(undefined);
  mockSendReceipt.mockResolvedValue({ id: "receipt-event" });
});

describe("PendingPayouts", () => {
  it("keeps the completion notice visible after resolving the only record and files the receipt into chat history", async () => {
    seedRecord();
    // Mirror the real resolver: notify seller then buyer, then clear the
    // record — which empties the list this component renders.
    mockResolve.mockImplementation(
      async (record: any, _n: any, _s: any, _pk: any, options: any) => {
        await options.notifySeller(record);
        await options.notifyBuyer(record);
        removePendingSellerLightningPayout(record.meltQuoteId);
        return { status: "completed" };
      }
    );
    const { addNewlyCreatedMessageEvent } = renderPendingPayouts();

    await userEvent.click(
      screen.getByRole("button", { name: /Check & recover/i })
    );

    // The notice must survive the record list becoming empty — otherwise
    // the buyer never sees the outcome of the payout they just resolved.
    expect(
      await screen.findByText(/order receipt is in your messages/i)
    ).toBeInTheDocument();
    expect(screen.queryByText(/Order order-1/)).not.toBeInTheDocument();
    expect(getPendingSellerLightningPayouts()).toHaveLength(0);
    expect(addNewlyCreatedMessageEvent).toHaveBeenCalledWith(
      expect.objectContaining({ id: "receipt-event", read: false }),
      true
    );
  });

  it("surfaces a receipt failure in the persistent completion notice", async () => {
    seedRecord();
    mockResolve.mockImplementation(async (record: any) => {
      removePendingSellerLightningPayout(record.meltQuoteId);
      return { status: "completed", receiptError: "no relays available" };
    });
    renderPendingPayouts();

    await userEvent.click(
      screen.getByRole("button", { name: /Check & recover/i })
    );

    const notice = await screen.findByText(
      /order receipt could not be sent: no relays available/i
    );
    expect(notice).toBeInTheDocument();
    // The payout still resolved — the record is gone and the list is empty.
    expect(getPendingSellerLightningPayouts()).toHaveLength(0);
  });

  it("passes the seller notification ahead of the buyer receipt to the resolver", async () => {
    seedRecord();
    mockResolve.mockResolvedValue({ status: "completed" });
    renderPendingPayouts();

    await userEvent.click(
      screen.getByRole("button", { name: /Check & recover/i })
    );

    await waitFor(() => expect(mockResolve).toHaveBeenCalledTimes(1));
    const options = mockResolve.mock.calls[0]![4];
    await options.notifySeller({ meltQuoteId: "melt-quote-1" });
    await options.notifyBuyer({ meltQuoteId: "melt-quote-1" });
    expect(mockNotifySeller).toHaveBeenCalledWith(
      expect.objectContaining({
        record: expect.objectContaining({ meltQuoteId: "melt-quote-1" }),
        buyerPubkey: BUYER_PUBKEY,
      })
    );
    expect(mockSendReceipt).toHaveBeenCalledWith(
      expect.objectContaining({ buyerPubkey: BUYER_PUBKEY })
    );
  });
});
