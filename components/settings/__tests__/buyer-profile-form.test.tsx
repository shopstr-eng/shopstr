import React from "react";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";

import BuyerProfileForm from "../buyer-profile-form";
import { ProfileMapContext } from "@/utils/context/context";
import {
  NostrContext,
  SignerContext,
} from "@/components/utility-components/nostr-context-provider";
import { FileUploaderButton } from "@/components/utility-components/file-uploader";
import { AVATARBADGEBUTTONCLASSNAMES } from "@/utils/STATIC-VARIABLES";

jest.mock("next/router", () => ({
  useRouter: jest.fn(() => ({ push: jest.fn() })),
}));

jest.mock(
  "@heroui/react",
  () => ({
    Button: ({ children, type, onClick, onKeyDown }: any) => (
      <button type={type || "button"} onClick={onClick} onKeyDown={onKeyDown}>
        {children}
      </button>
    ),
    Input: ({ label, value, onChange, onBlur, type = "text" }: any) => (
      <label>
        {label}
        <input
          aria-label={label}
          type={type}
          value={value}
          onChange={onChange}
          onBlur={onBlur}
        />
      </label>
    ),
    Image: ({ src, alt, className }: any) => (
      <img src={src} alt={alt} className={className} />
    ),
  }),
  { virtual: true }
);

jest.mock("@/components/utility-components/file-uploader", () => ({
  FileUploaderButton: jest.fn(() => <button data-testid="upload-picture-btn" />),
}));
const mockFileUploaderButton = FileUploaderButton as jest.Mock;

jest.mock("@/components/utility-components/shopstr-spinner", () => () => null);
jest.mock("@/utils/nostr/nostr-helper-functions", () => ({
  createNostrProfileEvent: jest.fn(),
}));

const renderWithProviders = (component: React.ReactElement) => {
  return render(
    <NostrContext.Provider value={{ nostr: {} as any }}>
      <SignerContext.Provider
        value={{ signer: {} as any, pubkey: "buyer_pubkey_123" }}
      >
        <ProfileMapContext.Provider
          value={{
            profileData: new Map(),
            updateProfileData: jest.fn(),
            isLoading: false,
          }}
        >
          {component}
        </ProfileMapContext.Provider>
      </SignerContext.Provider>
    </NostrContext.Provider>
  );
};

describe("BuyerProfileForm", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("passes anchored badge props to the avatar uploader", async () => {
    renderWithProviders(<BuyerProfileForm />);
    await screen.findByLabelText("Display name");

    expect(mockFileUploaderButton).toHaveBeenCalledWith(
      expect.objectContaining({
        isIconOnly: true,
        className: AVATARBADGEBUTTONCLASSNAMES,
        containerClassName:
          "absolute right-[-0.5rem] bottom-[-0.5rem] z-20",
      }),
      {}
    );
  });
});
