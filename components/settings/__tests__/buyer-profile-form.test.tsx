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
    Input: ({ value, onChange, onBlur, placeholder, type = "text" }: any) => (
      <input
        aria-label={placeholder}
        placeholder={placeholder}
        type={type}
        value={value}
        onChange={onChange}
        onBlur={onBlur}
      />
    ),
    Image: ({ src, alt, className }: any) => (
      <img src={src} alt={alt} className={className} />
    ),
  }),
  { virtual: true }
);

jest.mock("@/components/utility-components/file-uploader", () => ({
  FileUploaderButton: jest.fn(() => (
    <button data-testid="upload-picture-btn" />
  )),
}));
const mockFileUploaderButton = FileUploaderButton as jest.Mock;

// nostr-context-provider transitively imports nostr-tools -> @noble/curves (ESM),
// which jest cannot transform under the .pnpm layout. Mock it (re-exporting real
// React contexts so the providers below still work) to avoid loading nostr-tools.
jest.mock("@/components/utility-components/nostr-context-provider", () => {
  const React = require("react");
  return {
    __esModule: true,
    SignerContext: React.createContext({}),
    NostrContext: React.createContext({}),
  };
});

// Downstream uses MilkMarketSpinner (mm-spinner), not the upstream shopstr-spinner.
jest.mock("@/components/utility-components/mm-spinner", () => () => null);
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
    // Downstream renders a plain <label> (not wired via htmlFor), so query by text
    // to wait for the form to render before asserting on the uploader props.
    await screen.findByText("Display name");

    expect(mockFileUploaderButton).toHaveBeenCalledWith(
      expect.objectContaining({
        isIconOnly: true,
        className: AVATARBADGEBUTTONCLASSNAMES,
        containerClassName: "absolute right-[-0.5rem] bottom-[-0.5rem] z-20",
      }),
      undefined
    );
  });
});
