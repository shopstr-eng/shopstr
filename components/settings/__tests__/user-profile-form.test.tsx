import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";

import UserProfileForm from "../user-profile-form";
import { ProfileMapContext } from "@/utils/context/context";
import {
  SignerContext,
  NostrContext,
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
  Select: ({ label, selectedKeys, onChange, onBlur, children }: any) => (
    <label>
      {label}
      <select
        aria-label={label}
        value={selectedKeys?.[0] ?? ""}
        onChange={onChange}
        onBlur={onBlur}
      >
        {children}
      </select>
    </label>
  ),
  SelectItem: ({ children, value, ...props }: any) => {
    const optionLabel = Array.isArray(children) ? children.join("") : children;
    const optionValue =
      value ??
      (typeof optionLabel === "string" && optionLabel.includes("Lightning")
        ? "lightning"
        : "ecash");

    return (
      <option value={optionValue} {...props}>
        {children}
      </option>
    );
  },
  Tooltip: ({ children }: any) => <>{children}</>,
}), { virtual: true });

jest.mock("@/utils/nostr/nostr-helper-functions", () => {
  const actual = jest.requireActual("@/utils/nostr/nostr-helper-functions");
  return {
    ...actual,
    createNostrProfileEvent: jest.fn(),
  };
});
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

const mockUserPubkey = "test_pubkey_123";
const mockSavedProfileEvent = {
  id: "profile-event-1",
  pubkey: mockUserPubkey,
  created_at: 12345,
  kind: 0,
  tags: [],
  content: "{}",
  sig: "sig",
};
const mockProfileData = new Map([
  [
    mockUserPubkey,
    {
      pubkey: mockUserPubkey,
      content: {
        display_name: "Test User",
        name: "testuser",
        about: "About me.",
        banner: "https://existing.banner/url",
        picture: "https://existing.picture/url",
      },
      created_at: 0,
    },
  ],
]);

const renderWithProviders = (
  component: React.ReactElement,
  profileData = new Map(),
  pubkey: string | undefined = mockUserPubkey
) => {
  const mockUpdateProfileData = jest.fn();
  render(
    <NostrContext.Provider value={{ nostr: {} as any }}>
      <SignerContext.Provider value={{ signer: {} as any, pubkey }}>
        <ProfileMapContext.Provider
          value={{
            profileData,
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

describe("UserProfileForm", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
  });

  test("displays the form after initial data load", async () => {
    renderWithProviders(<UserProfileForm />);
    expect(await screen.findByLabelText("Display name")).toBeInTheDocument();
  });

  test("populates the form with existing profile data, including images", async () => {
    renderWithProviders(<UserProfileForm />, mockProfileData);
    expect(await screen.findByDisplayValue("Test User")).toBeInTheDocument();
    expect(screen.getByDisplayValue("testuser")).toBeInTheDocument();

    const profileImage = screen.getByAltText("user profile picture");
    expect(profileImage).toHaveAttribute("src", "https://existing.picture/url");
  });

  test("does not fetch profile if userPubkey is missing", async () => {
    renderWithProviders(<UserProfileForm />, new Map(), undefined);
    expect(await screen.findByLabelText("Display name")).toBeInTheDocument();
  });

  test("displays default image when no picture is available", async () => {
    renderWithProviders(<UserProfileForm />, new Map());
    const profileImage = await screen.findByAltText("user profile picture");
    expect(profileImage).toHaveAttribute(
      "src",
      `https://robohash.org/${mockUserPubkey}`
    );
  });

  test("submits form data and calls update functions", async () => {
    mockCreateNostrProfileEvent.mockResolvedValue(mockSavedProfileEvent);
    const user = userEvent.setup();
    const { mockUpdateProfileData } = renderWithProviders(<UserProfileForm />);

    await user.type(await screen.findByLabelText("Display name"), "New Name");
    await user.click(screen.getByRole("button", { name: /Save Profile/i }));

    await waitFor(() => {
      expect(mockCreateNostrProfileEvent).toHaveBeenCalledTimes(1);
      expect(mockUpdateProfileData).toHaveBeenCalledWith(
        expect.objectContaining({
          pubkey: mockUserPubkey,
          created_at: mockSavedProfileEvent.created_at,
        })
      );
    });
  });

  test("redirects after submission if isOnboarding is true", async () => {
    mockCreateNostrProfileEvent.mockResolvedValue(mockSavedProfileEvent);
    const user = userEvent.setup();
    renderWithProviders(<UserProfileForm isOnboarding={true} />);

    await user.type(
      await screen.findByLabelText("Display name"),
      "Onboarding User"
    );
    await user.click(screen.getByRole("button", { name: /Save Profile/i }));

    await waitFor(() => {
      expect(mockRouterPush).toHaveBeenCalledWith(
        "/onboarding/wallet?type=seller"
      );
    });
  });

  test("disables the save button during submission", async () => {
    mockCreateNostrProfileEvent.mockReturnValue(new Promise(() => {}));
    const user = userEvent.setup();
    renderWithProviders(<UserProfileForm />);

    const saveButton = screen.getByRole("button", { name: /Save Profile/i });
    await user.click(saveButton);

    await waitFor(() => {
      expect(saveButton).toBeDisabled();
    });
  });

  test("updates the profile picture via uploader", async () => {
    const user = userEvent.setup();
    renderWithProviders(<UserProfileForm />);
    await screen.findByLabelText("Display name");

    const uploadPictureBtn = screen.getByTestId("upload-picture-btn");
    await user.click(uploadPictureBtn);
    const newProfileImage = await screen.findByAltText("user profile picture");
    expect(newProfileImage).toHaveAttribute("src", "https://new.image/url");
  });

  test("updates payment preference and shopstr donation", async () => {
    mockCreateNostrProfileEvent.mockResolvedValue(mockSavedProfileEvent);
    const user = userEvent.setup();
    renderWithProviders(<UserProfileForm />);
    await screen.findByLabelText("Display name");

    const paymentSelect = screen.getByLabelText(
      /Payment preference \(for sellers\)/i
    );
    await user.selectOptions(paymentSelect, "lightning");

    const donationInput = screen.getByLabelText(/Shopstr donation %/);
    await user.clear(donationInput);
    await user.type(donationInput, "5.5");

    await user.click(screen.getByRole("button", { name: /Save Profile/i }));

    await waitFor(() => {
      expect(mockCreateNostrProfileEvent).toHaveBeenCalledWith(
        expect.any(Object),
        expect.any(Object),
        expect.stringContaining('"payment_preference":"lightning"')
      );
      expect(mockCreateNostrProfileEvent).toHaveBeenCalledWith(
        expect.any(Object),
        expect.any(Object),
        expect.stringContaining('"shopstr_donation":"5.5"')
      );
    });
  });
});
