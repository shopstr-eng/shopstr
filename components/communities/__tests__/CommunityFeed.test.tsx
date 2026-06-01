import {
  render,
  screen,
  fireEvent,
  waitFor,
  within,
} from "@testing-library/react";
import "@testing-library/jest-dom";
import CommunityFeed from "../CommunityFeed";
import {
  NostrContext,
  SignerContext,
} from "../../utility-components/nostr-context-provider";
import * as fetchService from "@/utils/nostr/fetch-service";
import * as nostrHelper from "@/utils/nostr/nostr-helper-functions";
import { Community, CommunityPost, NostrEvent } from "@/utils/types/types";

jest.mock("@/utils/nostr/fetch-service");
jest.mock("@/utils/nostr/nostr-helper-functions");
jest.mock("@braintree/sanitize-url", () => ({
  sanitizeUrl: jest.fn((url) => url),
}));
jest.mock("../../utility-components/profile/profile-dropdown", () => ({
  ProfileWithDropdown: ({ pubkey }: { pubkey: string }) => (
    <div>Profile: {pubkey.slice(0, 8)}</div>
  ),
}));

const mockedFetchService = fetchService as jest.Mocked<typeof fetchService>;
const mockedNostrHelper = nostrHelper as jest.Mocked<typeof nostrHelper>;
const alertSpy = jest.spyOn(window, "alert").mockImplementation(() => {});
const consoleErrorSpy = jest
  .spyOn(console, "error")
  .mockImplementation(() => {});

const regularUserPubkey = "user_pubkey_123";
const moderatorPubkey = "moderator_pubkey_456";
const otherModeratorPubkey = "other_moderator_pubkey_789";

const mockCommunity: Community = {
  id: "community_id_123",
  kind: 10000,
  createdAt: 1600000000,
  name: "Test Community",
  pubkey: "community_owner_pubkey",
  d: "test-community",
  moderators: [moderatorPubkey, otherModeratorPubkey],
  description: "",
  image: "",
  relays: {
    approvals: [],
    requests: [],
    metadata: [],
    all: [],
  },
};

const mockApprovedPost: CommunityPost = {
  id: "approved_post_1",
  pubkey: "author_pubkey_1",
  content:
    "This is an approved post. It has an image https://example.com/image.jpeg a video https://example.com/video.mp4 a youtube https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  tags: [["image", "https://example.com/tagged.png"]],
  created_at: 1700000000,
  kind: 1,
  sig: "",
  approved: true,
  approvalEventId: "approval_event_1",
  approvedBy: moderatorPubkey,
};

const mockApprovedByOtherMod: CommunityPost = {
  id: "approved_post_2",
  pubkey: "author_pubkey_4",
  content: "This was approved by another mod.",
  tags: [],
  created_at: 1690000000,
  kind: 1,
  sig: "",
  approved: true,
  approvalEventId: "approval_event_2",
  approvedBy: otherModeratorPubkey,
};

const mockPendingPost: NostrEvent = {
  id: "pending_post_1",
  pubkey: "author_pubkey_2",
  content: "This post is pending approval.",
  tags: [],
  created_at: 1700000001,
  kind: 1,
  sig: "",
};

const mockReplyPost: CommunityPost = {
  id: "reply_post_1",
  pubkey: "author_pubkey_3",
  content: "This is an approved reply.",
  tags: [["e", mockApprovedPost.id]],
  created_at: 1700000002,
  kind: 1,
  sig: "",
  approved: true,
  approvalEventId: "approval_event_3",
  approvedBy: moderatorPubkey,
};

const mockPendingReply: NostrEvent = {
  id: "pending_reply_1",
  pubkey: "author_pubkey_5",
  content: "This is a pending reply.",
  tags: [["e", mockApprovedPost.id]],
  created_at: 1700000003,
  kind: 1,
  sig: "",
};

