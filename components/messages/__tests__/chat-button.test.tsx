import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";

import ChatButton from "../chat-button";
import { ChatObject, DecryptedMessage } from "../../../utils/types/types";

jest.mock("@/components/utility-components/profile/profile-avatar", () => ({
  ProfileAvatar: ({
    pubkey,
    description,
  }: {
    pubkey: string;
    description: string;
  }) => (
    <div data-testid="profile-avatar">
      <span>{pubkey}</span>
      <p>{description}</p>
    </div>
  ),
}));

jest.mock("../../../utils/messages/utils", () => ({
  timeSinceMessageDisplayText: jest.fn((timestamp: number) => {
    if (!timestamp) return { short: "" };
    return { short: "5m" };
  }),
}));

describe("ChatButton Component", () => {
  const mockHandleClickChat = jest.fn();
  const mockScrollIntoView = jest.fn();

  beforeAll(() => {
    window.HTMLElement.prototype.scrollIntoView = mockScrollIntoView;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  const baseChatObject: ChatObject = {
    decryptedChat: [
      {
        id: "1",
        pubkey: "sender-pubkey",
        created_at: Math.floor(Date.now() / 1000) - 300,
        kind: 4,
        tags: [],
        content: "Hello there!",
        sig: "sig1",
      },
      {
        id: "2",
        pubkey: "receiver-pubkey",
        created_at: Math.floor(Date.now() / 1000),
        kind: 4,
        tags: [],
        content: "This is the last message.",
        sig: "sig2",
      },
    ] as DecryptedMessage[],
    unreadCount: 0,
  };

  // Default props for the component
  const defaultProps = {
    pubkeyOfChat: "test-pubkey",
    chatObject: baseChatObject,
    openedChatPubkey: "another-pubkey",
    handleClickChat: mockHandleClickChat,
  };

  test("renders correctly with message data and no unread count", () => {
    render(<ChatButton {...defaultProps} />);

    const avatar = screen.getByTestId("profile-avatar");
    expect(avatar).toBeInTheDocument();
    expect(screen.getByText("test-pubkey")).toBeInTheDocument();
    expect(screen.getByText("This is the last message.")).toBeInTheDocument();

    expect(screen.getByText("5m")).toBeInTheDocument();

    const unreadSpans = screen.queryAllByText(/^\d+$/);
    expect(
      unreadSpans.find((span) => span.className.includes("rounded-full"))
    ).toBeUndefined();

    const container = avatar.closest("div.cursor-pointer");
    expect(container).not.toHaveClass("bg-[#ccccccb9]");
  });

  test("displays unread count when it is greater than 0", () => {
    const propsWithUnread = {
      ...defaultProps,
      chatObject: {
        ...baseChatObject,
        unreadCount: 3,
      },
    };
    render(<ChatButton {...propsWithUnread} />);

    const unreadBadge = screen.getByText("3");
    expect(unreadBadge).toBeInTheDocument();
    expect(unreadBadge).toHaveClass("rounded-full bg-dark-fg");
  });

  test("applies active styles when it is the opened chat", () => {
    const propsAsOpened = {
      ...defaultProps,
      openedChatPubkey: "test-pubkey",
    };
    render(<ChatButton {...propsAsOpened} />);

    const container = screen
      .getByTestId("profile-avatar")
      .closest("div.cursor-pointer");
    expect(container).toHaveClass("bg-[#ccccccb9]");
  });

  test("calls handleClickChat with the correct pubkey on click", () => {
    render(<ChatButton {...defaultProps} />);

    const container = screen
      .getByTestId("profile-avatar")
      .closest("div.cursor-pointer");
    expect(container).toBeInTheDocument();
    if (container) {
      fireEvent.click(container);
    }

    // Verify the click handler was called once with the correct public key
    expect(mockHandleClickChat).toHaveBeenCalledTimes(1);
    expect(mockHandleClickChat).toHaveBeenCalledWith("test-pubkey");
  });

  test("renders correctly when there are no messages", () => {
    const propsNoMessages = {
      ...defaultProps,
      chatObject: {
        ...baseChatObject,
        decryptedChat: [],
      },
    };
    render(<ChatButton {...propsNoMessages} />);

    expect(screen.getByText("No messages yet")).toBeInTheDocument();

    const timeContainer = screen
      .getByText("No messages yet")
      .closest(".flex")
      ?.querySelector(".text-right > div:last-child > span");
    expect(timeContainer).toBeInTheDocument();
    expect(timeContainer?.textContent).toBe("");
  });

  test("calls scrollIntoView when it becomes the opened chat", () => {
    const { rerender } = render(<ChatButton {...defaultProps} />);

    expect(mockScrollIntoView).not.toHaveBeenCalled();

    const propsAsOpened = {
      ...defaultProps,
      openedChatPubkey: "test-pubkey",
    };
    rerender(<ChatButton {...propsAsOpened} />);

    expect(mockScrollIntoView).toHaveBeenCalledTimes(1);
    expect(mockScrollIntoView).toHaveBeenCalledWith({ behavior: "smooth" });
  });

  test("handles chatObject being null or undefined gracefully", () => {
    const propsUndefinedChat = {
      ...defaultProps,
      chatObject: undefined as any,
    };
    render(<ChatButton {...propsUndefinedChat} />);

    expect(screen.getByText("No messages yet")).toBeInTheDocument();

    const timeContainer = screen
      .getByText("No messages yet")
      .closest(".flex")
      ?.querySelector(".text-right > div:last-child > span");
    expect(timeContainer).toBeInTheDocument();
    expect(timeContainer?.textContent).toBe("");

    const unreadSpans = screen.queryAllByText(/^\d+$/);
    expect(
      unreadSpans.find((span) => span.className.includes("rounded-full"))
    ).toBeUndefined();
  });
});
