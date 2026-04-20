import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";

import BuyerProfileForm from "../buyer-profile-form";
import { ProfileMapContext } from "@/utils/context/context";
import {
  NostrContext,
  SignerContext,
} from "@/components/utility-components/nostr-context-provider";
import { createNostrProfileEvent } from "@/utils/nostr/nostr-helper-functions";

const mockRouterPush = jest.fn();
jest.mock("next/router", () => ({
  useRouter: jest.fn(() => ({ push: mockRouterPush })),
}));

jest.mock("@heroui/react", () => ({
  Button: ({ children, isDisabled, isLoading, onClick, onKeyDown, type }: any) => (
    <button
      type={type || "button"}
      disabled={isDisabled || isLoading}
      onClick={onClick}
      onKeyDown={onKeyDown}
    >
      {children}
    </button>
  ),
  Input: ({ label, value, onChange, onBlur, type = "text" }: any) => (
    <label>
      {label}
      <input
        aria-label={label}
        value={value}
        onChange={onChange}
        onBlur={onBlur}
        type={type}
      />
    </label>
  ),
  Image: ({ src, alt }: any) => <img src={src} alt={alt} />,
}), { virtual: true });

jest.mock("@/utils/nostr/nostr-helper-functions", () => ({
  createNostrProfileEvent: jest.fn(),
}));
const mockCreateNostrProfileEvent = createNostrProfileEvent as jest.Mock;

jest.mock("@/components/utility-components/file-uploader", () => ({
  FileUploaderButton: jest.fn(
    ({ children, imgCallbackOnUpload, isIconOnly }) => (
      <button
        data-testid={isIconOnly ? "upload-picture-btn" : "upload-banner-btn"}
        onClick={() => imgCallbackOnUpload("https://new.image/url")}
      >
        {children}
      </button>
    )
  ),
}));

jest.mock("@/components/utility-components/shopstr-spinner", () => () => null);

const mockUserPubkey = "buyer_pubkey_123";
const mockSavedProfileEvent = {
  id: "buyer-profile-event-1",
  pubkey: mockUserPubkey,
  created_at: 54321,
  kind: 0,
  tags: [],
  content: "{}",
  sig: "sig",
};

const renderWithProviders = (component: React.ReactElement) => {
  const mockUpdateProfileData = jest.fn();
  render(
    <NostrContext.Provider value={{ nostr: {} as any }}>
      <SignerContext.Provider value={{ signer: {} as any, pubkey: mockUserPubkey }}>
        <ProfileMapContext.Provider
          value={{
            profileData: new Map(),
            updateProfileData: mockUpdateProfileData,
            isLoading: false,
          }}
        >
          {component}
        </ProfileMapContext.Provider>
      </SignerContext.Provider>
    </NostrContext.Provider>
  );

  return { mockUpdateProfileData };
};

describe("BuyerProfileForm", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("updates context with the returned created_at and clears save loading state", async () => {
    mockCreateNostrProfileEvent.mockResolvedValue(mockSavedProfileEvent);
    const user = userEvent.setup();
    const { mockUpdateProfileData } = renderWithProviders(<BuyerProfileForm />);

    await user.type(await screen.findByLabelText("Display name"), "Buyer Name");
    const saveButton = screen.getByRole("button", { name: /Save Profile/i });
    await user.click(saveButton);

    await waitFor(() => {
      expect(mockUpdateProfileData).toHaveBeenCalledWith(
        expect.objectContaining({
          pubkey: mockUserPubkey,
          created_at: mockSavedProfileEvent.created_at,
        })
      );
      expect(saveButton).not.toBeDisabled();
      expect(screen.getByRole("button", { name: /Saved!/i })).toBeInTheDocument();
    });
  });
});
