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

const mockUserPubkey = "test_pubkey_123";
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
  });

  test("displays the form after initial data load", async () => {
    renderWithProviders(<UserProfileForm />);
    expect(await screen.findByLabelText("Display name")).toBeInTheDocument();
  });

  test("populates the form with existing profile data, including images", async () => {
    renderWithProviders(<UserProfileForm />, mockProfileData);
    expect(await screen.findByDisplayValue("Test User")).toBeInTheDocument();
    expect(screen.getByDisplayValue("testuser")).toBeInTheDocument();

    const bannerImage = screen.getByAltText("User banner image");
    const profileImage = screen.getByAltText("user profile picture");
    expect(bannerImage).toHaveAttribute("src", "https://existing.banner/url");
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
    mockCreateNostrProfileEvent.mockResolvedValue({});
    const user = userEvent.setup();
    const { mockUpdateProfileData } = renderWithProviders(<UserProfileForm />);

    await user.type(await screen.findByLabelText("Display name"), "New Name");
    await user.click(screen.getByRole("button", { name: /Save Profile/i }));

    await waitFor(() => {
      expect(mockCreateNostrProfileEvent).toHaveBeenCalledTimes(1);
      expect(mockUpdateProfileData).toHaveBeenCalledTimes(1);
    });
  });

  test("redirects after submission if isOnboarding is true", async () => {
    mockCreateNostrProfileEvent.mockResolvedValue({});
    const user = userEvent.setup();
    renderWithProviders(<UserProfileForm isOnboarding={true} />);

    await user.type(
      await screen.findByLabelText("Display name"),
      "Onboarding User"
    );
    await user.click(screen.getByRole("button", { name: /Save Profile/i }));

    await waitFor(() => {
      expect(mockRouterPush).toHaveBeenCalledWith("/onboarding/shop-profile");
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

  test("updates banner and profile picture via uploader", async () => {
    const user = userEvent.setup();
    renderWithProviders(<UserProfileForm />);
    await screen.findByLabelText("Display name");

    const uploadBannerBtn = screen.getByTestId("upload-banner-btn");
    await user.click(uploadBannerBtn);
    const newBannerImage = await screen.findByAltText("User banner image");
    expect(newBannerImage).toHaveAttribute("src", "https://new.image/url");

    const uploadPictureBtn = screen.getByTestId("upload-picture-btn");
    await user.click(uploadPictureBtn);
    const newProfileImage = await screen.findByAltText("user profile picture");
    expect(newProfileImage).toHaveAttribute("src", "https://new.image/url");
  });

  test("handles fiat payment option changes correctly", async () => {
    const user = userEvent.setup();
    renderWithProviders(<UserProfileForm />);
    await screen.findByLabelText("Display name");

    const venmoCheckbox = screen.getByLabelText("Venmo");

    await user.click(venmoCheckbox);
    expect(venmoCheckbox).toBeChecked();
    const venmoInput = await screen.findByPlaceholderText(
      "Enter your Venmo username/tag"
    );
    expect(venmoInput).toBeInTheDocument();

    await user.type(venmoInput, "my-venmo-tag");
    expect(venmoInput).toHaveValue("my-venmo-tag");

    await user.click(venmoCheckbox);
    expect(venmoCheckbox).not.toBeChecked();
    expect(
      screen.queryByPlaceholderText("Enter your Venmo username/tag")
    ).not.toBeInTheDocument();
  });

  test("updates payment preference and shopstr donation", async () => {
    mockCreateNostrProfileEvent.mockResolvedValue({});
    const user = userEvent.setup();
    renderWithProviders(<UserProfileForm />);
    await screen.findByLabelText("Display name");

    const paymentSelect = screen.getByRole("button", {
      name: /Payment preference \(for sellers\)/i,
    });
    await user.click(paymentSelect);
    const lightningOption = await screen.findByRole("option", {
      name: "Lightning (Bitcoin)",
    });
    await user.click(lightningOption);

    await waitFor(() => {
      expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    });

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
