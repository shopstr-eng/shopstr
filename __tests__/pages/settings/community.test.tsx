import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import CommunityManagementPage from "@/pages/settings/community";
import { CommunityContext } from "@/utils/context/context";
import {
  NostrContext,
  SignerContext,
} from "@/components/utility-components/nostr-context-provider";
import { deleteEvent } from "@/utils/nostr/nostr-helper-functions";
import type { Community } from "@/utils/types/types";

jest.mock("@heroui/react", () => {
  const React = require("react");
  return {
    Card: ({ children }: any) => React.createElement("div", null, children),
    CardBody: ({ children }: any) => React.createElement("div", null, children),
    CardHeader: ({ children }: any) =>
      React.createElement("div", null, children),
    Divider: () => React.createElement("hr"),
    Spinner: ({ label }: any) => React.createElement("div", null, label),
    Button: ({ children, onClick }: any) =>
      React.createElement("button", { onClick }, children),
  };
});

jest.mock(
  "@/components/utility-components/protected-route",
  () =>
    function MockProtectedRoute({ children }: { children: React.ReactNode }) {
      return <>{children}</>;
    }
);

jest.mock("@/components/settings/settings-bread-crumbs", () => ({
  SettingsBreadCrumbs: () => null,
}));

jest.mock("@/components/communities/CreateCommunityForm", () => () => null);

jest.mock("@/utils/nostr/community", () => ({
  createOrUpdateCommunity: jest.fn(),
}));

jest.mock("@/utils/nostr/nostr-helper-functions", () => ({
  deleteEvent: jest.fn(),
  finalizeAndSendNostrEvent: jest.fn(),
}));

const OWNER_PUBKEY = "a".repeat(64);
const COMMUNITY_KIND = 34550;

const makeCommunity = (overrides: Partial<Community> = {}): Community => ({
  id: "community-event-id",
  kind: COMMUNITY_KIND,
  pubkey: OWNER_PUBKEY,
  createdAt: 1700000000,
  d: "coffee-lovers",
  name: "Coffee Lovers",
  description: "A place for coffee fans",
  image: "https://example.com/coffee.png",
  moderators: [OWNER_PUBKEY],
  relays: { approvals: [], requests: [], metadata: [], all: [] },
  ...overrides,
});

const signer = { sign: jest.fn() };
const nostr = { fetch: jest.fn() };

const renderPage = (communities: Community[]) =>
  render(
    <SignerContext.Provider value={{ signer, pubkey: OWNER_PUBKEY } as any}>
      <NostrContext.Provider value={{ nostr } as any}>
        <CommunityContext.Provider
          value={
            {
              communities: new Map(communities.map((c) => [c.id, c])),
              posts: new Map(),
              isLoading: false,
              addCommunity: jest.fn(),
            } as any
          }
        >
          <CommunityManagementPage />
        </CommunityContext.Provider>
      </NostrContext.Provider>
    </SignerContext.Provider>
  );

describe("CommunityManagementPage deletion", () => {
  let confirmSpy: jest.SpyInstance;
  let alertSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.mocked(deleteEvent).mockReset();
    jest.mocked(deleteEvent).mockResolvedValue(undefined);
    confirmSpy = jest.spyOn(window, "confirm").mockReturnValue(true);
    alertSpy = jest.spyOn(window, "alert").mockImplementation(() => {});
  });

  afterEach(() => {
    confirmSpy.mockRestore();
    alertSpy.mockRestore();
  });

  it("requests deletion by event id, kind and address", async () => {
    renderPage([makeCommunity()]);

    fireEvent.click(await screen.findByRole("button", { name: "Delete" }));

    await waitFor(() => expect(deleteEvent).toHaveBeenCalledTimes(1));
    expect(deleteEvent).toHaveBeenCalledWith(
      nostr,
      signer,
      ["community-event-id"],
      COMMUNITY_KIND,
      [`${COMMUNITY_KIND}:${OWNER_PUBKEY}:coffee-lovers`]
    );
  });

  it("targets the community whose Delete button was clicked", async () => {
    renderPage([
      makeCommunity(),
      makeCommunity({
        id: "second-event-id",
        d: "tea-drinkers",
        name: "Tea Drinkers",
      }),
    ]);

    const deleteButtons = await screen.findAllByRole("button", {
      name: "Delete",
    });
    expect(deleteButtons).toHaveLength(2);
    fireEvent.click(deleteButtons[1]!);

    await waitFor(() => expect(deleteEvent).toHaveBeenCalledTimes(1));
    expect(deleteEvent).toHaveBeenCalledWith(
      nostr,
      signer,
      ["second-event-id"],
      COMMUNITY_KIND,
      [`${COMMUNITY_KIND}:${OWNER_PUBKEY}:tea-drinkers`]
    );
  });

  it("removes the community from the list after a successful request", async () => {
    renderPage([makeCommunity()]);

    fireEvent.click(await screen.findByRole("button", { name: "Delete" }));

    await waitFor(() =>
      expect(screen.queryByText("Coffee Lovers")).not.toBeInTheDocument()
    );
    expect(alertSpy).toHaveBeenCalledWith(
      expect.stringContaining("Community deletion request sent")
    );
  });

  it("does nothing when the user cancels the confirmation", async () => {
    confirmSpy.mockReturnValue(false);
    renderPage([makeCommunity()]);

    fireEvent.click(await screen.findByRole("button", { name: "Delete" }));

    expect(deleteEvent).not.toHaveBeenCalled();
    expect(screen.getByText("Coffee Lovers")).toBeInTheDocument();
  });

  it("keeps the community listed and reports failure when deletion fails", async () => {
    const consoleError = jest
      .spyOn(console, "error")
      .mockImplementation(() => {});
    jest.mocked(deleteEvent).mockRejectedValue(new Error("relay down"));
    renderPage([makeCommunity()]);

    fireEvent.click(await screen.findByRole("button", { name: "Delete" }));

    await waitFor(() =>
      expect(alertSpy).toHaveBeenCalledWith("Failed to delete community.")
    );
    expect(screen.getByText("Coffee Lovers")).toBeInTheDocument();
    consoleError.mockRestore();
  });
});
