import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
} from "@testing-library/react";
import "@testing-library/jest-dom";
import Messages from "../messages";
import { ChatsContext } from "../../../utils/context/context";
import { SignerContext } from "@/components/utility-components/nostr-context-provider";
import * as nostrHelper from "@/utils/nostr/nostr-helper-functions";
import * as keypressHandler from "@/utils/keypress-handler";
import { useRouter } from "next/router";

jest.mock("../../utility-components/mm-spinner", () => {
  return function MockMilkMarketSpinner() {
    return <div data-testid="spinner"></div>;
  };
});

jest.mock("../chat-panel", () => {
  return function MockChatPanel({
    handleSendMessage,
    isSendingDMLoading,
  }: any) {
    return (
      <div data-testid="chat-panel">
        <button
          onClick={() => handleSendMessage("Test message")}
          disabled={isSendingDMLoading}
        >
          Send
        </button>
      </div>
    );
  };
});

jest.mock("../chat-button", () => {
  return function MockChatButton({ pubkeyOfChat, handleClickChat }: any) {
    return (
      <div
        data-testid={`chat-button-${pubkeyOfChat}`}
        onClick={() => handleClickChat(pubkeyOfChat)}
      >
        Chat with {pubkeyOfChat}
      </div>
    );
  };
});

jest.mock("../../utility-components/failure-modal", () => {
  return function MockFailureModal() {
    return <div data-testid="failure-modal"></div>;
  };
});

jest.mock("../../sign-in/SignInModal", () => {
  return function MockSignInModal() {
    return <div data-testid="signin-modal"></div>;
  };
});

jest.mock("next/router", () => ({ __esModule: true, useRouter: jest.fn() }));

jest.mock("@nextui-org/react", () => ({
  ...jest.requireActual("@nextui-org/react"),
  useDisclosure: () => ({
    isOpen: false,
    onOpen: jest.fn(),
    onClose: jest.fn(),
  }),
}));

jest.mock("nostr-tools", () => ({
  nip19: {
    decode: jest.fn((key) => ({ data: `${key}-decoded` })),
  },
}));

jest.mock("@/utils/nostr/nostr-helper-functions");
jest.mock("@/utils/keypress-handler");

const mockNostrHelper = nostrHelper as jest.Mocked<typeof nostrHelper>;
const mockUseKeyPress = keypressHandler.useKeyPress as jest.Mock;

Object.defineProperty(window, "location", {
  configurable: true,
  value: { reload: jest.fn() },
});