describe("CommunityFeed", () => {
  const renderComponent = (
    pubkey: string | undefined,
    approvedPosts: CommunityPost[] = [
      mockApprovedPost,
      mockReplyPost,
      mockApprovedByOtherMod,
    ],
    pendingPosts: NostrEvent[] = [mockPendingPost, mockPendingReply]
  ) => {
    mockedFetchService.fetchCommunityPosts.mockResolvedValue(approvedPosts);
    mockedFetchService.fetchPendingPosts.mockResolvedValue(pendingPosts);

    return render(
      <NostrContext.Provider value={{ nostr: { relays: [] } as any }}>
        <SignerContext.Provider value={{ signer: {} as any, pubkey }}>
          <CommunityFeed community={mockCommunity} />
        </SignerContext.Provider>
      </NostrContext.Provider>
    );
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // --- General Rendering and State Tests ---
  it("shows loading spinner initially and then displays posts", async () => {
    renderComponent(regularUserPubkey);
    expect(screen.getByText("Loading posts...")).toBeInTheDocument();
    expect(
      await screen.findByText(/This is an approved post/i)
    ).toBeInTheDocument();
    expect(screen.queryByText("Loading posts...")).not.toBeInTheDocument();
    expect(
      await screen.findByText("This is an approved reply.")
    ).toBeInTheDocument();
  });

  it("displays a message when there are no posts", async () => {
    renderComponent(regularUserPubkey, [], []);
    expect(
      await screen.findByText("No announcements yet. Check back soon!")
    ).toBeInTheDocument();
  });

  it("renders various types of content correctly", async () => {
    renderComponent(regularUserPubkey);
    await screen.findByText(/This is an approved post/i);

    const image = screen.getByAltText("User content");
    expect(image).toHaveAttribute("src", "https://example.com/image.jpeg");

    const video = document.querySelector("video");
    expect(video).toBeInTheDocument();
    expect(video).toHaveAttribute("src", "https://example.com/video.mp4");

    const iframe = document.querySelector("iframe");
    expect(iframe).toBeInTheDocument();
    expect(iframe).toHaveAttribute(
      "src",
      "https://www.youtube.com/embed/dQw4w9WgXcQ"
    );

    const taggedImage = screen.getByAltText("Tagged media");
    expect(taggedImage).toHaveAttribute(
      "src",
      "https://example.com/tagged.png"
    );
  });

  // --- User Role Tests: Regular User ---
  describe("for a Regular User", () => {
    it("fetches only approved posts and does not show moderator controls", async () => {
      renderComponent(regularUserPubkey);
      await screen.findByText(/This is an approved post/i);

      expect(mockedFetchService.fetchCommunityPosts).toHaveBeenCalledTimes(1);
      expect(mockedFetchService.fetchPendingPosts).not.toHaveBeenCalled();

      expect(
        screen.queryByText("Create an Announcement")
      ).not.toBeInTheDocument();
      expect(screen.queryByText("Approve")).not.toBeInTheDocument();
      expect(screen.queryByText("Pending Approval")).not.toBeInTheDocument();
    });

    it("allows a user to open, type, submit, and cancel a reply", async () => {
      mockedNostrHelper.createCommunityPost.mockResolvedValue({
        id: "new_reply_id",
        content: "This is my new reply!",
        tags: [],
        pubkey: regularUserPubkey,
        created_at: Math.floor(Date.now() / 1000),
        kind: 1,
        sig: "",
      });

      renderComponent(regularUserPubkey);
      const replyButton = (
        await screen.findAllByRole("button", { name: "Reply" })
      )[0];
      fireEvent.click(replyButton!);

      const textarea = await screen.findByPlaceholderText(/Replying to/i);
      expect(textarea).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Cancel" })
      ).toBeInTheDocument();

      fireEvent.change(textarea, {
        target: { value: "This is my new reply!" },
      });
      const submitButton = screen.getByRole("button", {
        name: /Submit Reply/i,
      });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(mockedNostrHelper.createCommunityPost).toHaveBeenCalledWith(
          expect.anything(),
          expect.anything(),
          mockCommunity,
          "This is my new reply!",
          { parentEvent: expect.objectContaining({ id: mockApprovedPost.id }) }
        );
      });

      expect(alertSpy).toHaveBeenCalledWith(
        "Your reply has been submitted for approval. It will appear once a moderator approves it."
      );

      fireEvent.click(replyButton!);
      const cancelButton = await screen.findByRole("button", {
        name: "Cancel",
      });
      fireEvent.click(cancelButton);
      expect(
        screen.queryByPlaceholderText(/Replying to/i)
      ).not.toBeInTheDocument();
    });
  });

  // --- User Role Tests: Moderator ---
  describe("for a Moderator", () => {
    it("fetches both approved and pending posts and shows moderator controls", async () => {
      renderComponent(moderatorPubkey);
      expect(
        await screen.findByText(/This is an approved post/i)
      ).toBeInTheDocument();
      expect(
        await screen.findByText(/This post is pending approval/i)
      ).toBeInTheDocument();

      expect(mockedFetchService.fetchCommunityPosts).toHaveBeenCalledTimes(1);
      expect(mockedFetchService.fetchPendingPosts).toHaveBeenCalledTimes(1);
      expect(screen.getByText("Create an Announcement")).toBeInTheDocument();
      expect(
        screen.getAllByRole("button", { name: "Approve" }).length
      ).toBeGreaterThan(0);
      expect(screen.getAllByText("Pending Approval").length).toBeGreaterThan(0);
    });

    it("allows a moderator to create and submit a new post", async () => {
      mockedNostrHelper.createCommunityPost.mockResolvedValue({
        id: "new_post_id",
        content: "A new announcement!",
        tags: [],
        pubkey: moderatorPubkey,
        created_at: Math.floor(Date.now() / 1000),
        kind: 1,
        sig: "",
      });
      renderComponent(moderatorPubkey);
      await screen.findByText(/This is an approved post/i);

      const textarea = screen.getByPlaceholderText("What's on your mind?");
      const postButton = screen.getByRole("button", { name: "Post" });

      expect(postButton).toBeDisabled();
      fireEvent.change(textarea, { target: { value: "A new announcement!" } });
      expect(postButton).toBeEnabled();
      fireEvent.click(postButton);

      await waitFor(() => {
        expect(mockedNostrHelper.createCommunityPost).toHaveBeenCalledWith(
          expect.anything(),
          expect.anything(),
          mockCommunity,
          "A new announcement!"
        );
      });
      expect(alertSpy).toHaveBeenCalledWith(
        "Your post has been submitted for approval. It will appear once a moderator approves it."
      );
    });

    it("allows a moderator to approve a pending post and a pending reply", async () => {
      mockedNostrHelper.approveCommunityPost.mockResolvedValue({
        id: "new_approval_event",
        pubkey: moderatorPubkey,
      } as any);
      renderComponent(moderatorPubkey);

      // Approve top-level post
      const approveButtons = await screen.findAllByRole("button", {
        name: "Approve",
      });
      fireEvent.click(approveButtons[0]!);

      await waitFor(() => {
        expect(mockedNostrHelper.approveCommunityPost).toHaveBeenCalledWith(
          expect.anything(),
          expect.anything(),
          expect.objectContaining({ id: mockPendingPost.id }),
          mockCommunity
        );
      });

      // Approve reply
      fireEvent.click(approveButtons[1]!);

      await waitFor(() => {
        expect(mockedNostrHelper.approveCommunityPost).toHaveBeenCalledWith(
          expect.anything(),
          expect.anything(),
          expect.objectContaining({ id: mockPendingReply.id }),
          mockCommunity
        );
      });
    });

    it("allows a moderator to retract their own approval", async () => {
      mockedNostrHelper.retractApproval.mockResolvedValue(undefined as any);
      renderComponent(moderatorPubkey);

      const retractButtons = await screen.findAllByRole("button", {
        name: /Retract Approval/i,
      });
      fireEvent.click(retractButtons[0]!);

      await waitFor(() => {
        expect(mockedNostrHelper.retractApproval).toHaveBeenCalledWith(
          expect.anything(),
          expect.anything(),
          mockApprovedPost.approvalEventId,
          expect.any(String)
        );
      });
      await waitFor(() => {
        expect(
          screen.queryByText(/This is an approved post/i)
        ).not.toBeInTheDocument();
      });
    });

    it("does not show retract button for approvals by other moderators", async () => {
      renderComponent(moderatorPubkey);
      const approvedByOtherText = await screen.findByText(
        /This was approved by another mod/i
      );
      const postCard = approvedByOtherText.closest(
        'div[tabindex="-1"]'
      ) as HTMLElement;

      expect(
        within(postCard).queryByRole("button", { name: /Retract Approval/i })
      ).not.toBeInTheDocument();
    });
  });

  describe("Error Handling", () => {
    it("handles failure when creating a post", async () => {
      mockedNostrHelper.createCommunityPost.mockRejectedValue(
        new Error("Post failed")
      );
      renderComponent(moderatorPubkey);

      await screen.findByText(/This is an approved post/i);
      fireEvent.change(screen.getByPlaceholderText("What's on your mind?"), {
        target: { value: "This post will fail" },
      });
      fireEvent.click(screen.getByRole("button", { name: "Post" }));

      await waitFor(() => {
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          "Failed to create post",
          expect.any(Error)
        );
        expect(alertSpy).toHaveBeenCalledWith("Failed to create post.");
      });
    });

    it("handles failure when submitting a reply", async () => {
      mockedNostrHelper.createCommunityPost.mockRejectedValue(
        new Error("Reply failed")
      );
      renderComponent(regularUserPubkey);

      const replyButton = (
        await screen.findAllByRole("button", { name: "Reply" })
      )[0];
      fireEvent.click(replyButton!);
      const textarea = await screen.findByPlaceholderText(/Replying to/i);
      fireEvent.change(textarea, { target: { value: "This reply will fail" } });
      fireEvent.click(screen.getByRole("button", { name: /Submit Reply/i }));

      await waitFor(() => {
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          "Failed to submit reply",
          expect.any(Error)
        );
        expect(alertSpy).toHaveBeenCalledWith("Failed to submit reply.");
      });
    });

    it("handles failure when approving a post", async () => {
      mockedNostrHelper.approveCommunityPost.mockRejectedValue(
        new Error("Approval failed")
      );
      renderComponent(moderatorPubkey);

      const approveButtons = await screen.findAllByRole("button", {
        name: "Approve",
      });
      const approveButton = approveButtons[0];
      fireEvent.click(approveButton!);

      await waitFor(() => {
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          "Failed to approve post",
          expect.any(Error)
        );
        expect(alertSpy).toHaveBeenCalledWith("Failed to approve post.");
      });
    });

    it("handles failure when retracting approval", async () => {
      mockedNostrHelper.retractApproval.mockRejectedValue(
        new Error("Retract failed")
      );
      renderComponent(moderatorPubkey);

      const retractButtons = await screen.findAllByRole("button", {
        name: /Retract Approval/i,
      });
      const retractButton = retractButtons[0];
      fireEvent.click(retractButton!);

      await waitFor(() => {
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          "Failed to retract approval",
          expect.any(Error)
        );
        expect(alertSpy).toHaveBeenCalledWith("Failed to retract approval.");
      });
    });
  });
});
