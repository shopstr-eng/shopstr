import { render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import OrdersDashboard from "../orders-dashboard";
import {
  ChatsContext,
  ProductContext,
  ReviewsContext,
} from "@/utils/context/context";
import {
  NostrContext,
  SignerContext,
} from "@/components/utility-components/nostr-context-provider";
import type { NostrMessageEvent } from "@/utils/types/types";

const fetchOrderParticipantsMock = jest.fn();

jest.mock("@/utils/db/order-participants-client", () => ({
  fetchOrderParticipants: (...args: unknown[]) =>
    fetchOrderParticipantsMock(...args),
}));

jest.mock("@/utils/nostr/nip98-auth", () => ({
  createNip98AuthorizationHeader: jest.fn(async () => "Nostr auth"),
}));

jest.mock("@/utils/nostr/key-utilities", () => ({
  generateKeys: jest.fn(async () => ({ nsec: "nsec", npub: "npub" })),
}));

jest.mock("@/utils/cashu/p2pk-escrow-records", () => ({
  getStoredBuyerP2pkEscrowRecords: jest.fn(async () => []),
}));

jest.mock("@getalby/lightning-tools", () => ({
  getSatoshiValue: jest.fn(async () => 0),
}));

jest.mock("react-chartjs-2", () => ({ Line: () => null }));

jest.mock("@/components/utility-components/profile/profile-dropdown", () => ({
  ProfileWithDropdown: ({ pubkey }: { pubkey: string }) => (
    <span>{pubkey}</span>
  ),
}));
jest.mock("@/components/utility-components/claim-button", () => () => null);
jest.mock("@/components/display-product-modal", () => () => null);
jest.mock(
  "@/components/utility-components/address-change-modal",
  () => () => null
);

const ALICE = "a".repeat(64); // buyer
const BOB = "b".repeat(64); // seller
const MALLORY = "c".repeat(64); // attacker
const ORDER_ID = "7f0c1a52-3d4e-4b6f-8a9b-0c1d2e3f4a5b";
const PRODUCT_ADDRESS = `30402:${BOB}:listing-1`;

const trustedOrder = {
  [ORDER_ID]: {
    buyerPubkey: ALICE,
    sellerPubkey: BOB,
    source: "order_participants",
  },
};

let messageCounter = 0;

function orderMessage(
  sender: string,
  options: {
    subject?: string;
    status?: string;
    buyerTag?: string;
    createdAt?: number;
  } = {}
): NostrMessageEvent {
  messageCounter += 1;
  const tags: string[][] = [
    ["subject", options.subject ?? "order-info"],
    ["order", ORDER_ID],
    ["b", options.buyerTag ?? ALICE],
    ["item", PRODUCT_ADDRESS],
  ];
  if (options.status) tags.push(["status", options.status]);
  return {
    id: messageCounter.toString(16).padStart(64, "0"),
    pubkey: sender,
    created_at: options.createdAt ?? 1_700_000_000 + messageCounter,
    kind: 14,
    tags,
    content: "",
    sig: "",
    read: true,
  };
}

const fetchMock = jest.fn();

function updateStatusCalls() {
  return fetchMock.mock.calls
    .filter(([url]) => url === "/api/db/update-order-status")
    .map(([, init]) => JSON.parse(init.body));
}

function renderDashboard(viewer: string, messages: NostrMessageEvent[]) {
  const chatsMap = new Map<string, NostrMessageEvent[]>([["chat", messages]]);
  return render(
    <SignerContext.Provider
      value={
        {
          signer: { getPubKey: async () => viewer, sign: jest.fn() },
          pubkey: viewer,
          npub: "npub",
          isLoggedIn: true,
        } as any
      }
    >
      <NostrContext.Provider value={{ nostr: {} } as any}>
        <ReviewsContext.Provider
          value={
            {
              merchantReviewsData: new Map(),
              productReviewsData: new Map(),
              updateMerchantReviewsData: jest.fn(),
              updateProductReviewsData: jest.fn(),
            } as any
          }
        >
          <ProductContext.Provider value={{ productEvents: [] } as any}>
            <ChatsContext.Provider
              value={
                {
                  chatsMap,
                  isLoading: false,
                  markAllMessagesAsRead: jest.fn(),
                  newOrderIds: new Set(),
                } as any
              }
            >
              <OrdersDashboard />
            </ChatsContext.Provider>
          </ProductContext.Provider>
        </ReviewsContext.Provider>
      </NostrContext.Provider>
    </SignerContext.Provider>
  );
}

async function expectStatus(status: string) {
  await waitFor(() => {
    expect(fetchOrderParticipantsMock).toHaveBeenCalled();
    expect(screen.getByText(status)).toBeInTheDocument();
  });
  // Let the participant-driven re-render and any persist calls settle.
  await waitFor(() => expect(screen.getByText(status)).toBeInTheDocument());
}

describe("OrdersDashboard status trust", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    messageCounter = 0;
    fetchOrderParticipantsMock.mockResolvedValue(trustedOrder);
    fetchMock.mockImplementation(async (url: string) => ({
      ok: true,
      status: 200,
      json: async () =>
        url === "/api/db/get-order-statuses" ? { statuses: {} } : {},
    }));
    global.fetch = fetchMock as any;
  });

  it("ignores a third party's forged cancellation", async () => {
    renderDashboard(BOB, [
      orderMessage(ALICE, { subject: "order-payment" }),
      orderMessage(MALLORY, { status: "canceled", buyerTag: MALLORY }),
    ]);

    await expectStatus("pending");
    expect(screen.queryByText("canceled")).not.toBeInTheDocument();
    expect(updateStatusCalls()).not.toContainEqual(
      expect.objectContaining({ status: "canceled" })
    );
  });

  it("ignores a competing, backdated order message naming another buyer", async () => {
    renderDashboard(BOB, [
      orderMessage(MALLORY, {
        subject: "order-payment",
        buyerTag: MALLORY,
        createdAt: 1,
      }),
      orderMessage(ALICE, { subject: "order-payment" }),
      orderMessage(MALLORY, {
        status: "canceled",
        buyerTag: MALLORY,
        createdAt: 2,
      }),
    ]);

    await expectStatus("pending");
    expect(screen.queryByText("canceled")).not.toBeInTheDocument();
    expect(fetchOrderParticipantsMock).toHaveBeenCalledWith(expect.anything(), [
      ORDER_ID,
    ]);
  });

  it("applies and persists the buyer's genuine cancellation", async () => {
    renderDashboard(ALICE, [
      orderMessage(ALICE, { subject: "order-payment" }),
      orderMessage(ALICE, { status: "canceled" }),
    ]);

    await expectStatus("canceled");
    await waitFor(() =>
      expect(updateStatusCalls()).toContainEqual(
        expect.objectContaining({ orderId: ORDER_ID, status: "canceled" })
      )
    );
  });

  it("shows but does not persist a cancellation the viewer cannot set", async () => {
    renderDashboard(BOB, [
      orderMessage(ALICE, { subject: "order-payment" }),
      orderMessage(ALICE, { status: "canceled" }),
    ]);

    await expectStatus("canceled");
    expect(updateStatusCalls()).toEqual([]);
  });

  it("ignores the buyer marking their own order shipped", async () => {
    renderDashboard(BOB, [
      orderMessage(ALICE, { subject: "order-payment" }),
      orderMessage(ALICE, { status: "shipped" }),
    ]);

    await expectStatus("pending");
    expect(screen.queryByText("shipped")).not.toBeInTheDocument();
  });

  it("ignores the seller canceling the order", async () => {
    renderDashboard(ALICE, [
      orderMessage(ALICE, { subject: "order-payment" }),
      orderMessage(BOB, { status: "canceled" }),
    ]);

    await expectStatus("pending");
    expect(updateStatusCalls()).not.toContainEqual(
      expect.objectContaining({ status: "canceled" })
    );
  });

  it("applies and persists the seller's shipping update", async () => {
    renderDashboard(BOB, [
      orderMessage(ALICE, { subject: "order-payment" }),
      orderMessage(BOB, { subject: "shipping-info", status: "shipped" }),
    ]);

    await expectStatus("shipped");
    await waitFor(() =>
      expect(updateStatusCalls()).toContainEqual(
        expect.objectContaining({ orderId: ORDER_ID, status: "shipped" })
      )
    );
  });

  it("ignores status changes when participants are unresolved", async () => {
    fetchOrderParticipantsMock.mockResolvedValue({});
    renderDashboard(BOB, [
      orderMessage(ALICE, { subject: "order-payment" }),
      orderMessage(BOB, { subject: "shipping-info", status: "shipped" }),
    ]);

    await expectStatus("pending");
    expect(screen.queryByText("shipped")).not.toBeInTheDocument();
    expect(updateStatusCalls()).toEqual([]);
  });
});
