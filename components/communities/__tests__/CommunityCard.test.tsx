import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";
import CommunityCard from "../CommunityCard";
import { Community } from "@/utils/types/types";
import { nip19 } from "nostr-tools";
import { sanitizeUrl } from "@braintree/sanitize-url";

const mockPush = jest.fn();
jest.mock("next/router", () => ({
  useRouter() {
    return {
      push: mockPush,
    };
  },
}));

jest.mock("nostr-tools", () => ({
  nip19: {
    naddrEncode: jest.fn(),
  },
}));

jest.mock("@braintree/sanitize-url", () => ({
  sanitizeUrl: jest.fn((url) => url),
}));

const mockedNip19 = nip19 as jest.Mocked<typeof nip19>;
const mockedSanitizeUrl = sanitizeUrl as jest.Mocked<typeof sanitizeUrl>;

describe("CommunityCard", () => {
  const mockCommunity: Community = {
    id: "test-event-id-123",
    kind: 34550,
    createdAt: Math.floor(Date.now() / 1000),
    name: "Test Community",
    pubkey: "test-pubkey-123",
    d: "test-d-identifier-456",
    description: "This is a fantastic community for testing purposes.",
    image: "https://example.com/test-image.jpg",
    moderators: [],
    relays: {
      approvals: [],
      requests: [],
      metadata: [],
      all: [],
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders community information correctly", () => {
    render(<CommunityCard community={mockCommunity} />);

    expect(screen.getByText("Community")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /Test Community/i })
    ).toBeInTheDocument();
    expect(
      screen.getByText("This is a fantastic community for testing purposes.")
    ).toBeInTheDocument();

    const image = screen.getByRole("img", { name: /Test Community/i });
    expect(image).toBeInTheDocument();
    expect(image).toHaveAttribute("src", mockCommunity.image);

    expect(mockedSanitizeUrl).toHaveBeenCalledWith(mockCommunity.image);
  });

  it('navigates to the correct community page on "Visit" button click', () => {
    const mockNaddr = "naddr1mockencodedstring";
    mockedNip19.naddrEncode.mockReturnValue(mockNaddr);

    render(<CommunityCard community={mockCommunity} />);

    const visitButton = screen.getByRole("button", { name: /visit/i });
    expect(visitButton).toBeInTheDocument();

    fireEvent.click(visitButton);

    expect(mockedNip19.naddrEncode).toHaveBeenCalledWith({
      identifier: mockCommunity.d,
      pubkey: mockCommunity.pubkey,
      kind: 34550,
    });

    expect(mockPush).toHaveBeenCalledWith(`/communities/${mockNaddr}`);
  });
});
