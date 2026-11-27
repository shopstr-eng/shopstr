import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import CommunityManagementPage from "@/pages/settings/community";
import { CommunityContext } from "@/utils/context/context";
import {
  NostrContext,
  SignerContext,
} from "@/components/utility-components/nostr-context-provider";
import { finalizeAndSendNostrEvent } from "@/utils/nostr/nostr-helper-functions";
import { cacheEventToDatabase } from "@/utils/db/db-client";

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

jest.mock(
  "@/components/communities/CreateCommunityForm",
  () =>
    function MockCreateCommunityForm({
      onSave,
    }: {
      onSave: (data: Record<string, string>) => void;
    }) {
      return (
        <button
          onClick={() =>
            onSave({
              d: "coffee-lovers",
              name: "Coffee Lovers",
              description: "A place for coffee fans",
              image: "https://example.com/coffee.png",
            })
          }
        >
          Submit community
        </button>
      );
    }
);

// The real createOrUpdateCommunity runs; only its signing and caching
// dependencies are mocked.
jest.mock("@/utils/nostr/nostr-helper-functions", () => ({
  deleteEvent: jest.fn(),
  finalizeAndSendNostrEvent: jest.fn(),
}));

jest.mock("@/utils/db/db-client", () => ({
  cacheEventToDatabase: jest.fn(),
}));

const OWNER_PUBKEY = "a".repeat(64);
const signer = { sign: jest.fn() };
const nostr = { fetch: jest.fn() };

const submitNewCommunity = () => {
  render(
    <SignerContext.Provider value={{ signer, pubkey: OWNER_PUBKEY } as any}>
      <NostrContext.Provider value={{ nostr } as any}>
        <CommunityContext.Provider
          value={
            {
              communities: new Map(),
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
  fireEvent.click(screen.getByRole("button", { name: "Create New" }));
  fireEvent.click(screen.getByRole("button", { name: "Submit community" }));
};

describe("CommunityManagementPage save", () => {
  let alertSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.mocked(finalizeAndSendNostrEvent).mockReset();
    jest
      .mocked(finalizeAndSendNostrEvent)
      .mockResolvedValue({ id: "signed-event-id" } as any);
    jest.mocked(cacheEventToDatabase).mockReset();
    jest.mocked(cacheEventToDatabase).mockResolvedValue(undefined);
    alertSpy = jest.spyOn(window, "alert").mockImplementation(() => {});
  });

  afterEach(() => {
    alertSpy.mockRestore();
  });

  it("signs and publishes the community once", async () => {
    submitNewCommunity();

    await waitFor(() =>
      expect(alertSpy).toHaveBeenCalledWith(
        expect.stringContaining("Community saved!")
      )
    );
    expect(finalizeAndSendNostrEvent).toHaveBeenCalledTimes(1);
    expect(finalizeAndSendNostrEvent).toHaveBeenCalledWith(
      signer,
      nostr,
      expect.objectContaining({ kind: 34550 })
    );
  });

  it("returns to the community list after saving", async () => {
    submitNewCommunity();

    expect(
      await screen.findByRole("button", { name: "Create New" })
    ).toBeInTheDocument();
  });

  it("reports failure and keeps the form open when publishing fails", async () => {
    const consoleError = jest
      .spyOn(console, "error")
      .mockImplementation(() => {});
    jest
      .mocked(finalizeAndSendNostrEvent)
      .mockRejectedValue(new Error("relay down"));

    submitNewCommunity();

    await waitFor(() =>
      expect(alertSpy).toHaveBeenCalledWith("Failed to save community.")
    );
    expect(
      screen.getByRole("button", { name: "Submit community" })
    ).toBeInTheDocument();
    consoleError.mockRestore();
  });
});