describe("Messages Component", () => {
  const mockUserPubkey = "user_pubkey";
  const mockChatPubkey1 = "chat_pubkey_1";
  const mockChatPubkey2 = "chat_pubkey_2";
  let mockRouter: any;

  let mockSignerContextValue: any;
  let mockChatsContextValue: any;

  const mockChatsMap = new Map([
    [
      mockChatPubkey1,
      [
        {
          id: "msg1",
          kind: 14,
          content: "Hello",
          pubkey: mockChatPubkey1,
          created_at: 1000,
          tags: [["subject", "listing-inquiry"]],
          read: true,
        },
        {
          id: "msg2",
          kind: 14,
          content: "New Message",
          pubkey: mockUserPubkey,
          created_at: 1002,
          tags: [["subject", "listing-inquiry"]],
          read: false,
        },
      ],
    ],
    [
      mockChatPubkey2,
      [
        {
          id: "msg3",
          kind: 14,
          content: "Hi there",
          pubkey: mockChatPubkey2,
          created_at: 999,
          tags: [["subject", "listing-inquiry"]],
          read: true,
        },
      ],
    ],
  ]);

  beforeEach(() => {
    jest.clearAllMocks();

    mockSignerContextValue = {
      signer: { signEvent: jest.fn() },
      pubkey: mockUserPubkey,
      setSigner: jest.fn(),
      setPubkey: jest.fn(),
    };

    mockChatsContextValue = {
      chatsMap: new Map(),
      isLoading: true,
      addNewlyCreatedMessageEvent: jest.fn(),
    };

    mockRouter = {
      query: {},
      push: jest.fn(),
    };
    (useRouter as jest.Mock).mockReturnValue(mockRouter);

    mockNostrHelper.generateKeys.mockResolvedValue({
      nsec: "testnsec",
      npub: "testnpub",
    });
    mockNostrHelper.decryptNpub.mockImplementation(
      (npub) => `${npub}-decrypted`
    );

    mockUseKeyPress.mockReturnValue(false);
  });

  const renderComponent = (isPayment = false) => {
    return render(
      <SignerContext.Provider value={mockSignerContextValue}>
        <ChatsContext.Provider value={mockChatsContextValue}>
          <Messages isPayment={isPayment} />
        </ChatsContext.Provider>
      </SignerContext.Provider>
    );
  };

  it("should render a spinner while chats are loading", () => {
    renderComponent();
    expect(screen.getByTestId("spinner")).toBeInTheDocument();
  });

  it("should render a sign-in prompt when not logged in", async () => {
    mockSignerContextValue.pubkey = "";
    mockChatsContextValue.isLoading = false;
    renderComponent();
    await waitFor(() => {
      expect(
        screen.getByText("You must be signed in to see your chats!")
      ).toBeInTheDocument();
    });
  });

  it("should render 'No messages' when logged in with no chats", async () => {
    mockChatsContextValue.isLoading = false;
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText("No messages... yet!")).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /Reload/i })
      ).toBeInTheDocument();
    });
  });

  it("should call window.reload when the 'Reload' button is clicked", async () => {
    mockChatsContextValue.isLoading = false;
    renderComponent();
    await waitFor(() => {
      fireEvent.click(screen.getByRole("button", { name: /Reload/i }));
    });
    expect(window.location.reload).toHaveBeenCalled();
  });

  it("should process and display chats from context, sorted by recent message", async () => {
    mockChatsContextValue.isLoading = false;
    mockChatsContextValue.chatsMap = mockChatsMap;
    renderComponent();
    await waitFor(() => {
      const chatButtons = screen.getAllByText(/Chat with/);
      expect(chatButtons[0]).toHaveTextContent(`Chat with ${mockChatPubkey1}`);
      expect(chatButtons[1]).toHaveTextContent(`Chat with ${mockChatPubkey2}`);
    });
  });

  it("should handle a pubkey from router query and open the chat", async () => {
    mockRouter.query.pk = "new_chat_npub";
    mockChatsContextValue.isLoading = false;
    mockChatsContextValue.chatsMap = mockChatsMap;
    renderComponent();
    await waitFor(() => {
      expect(
        screen.getByTestId("chat-button-new_chat_npub-decrypted")
      ).toBeInTheDocument();
    });
  });

  it("should send a gift-wrapped message successfully", async () => {
    mockChatsContextValue.isLoading = false;
    mockChatsContextValue.chatsMap = mockChatsMap;

    const mockGiftWrappedEvent = {
      id: "new-gift-event",
      content: "Test message",
      kind: 14,
      pubkey: mockUserPubkey,
      created_at: 1005,
      tags: [["p", mockChatPubkey1]],
    };
    mockNostrHelper.constructGiftWrappedEvent.mockResolvedValue(
      mockGiftWrappedEvent as any
    );
    mockNostrHelper.constructMessageSeal.mockResolvedValue(
      "sealed-event" as any
    );
    mockNostrHelper.constructMessageGiftWrap.mockResolvedValue(
      "gift-wrapped-event" as any
    );
    mockNostrHelper.sendGiftWrappedMessageEvent.mockResolvedValue(undefined);

    renderComponent();
    await waitFor(() => {
      fireEvent.click(screen.getByTestId(`chat-button-${mockChatPubkey1}`));
    });
    const sendButton = screen.getByRole("button", { name: "Send" });
    await act(async () => {
      fireEvent.click(sendButton);
    });
    await waitFor(() => {
      expect(mockNostrHelper.constructGiftWrappedEvent).toHaveBeenCalledWith(
        mockUserPubkey,
        mockChatPubkey1,
        "Test message",
        "listing-inquiry"
      );
    });
  });

  it("should handle errors when sending a message", async () => {
    mockChatsContextValue.isLoading = false;
    mockChatsContextValue.chatsMap = mockChatsMap;
    mockNostrHelper.constructGiftWrappedEvent.mockRejectedValue(
      new Error("Send failed")
    );

    renderComponent();
    await waitFor(() => {
      fireEvent.click(screen.getByTestId(`chat-button-${mockChatPubkey1}`));
    });
    const sendButton = screen.getByRole("button", { name: "Send" });
    await act(async () => {
      fireEvent.click(sendButton);
    });
    await waitFor(() => {
      expect(screen.getByTestId("failure-modal")).toBeInTheDocument();
    });
  });
});
