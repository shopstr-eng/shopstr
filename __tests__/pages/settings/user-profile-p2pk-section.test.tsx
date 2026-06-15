import React from "react";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import UserProfilePage from "@/pages/settings/user-profile";
import { CashuWalletContext, ProfileMapContext } from "@/utils/context/context";
import {
  SignerContext,
  NostrContext,
} from "@/components/utility-components/nostr-context-provider";
import { isP2pkEscrowFeatureEnabled } from "@/utils/cashu/p2pk-checkout";

// ── Module mocks ──────────────────────────────────────────────────────────────

jest.mock("@/utils/cashu/p2pk-checkout", () => ({
  isP2pkEscrowFeatureEnabled: jest.fn().mockReturnValue(false),
  normalizeCashuPubkey: jest.fn().mockReturnValue(null),
}));

jest.mock("next/router", () => ({ useRouter: () => ({ push: jest.fn() }) }));

jest.mock("nostr-tools", () => ({
  nip19: { decode: jest.fn(), encode: jest.fn() },
}));

jest.mock(
  "@heroui/react",
  () => {
    const React = require("react");
    return {
      Button: ({ children, onClick, type, isLoading }: any) =>
        React.createElement(
          "button",
          { onClick, type, disabled: !!isLoading },
          children
        ),
      Textarea: ({ label, value, onChange, onBlur }: any) =>
        React.createElement("textarea", {
          "aria-label": label,
          value: value ?? "",
          onChange,
          onBlur,
        }),
      Input: ({ label, value, onChange, onBlur, type = "text" }: any) =>
        React.createElement("input", {
          "aria-label": label,
          type,
          value: value ?? "",
          onChange,
          onBlur,
        }),
      Image: ({ src, alt }: any) => React.createElement("img", { src, alt }),
      Select: ({ label, children }: any) =>
        React.createElement("select", { "aria-label": label }, children),
      SelectItem: ({ children }: any) =>
        React.createElement("option", null, children),
    };
  },
  { virtual: true }
);

jest.mock("@heroicons/react/24/outline", () => ({
  CheckIcon: () => null,
  ClipboardIcon: () => null,
  EyeSlashIcon: () => null,
  EyeIcon: () => null,
}));

jest.mock("@/utils/nostr/nostr-helper-functions", () => ({
  createNostrProfileEvent: jest.fn(),
  getLocalUserProfileKey: (pubkey: string) => `shopstr:user-profile:${pubkey}`,
  parseLocalProfileFallback: jest.fn().mockReturnValue(null),
  isProfileContentPopulated: jest.fn().mockReturnValue(false),
}));

jest.mock("@/utils/nostr/signers/nostr-nsec-signer", () => ({
  NostrNSecSigner: jest.fn(),
}));

jest.mock("@/components/utility-components/file-uploader", () => ({
  FileUploaderButton: ({ children }: any) =>
    React.createElement("button", { type: "button" }, children),
}));

jest.mock("@/components/utility-components/shopstr-spinner", () => ({
  __esModule: true,
  default: () => React.createElement("div", { "data-testid": "spinner" }),
}));

jest.mock("@/components/utility-components/protected-route", () => ({
  __esModule: true,
  default: ({ children }: any) =>
    React.createElement(React.Fragment, null, children),
}));

jest.mock("@/components/settings/settings-bread-crumbs", () => ({
  SettingsBreadCrumbs: () => null,
}));

// ── Typed mock handle ─────────────────────────────────────────────────────────

const mockIsP2pkEscrowFeatureEnabled = isP2pkEscrowFeatureEnabled as jest.Mock;

// ── Render helper ─────────────────────────────────────────────────────────────

function renderUserProfilePage() {
  const profileData = new Map<string, any>();
  profileData.set("test_pubkey", { content: {}, created_at: 0 });

  return render(
    <NostrContext.Provider value={{ nostr: {} } as any}>
      <SignerContext.Provider
        value={
          {
            pubkey: "test_pubkey",
            isLoggedIn: true,
            setPubkey: jest.fn(),
          } as any
        }
      >
        <CashuWalletContext.Provider
          value={
            {
              cashuPubkey: undefined,
              cashuPrivkey: undefined,
              proofEvents: [],
              cashuMints: [],
              cashuProofs: [],
              isLoading: false,
            } as any
          }
        >
          <ProfileMapContext.Provider
            value={{
              profileData,
              isLoading: false,
              updateProfileData: jest.fn(),
            }}
          >
            <UserProfilePage />
          </ProfileMapContext.Provider>
        </CashuWalletContext.Provider>
      </SignerContext.Provider>
    </NostrContext.Provider>
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("UserProfile page — P2PK seller toggle feature flag", () => {
  beforeEach(() => {
    mockIsP2pkEscrowFeatureEnabled.mockReturnValue(false);
  });

  it("hides the seller escrow section when NEXT_PUBLIC_P2PK_ESCROW_ENABLED is off", () => {
    renderUserProfilePage();
    expect(
      screen.queryByText(/P2PK escrow \(for your shop\)/i)
    ).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText(/Enable P2PK escrow on my listings/i)
    ).not.toBeInTheDocument();
  });

  it("shows the seller escrow section when NEXT_PUBLIC_P2PK_ESCROW_ENABLED is on", () => {
    mockIsP2pkEscrowFeatureEnabled.mockReturnValue(true);
    renderUserProfilePage();
    expect(
      screen.getByText(/P2PK escrow \(for your shop\)/i)
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText(/Enable P2PK escrow on my listings/i)
    ).toBeInTheDocument();
  });

  it("always shows the buyer reclaim keys section regardless of the flag", () => {
    renderUserProfilePage();
    expect(
      screen.getByText(/Escrow reclaim keys \(when you buy\)/i)
    ).toBeInTheDocument();
  });
});
