import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";

// Downstream has no `components/settings/user-profile-form.tsx`; the user profile
// form lives on the page `pages/settings/user-profile.tsx` (default export
// UserProfilePage, wrapped in ProtectedRoute). We import the page and mock
// ProtectedRoute to render its children directly.
import UserProfileForm from "@/pages/settings/user-profile";
import { ProfileMapContext } from "@/utils/context/context";
import {
  NostrContext,
  SignerContext,
} from "@/components/utility-components/nostr-context-provider";
import { createNostrProfileEvent } from "@/utils/nostr/nostr-helper-functions";
import { FileUploaderButton } from "@/components/utility-components/file-uploader";
import { AVATARBADGEBUTTONCLASSNAMES } from "@/utils/STATIC-VARIABLES";

const mockRouterPush = jest.fn();
jest.mock("next/router", () => ({
  useRouter: jest.fn(() => ({
    push: mockRouterPush,
    pathname: "/settings/user-profile",
  })),
}));

jest.mock("@/components/utility-components/protected-route", () => ({
  __esModule: true,
  default: ({ children }: any) => <>{children}</>,
}));

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

// NostrNSecSigner also pulls in nostr-tools; the page only uses it inside an
// untriggered click handler, so a dummy class is sufficient.
jest.mock("@/utils/nostr/signers/nostr-nsec-signer", () => ({
  __esModule: true,
  NostrNSecSigner: class {},
}));

jest.mock(
  "@heroui/react",
  () => ({
    Button: ({
      children,
      isDisabled,
      isLoading,
      onClick,
      onKeyDown,
      type,
    }: any) => (
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
          type={type}
          value={value}
          onChange={onChange}
          onBlur={onBlur}
        />
      </label>
    ),
    Textarea: ({ label, value, onChange, onBlur }: any) => (
      <label>
        {label}
        <textarea
          aria-label={label}
          value={value}
          onChange={onChange}
          onBlur={onBlur}
        />
      </label>
    ),
    Image: ({ src, alt, className }: any) => (
      <img src={src} alt={alt} className={className} />
    ),
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
      const optionLabel = Array.isArray(children)
        ? children.join("")
        : children;
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
    Breadcrumbs: ({ children }: any) => <nav>{children}</nav>,
    BreadcrumbItem: ({ children }: any) => <span>{children}</span>,
    Divider: () => <hr />,
    Tooltip: ({ children }: any) => <>{children}</>,
  }),
  { virtual: true }
);

jest.mock("@/utils/nostr/nostr-helper-functions", () => ({
  createNostrProfileEvent: jest.fn(),
  getLocalUserProfileKey: (pubkey: string) => `shopstr:user-profile:${pubkey}`,
  parseLocalProfileFallback: (raw: string | null) =>
    raw ? { content: JSON.parse(raw), updatedAt: 0 } : null,
  isProfileContentPopulated: () => true,
}));
const mockCreateNostrProfileEvent = createNostrProfileEvent as jest.Mock;

jest.mock("@/components/utility-components/file-uploader", () => ({
  FileUploaderButton: jest.fn(
    ({ children, imgCallbackOnUpload, isIconOnly }: any) => (
      <button
        data-testid={isIconOnly ? "upload-picture-btn" : "upload-banner-btn"}
        onClick={() => imgCallbackOnUpload("https://new.image/url")}
      >
        {children}
      </button>
    )
  ),
}));
const mockFileUploaderButton = FileUploaderButton as jest.Mock;

// Downstream uses MilkMarketSpinner (mm-spinner), not the upstream shopstr-spinner.
jest.mock("@/components/utility-components/mm-spinner", () => () => null);

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
    localStorage.clear();
  });

  test("passes anchored badge props to the avatar uploader", async () => {
    renderWithProviders(<UserProfileForm />);
    await screen.findByLabelText("Display name");

    expect(mockFileUploaderButton).toHaveBeenCalledWith(
      expect.objectContaining({
        isIconOnly: true,
        className: AVATARBADGEBUTTONCLASSNAMES,
        containerClassName: "absolute right-[-0.5rem] bottom-[-0.5rem] z-20",
      }),
      undefined
    );
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

  // SKIPPED: Upstream's UserProfileForm renders the form even without a pubkey.
  // Downstream's page gates rendering on `!userPubkey` (isFetchingProfile -> true)
  // and shows MilkMarketSpinner instead of the form, so the label never appears.
  // test("does not fetch profile if userPubkey is missing", ...)

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
      // Downstream stamps created_at via Date.now() rather than echoing the
      // saved event's created_at, so assert on the pubkey + a numeric timestamp.
      expect(mockUpdateProfileData).toHaveBeenCalledWith(
        expect.objectContaining({
          pubkey: mockUserPubkey,
          created_at: expect.any(Number),
        })
      );
    });
  });

  // SKIPPED: Downstream's user-profile page has no `isOnboarding` prop and never
  // calls router.push on submit (onboarding redirect is handled elsewhere).
  // test("redirects after submission if isOnboarding is true", ...)

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

  test("updates payment preference and donation", async () => {
    mockCreateNostrProfileEvent.mockResolvedValue({});
    const user = userEvent.setup();
    renderWithProviders(<UserProfileForm />);
    await screen.findByLabelText("Display name");

    // Downstream labels: "Bitcoin payment preference" and "Shopstr donation (%)".
    const paymentSelect = screen.getByLabelText(/Bitcoin payment preference/i);
    await user.selectOptions(paymentSelect, "lightning");

    const donationInput = screen.getByLabelText(/Shopstr donation/i);
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
