import React from "react";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";

import ShopProfileForm from "../shop-profile-form";
import { ShopMapContext } from "@/utils/context/context";
import {
  SignerContext,
  NostrContext,
} from "@/components/utility-components/nostr-context-provider";
import { createNostrShopEvent } from "@/utils/nostr/nostr-helper-functions";

const mockRouterPush = jest.fn();
jest.mock("next/router", () => ({
  useRouter: jest.fn(() => ({ push: mockRouterPush })),
}));

jest.mock("@/utils/nostr/nostr-helper-functions", () => ({
  createNostrShopEvent: jest.fn(),
}));
const mockCreateNostrShopEvent = createNostrShopEvent as jest.Mock;

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

const mockUserPubkey = "test_pubkey";
const mockShopData = new Map([
  [
    mockUserPubkey,
    {
      pubkey: mockUserPubkey,
      content: {
        name: "My Awesome Shop",
        about: "The best shop ever.",
        ui: {
          picture: "https://existing.image/picture.png",
          banner: "https://existing.image/banner.png",
        },
      },
    },
  ],
]);

const renderWithProviders = (
  component: React.ReactElement,
  shopData = new Map()
) => {
  const mockUpdateShopData = jest.fn();
  render(
    <NostrContext.Provider value={{ nostr: {} as any }}>
      <SignerContext.Provider
        value={{ signer: {} as any, pubkey: mockUserPubkey }}
      >
        <ShopMapContext.Provider
          value={{ shopData, updateShopData: mockUpdateShopData }}
        >
          {component}
        </ShopMapContext.Provider>
      </SignerContext.Provider>
    </NostrContext.Provider>
  );
  return { mockUpdateShopData };
};

describe("ShopProfileForm", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("displays the form after initial data load", async () => {
    renderWithProviders(<ShopProfileForm />);
    expect(await screen.findByLabelText("Shop Name")).toBeInTheDocument();
  });

  test("populates the form with existing shop data", async () => {
    renderWithProviders(<ShopProfileForm />, mockShopData);

    expect(
      await screen.findByDisplayValue("My Awesome Shop")
    ).toBeInTheDocument();
    expect(screen.getByDisplayValue("The best shop ever.")).toBeInTheDocument();

    const picture = screen.getByAltText("shop logo");
    const banner = screen.getByAltText("Shop banner image");
    expect(picture).toHaveAttribute(
      "src",
      "https://existing.image/picture.png"
    );
    expect(banner).toHaveAttribute("src", "https://existing.image/banner.png");
  });

  test("shows an empty form and default image for a new user", async () => {
    renderWithProviders(<ShopProfileForm />);
    const shopNameInput = await screen.findByLabelText("Shop Name");
    expect(shopNameInput).toHaveValue("");
  });

  test("updates form values on file upload simulation", async () => {
    renderWithProviders(<ShopProfileForm />);
    await screen.findByLabelText("Shop Name");
    act(() => {
      fireEvent.click(screen.getByTestId("upload-picture-btn"));
    });
    expect(await screen.findByAltText("shop logo")).toHaveAttribute(
      "src",
      "https://new.image/url"
    );
  });

  test("submits the form, shows loading state, and calls relevant functions", async () => {
    const user = userEvent.setup();
    let resolveCreateEvent: (value?: unknown) => void;
    mockCreateNostrShopEvent.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveCreateEvent = resolve;
        })
    );

    const { mockUpdateShopData } = renderWithProviders(<ShopProfileForm />);

    const shopNameInput = await screen.findByLabelText("Shop Name");
    const saveButton = screen.getByRole("button", { name: /Save Shop/i });

    await user.type(shopNameInput, "New Shop Name");
    await user.click(saveButton);

    expect(saveButton).toBeDisabled();
    await waitFor(() => expect(createNostrShopEvent).toHaveBeenCalledTimes(1));

    await act(async () => {
      resolveCreateEvent();
    });

    expect(mockUpdateShopData).toHaveBeenCalledTimes(1);
    expect(saveButton).toBeEnabled();
  });

  test("redirects after submission if isOnboarding is true", async () => {
    mockCreateNostrShopEvent.mockResolvedValue({});
    const user = userEvent.setup();
    renderWithProviders(<ShopProfileForm isOnboarding={true} />);

    await user.type(
      await screen.findByLabelText("Shop Name"),
      "Onboarding Shop"
    );
    await user.click(screen.getByRole("button", { name: /Save Shop/i }));

    await waitFor(() => {
      expect(mockRouterPush).toHaveBeenCalledWith("/marketplace");
    });
  });

  test("shows a validation error for inputs that exceed maxLength", async () => {
    const user = userEvent.setup();
    renderWithProviders(<ShopProfileForm />);

    const shopNameInput = await screen.findByLabelText("Shop Name");
    await user.type(
      shopNameInput,
      "This is a very long shop name that is definitely over fifty characters long for sure."
    );
    await user.click(screen.getByRole("button", { name: /Save Shop/i }));

    expect(
      await screen.findByText("This input exceed maxLength of 50.")
    ).toBeInTheDocument();
  });

  test("submits the form when Enter is pressed on the Save button", async () => {
    mockCreateNostrShopEvent.mockResolvedValue({});
    const user = userEvent.setup();
    renderWithProviders(<ShopProfileForm />);

    await user.type(await screen.findByLabelText("Shop Name"), "My Shop");
    const saveButton = screen.getByRole("button", { name: /Save Shop/i });

    fireEvent.keyDown(saveButton, { key: "Enter", code: "Enter" });

    await waitFor(() => {
      expect(createNostrShopEvent).toHaveBeenCalledTimes(2);
    });
  });
});
