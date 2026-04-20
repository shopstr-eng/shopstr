import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import ProductForm from "../product-form";
import { ProductContext, ProfileMapContext } from "@/utils/context/context";
import {
  NostrContext,
  SignerContext,
} from "@/components/utility-components/nostr-context-provider";
import {
  PostListing,
  finalizeAndSendNostrEvent,
} from "@/utils/nostr/nostr-helper-functions";

jest.mock("next/router", () => ({
  useRouter: () => ({
    push: jest.fn(),
  }),
}));

jest.mock("next-themes", () => ({
  useTheme: () => ({ theme: "light" }),
}));

jest.mock("@/utils/nostr/nostr-helper-functions", () => ({
  PostListing: jest.fn(),
  finalizeAndSendNostrEvent: jest.fn(),
  getLocalStorageData: jest.fn(() => ({
    relays: ["wss://relay.example"],
  })),
}));

jest.mock("@/components/utility-components/file-uploader", () => ({
  FileUploaderButton: ({
    children,
    imgCallbackOnUpload,
    isPlaceholder,
  }: {
    children?: React.ReactNode;
    imgCallbackOnUpload: (imgUrl: string) => void;
    isPlaceholder?: boolean;
  }) => (
    <button
      type="button"
      aria-label={isPlaceholder ? "Upload placeholder image" : "Upload image"}
      onClick={() => imgCallbackOnUpload("https://cdn.example/product.webp")}
    >
      {children || "Upload Images"}
    </button>
  ),
}));

jest.mock("@/components/utility-components/dropdowns/location-dropdown", () => ({
  __esModule: true,
  default: ({
    label,
    value,
    onChange,
    onBlur,
    errorMessage,
    isInvalid,
  }: {
    label?: string;
    value?: string;
    onChange?: (event: React.ChangeEvent<HTMLInputElement>) => void;
    onBlur?: () => void;
    errorMessage?: string;
    isInvalid?: boolean;
  }) => (
    <label>
      {label || "Location"}
      <input
        aria-invalid={isInvalid ? "true" : "false"}
        value={value || ""}
        onChange={onChange}
        onBlur={onBlur}
      />
      {isInvalid && errorMessage ? <span>{errorMessage}</span> : null}
    </label>
  ),
}));

jest.mock(
  "@/components/utility-components/dropdowns/confirm-action-dropdown",
  () => ({
    __esModule: true,
    default: ({
      children,
      buttonLabel,
      onConfirm,
    }: {
      children: React.ReactNode;
      buttonLabel: string;
      onConfirm: () => void;
    }) => (
      <div>
        {children}
        <button type="button" onClick={onConfirm}>
          {buttonLabel}
        </button>
      </div>
    ),
  })
);

jest.mock("@nextui-org/react", () => {
  const inputId = (label?: string, placeholder?: string) =>
    (label || placeholder || "field").replace(/\s+/g, "-").toLowerCase();

  return {
    Modal: ({ children, isOpen }: { children: React.ReactNode; isOpen: boolean }) =>
      isOpen ? <div role="dialog">{children}</div> : null,
    ModalContent: ({
      children,
    }: {
      children: React.ReactNode | (() => React.ReactNode);
    }) => (
      <div>{typeof children === "function" ? children() : children}</div>
    ),
    ModalHeader: ({ children }: { children: React.ReactNode }) => (
      <h2>{children}</h2>
    ),
    ModalBody: ({ children }: { children: React.ReactNode }) => (
      <div>{children}</div>
    ),
    ModalFooter: ({ children }: { children: React.ReactNode }) => (
      <div>{children}</div>
    ),
    Button: ({
      children,
      type = "button",
      onClick,
      onKeyDown,
      isDisabled,
      disabled,
      isLoading,
      "aria-label": ariaLabel,
    }: {
      children?: React.ReactNode;
      type?: "button" | "submit" | "reset";
      onClick?: React.MouseEventHandler<HTMLButtonElement>;
      onKeyDown?: React.KeyboardEventHandler<HTMLButtonElement>;
      isDisabled?: boolean;
      disabled?: boolean;
      isLoading?: boolean;
      "aria-label"?: string;
    }) => (
      <button
        type={type}
        aria-label={ariaLabel}
        disabled={Boolean(isDisabled || disabled || isLoading)}
        onClick={onClick}
        onKeyDown={onKeyDown}
      >
        {children}
      </button>
    ),
    Input: ({
      label,
      placeholder,
      value,
      onChange,
      onBlur,
      type = "text",
      errorMessage,
      isInvalid,
      endContent,
      "aria-label": ariaLabel,
    }: {
      label?: string;
      placeholder?: string;
      value?: string | number;
      onChange?: React.ChangeEventHandler<HTMLInputElement>;
      onBlur?: React.FocusEventHandler<HTMLInputElement>;
      type?: string;
      errorMessage?: string;
      isInvalid?: boolean;
      endContent?: React.ReactNode;
      "aria-label"?: string;
    }) => {
      const id = inputId(label, placeholder);
      return (
        <div>
          <label htmlFor={id}>{label || placeholder || ariaLabel}</label>
          <input
            id={id}
            aria-label={ariaLabel}
            aria-invalid={isInvalid ? "true" : "false"}
            placeholder={placeholder}
            type={type}
            value={value ?? ""}
            onChange={onChange}
            onBlur={onBlur}
          />
          {endContent}
          {isInvalid && errorMessage ? <span>{errorMessage}</span> : null}
        </div>
      );
    },
    Textarea: ({
      label,
      value,
      onChange,
      onBlur,
      errorMessage,
      isInvalid,
    }: {
      label?: string;
      value?: string;
      onChange?: React.ChangeEventHandler<HTMLTextAreaElement>;
      onBlur?: React.FocusEventHandler<HTMLTextAreaElement>;
      errorMessage?: string;
      isInvalid?: boolean;
    }) => {
      const id = inputId(label);
      return (
        <div>
          <label htmlFor={id}>{label}</label>
          <textarea
            id={id}
            aria-invalid={isInvalid ? "true" : "false"}
            value={value || ""}
            onChange={onChange}
            onBlur={onBlur}
          />
          {isInvalid && errorMessage ? <span>{errorMessage}</span> : null}
        </div>
      );
    },
    Select: ({
      label,
      children,
      value,
      selectedKeys,
      onChange,
      onBlur,
      errorMessage,
      isInvalid,
      "aria-label": ariaLabel,
    }: {
      label?: string;
      children?: React.ReactNode;
      value?: string;
      selectedKeys?: string[];
      onChange?: React.ChangeEventHandler<HTMLSelectElement>;
      onBlur?: React.FocusEventHandler<HTMLSelectElement>;
      errorMessage?: string;
      isInvalid?: boolean;
      "aria-label"?: string;
    }) => {
      const id = inputId(label || ariaLabel);
      return (
        <div>
          <label htmlFor={id}>{label || ariaLabel}</label>
          <select
            id={id}
            aria-label={ariaLabel}
            aria-invalid={isInvalid ? "true" : "false"}
            value={
              Array.isArray(value)
                ? value.join(",")
                : value || selectedKeys?.[0] || ""
            }
            onChange={onChange}
            onBlur={onBlur}
          >
            <option value="">Select...</option>
            {children}
          </select>
          {isInvalid && errorMessage ? <span>{errorMessage}</span> : null}
        </div>
      );
    },
    SelectSection: ({ children }: { children: React.ReactNode }) => (
      <>{children}</>
    ),
    SelectItem: ({
      children,
      value,
    }: {
      children: React.ReactNode;
      value?: string;
    }) => <option value={value || String(children)}>{children}</option>,
    Chip: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
    Image: ({ alt, src }: { alt: string; src: string }) => (
      <img alt={alt} src={src} />
    ),
    Switch: ({
      isSelected,
      onValueChange,
    }: {
      isSelected?: boolean;
      onValueChange?: (selected: boolean) => void;
    }) => (
      <button
        type="button"
        role="switch"
        aria-checked={Boolean(isSelected)}
        onClick={() => onValueChange?.(!isSelected)}
      />
    ),
  };
});

const signerPubkey =
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

const renderProductForm = ({
  profileData = new Map(),
  oldValues,
  handleDelete = jest.fn(),
  onSubmitCallback = jest.fn(),
}: {
  profileData?: Map<string, any>;
  oldValues?: any;
  handleDelete?: jest.Mock;
  onSubmitCallback?: jest.Mock;
} = {}) => {
  const addNewlyCreatedProductEvent = jest.fn();
  const handleModalToggle = jest.fn();
  const nostr = { publish: jest.fn() };
  const signer = { sign: jest.fn(), getPubKey: jest.fn() };

  const view = render(
    <ProfileMapContext.Provider
      value={{
        profileData,
        isLoading: false,
        updateProfileData: jest.fn(),
      }}
    >
      <ProductContext.Provider
        value={{
          productEvents: [],
          isLoading: false,
          addNewlyCreatedProductEvent,
          removeDeletedProductEvent: jest.fn(),
        }}
      >
        <SignerContext.Provider
          value={{
            signer: signer as any,
            isLoggedIn: true,
            isAuthStateResolved: true,
            pubkey: signerPubkey,
            npub: "npub-test",
          }}
        >
          <NostrContext.Provider value={{ nostr: nostr as any }}>
            <ProductForm
              showModal
              handleModalToggle={handleModalToggle}
              oldValues={oldValues}
              handleDelete={handleDelete}
              onSubmitCallback={onSubmitCallback}
            />
          </NostrContext.Provider>
        </SignerContext.Provider>
      </ProductContext.Provider>
    </ProfileMapContext.Provider>
  );

  return {
    ...view,
    addNewlyCreatedProductEvent,
    handleModalToggle,
    handleDelete,
    onSubmitCallback,
  };
};

const fillRequiredFields = () => {
  fireEvent.change(screen.getByLabelText(/product name/i), {
    target: { value: "Orange Marmalade" },
  });
  fireEvent.change(screen.getByLabelText(/description/i), {
    target: { value: "Small-batch citrus preserve" },
  });
  fireEvent.change(screen.getByLabelText(/price/i), {
    target: { value: "2100" },
  });
  fireEvent.change(screen.getByLabelText(/location/i), {
    target: { value: "Austin, TX" },
  });
  fireEvent.change(screen.getByLabelText(/shipping option/i), {
    target: { value: "Free" },
  });
  fireEvent.change(screen.getByLabelText(/category/i), {
    target: { value: "Food" },
  });
};

describe("ProductForm", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (PostListing as jest.Mock).mockResolvedValue({
      id: "new-product-event",
      kind: 30402,
    });
    (finalizeAndSendNostrEvent as jest.Mock).mockResolvedValue({
      id: "flash-sale-event",
    });
  });

  it("renders the core product listing fields", () => {
    renderProductForm();

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /add new product listing/i }))
      .toBeInTheDocument();
    expect(screen.getByLabelText(/product name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/description/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/price/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/location/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/shipping option/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/category/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /list product/i })).toBeEnabled();
  });

  it("shows validation errors for required fields and missing images", async () => {
    renderProductForm();

    fireEvent.click(screen.getByRole("button", { name: /list product/i }));

    expect(await screen.findByText("A description is required."))
      .toBeInTheDocument();
    expect(screen.getByText("A price is required.")).toBeInTheDocument();
    expect(screen.getByText("Please specify a location.")).toBeInTheDocument();
    expect(screen.getByText("A category is required.")).toBeInTheDocument();
    expect(PostListing).not.toHaveBeenCalled();

    fillRequiredFields();
    fireEvent.click(screen.getByRole("button", { name: /list product/i }));

    expect(await screen.findByText("At least one image is required."))
      .toBeInTheDocument();
    expect(PostListing).not.toHaveBeenCalled();
  });

  it("submits a valid listing with user-entered data and an uploaded image", async () => {
    const { addNewlyCreatedProductEvent, handleModalToggle, onSubmitCallback } =
      renderProductForm();

    fillRequiredFields();
    fireEvent.click(screen.getAllByRole("button", { name: /upload/i })[0]!);
    fireEvent.click(screen.getByRole("button", { name: /list product/i }));

    await waitFor(() => {
      expect(PostListing).toHaveBeenCalledTimes(1);
    });

    const tags = (PostListing as jest.Mock).mock.calls[0][0];
    expect(tags).toEqual(
      expect.arrayContaining([
        ["title", "Orange Marmalade"],
        ["summary", "Small-batch citrus preserve"],
        ["price", "2100", "SAT"],
        ["location", "Austin, TX"],
        ["shipping", "Free", "0", "SAT"],
        ["image", "https://cdn.example/product.webp"],
        ["t", "Food"],
        ["t", "shopstr"],
      ])
    );
    expect(addNewlyCreatedProductEvent).toHaveBeenCalledWith({
      id: "new-product-event",
      kind: 30402,
    });
    expect(handleModalToggle).toHaveBeenCalled();
    expect(onSubmitCallback).toHaveBeenCalled();
  });

  it("renders conditional shipping and optional fields, then includes them in submitted tags", async () => {
    renderProductForm();

    fillRequiredFields();
    fireEvent.change(screen.getByLabelText(/shipping option/i), {
      target: { value: "Pickup" },
    });
    fireEvent.change(await screen.findByLabelText(/pickup location 1/i), {
      target: { value: "Farm stand, Saturday morning" },
    });
    fireEvent.click(screen.getByRole("button", { name: /additional options/i }));
    fireEvent.change(await screen.findByLabelText(/quantity/i), {
      target: { value: "5" },
    });
    fireEvent.change(screen.getByLabelText(/condition/i), {
      target: { value: "New" },
    });
    fireEvent.change(screen.getByLabelText(/status/i), {
      target: { value: "active" },
    });
    fireEvent.change(screen.getByLabelText(/required customer information/i), {
      target: { value: "Email" },
    });
    fireEvent.change(screen.getByLabelText(/restrictions/i), {
      target: { value: "Local pickup only" },
    });
    fireEvent.click(screen.getAllByRole("button", { name: /upload/i })[0]!);
    fireEvent.click(screen.getByRole("button", { name: /list product/i }));

    await waitFor(() => {
      expect(PostListing).toHaveBeenCalledTimes(1);
    });

    const tags = (PostListing as jest.Mock).mock.calls[0][0];
    expect(tags).toEqual(
      expect.arrayContaining([
        ["shipping", "Pickup", "0", "SAT"],
        ["pickup_location", "Farm stand, Saturday morning"],
        ["quantity", "5"],
        ["condition", "New"],
        ["status", "active"],
        ["required", "Email"],
        ["restrictions", "Local pickup only"],
      ])
    );
  });

  it("submits optional bulk pricing tags", async () => {
    renderProductForm();

    fillRequiredFields();
    fireEvent.click(screen.getByRole("button", { name: /additional options/i }));
    fireEvent.click(screen.getAllByRole("switch")[0]!);
    fireEvent.click(await screen.findByRole("button", { name: /add bulk tier/i }));

    const unitInputs = screen.getAllByLabelText(/units/i);
    const totalPriceInputs = screen.getAllByLabelText(/total price/i);
    fireEvent.change(unitInputs[0]!, { target: { value: "3" } });
    fireEvent.change(totalPriceInputs[0]!, { target: { value: "5000" } });

    fireEvent.click(screen.getAllByRole("button", { name: /upload/i })[0]!);
    fireEvent.click(screen.getByRole("button", { name: /list product/i }));

    await waitFor(() => {
      expect(PostListing).toHaveBeenCalledTimes(1);
    });

    const tags = (PostListing as jest.Mock).mock.calls[0][0];
    expect(tags).toEqual(
      expect.arrayContaining([
        ["bulk", "3", "5000"],
      ])
    );
  });

  it("disables the submit button while a listing is being posted", async () => {
    let resolvePost!: (value: unknown) => void;
    (PostListing as jest.Mock).mockReturnValue(
      new Promise((resolve) => {
        resolvePost = resolve;
      })
    );
    renderProductForm();

    fillRequiredFields();
    fireEvent.click(screen.getAllByRole("button", { name: /upload/i })[0]!);
    fireEvent.click(screen.getByRole("button", { name: /list product/i }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /list product/i }))
        .toBeDisabled();
    });

    resolvePost({ id: "event-after-delay" });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /list product/i }))
        .toBeEnabled();
    });
  });

  it("loads edit defaults and calls handleDelete before adding the updated listing", async () => {
    const handleDelete = jest.fn();
    const oldValues = {
      id: "old-event-id",
      d: "existing-d",
      title: "Old Title",
      summary: "Old summary",
      price: 100,
      currency: "SAT",
      location: "Old location",
      shippingType: "Free",
      shippingCost: "0",
      categories: ["Food"],
      images: ["https://cdn.example/old.webp"],
      status: "active",
    };
    renderProductForm({ oldValues, handleDelete });

    expect(screen.getByLabelText(/product name/i)).toHaveValue("Old Title");
    expect(screen.getByRole("button", { name: /edit product/i })).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: /edit product/i }));

    await waitFor(() => {
      expect(PostListing).toHaveBeenCalledTimes(1);
    });

    expect(handleDelete).toHaveBeenCalledWith("old-event-id");
    expect((PostListing as jest.Mock).mock.calls[0][0]).toEqual(
      expect.arrayContaining([
        ["d", "existing-d"],
        ["image", "https://cdn.example/old.webp"],
      ])
    );
  });

  it("publishes a flash sale note for sellers with a Lightning address", async () => {
    const profileData = new Map([
      [
        signerPubkey,
        {
          content: {
            lud16: "seller@example.com",
            payment_preference: "lightning",
          },
        },
      ],
    ]);
    renderProductForm({ profileData });

    fillRequiredFields();
    fireEvent.click(screen.getAllByRole("button", { name: /upload/i })[0]!);
    fireEvent.click(screen.getByRole("button", { name: /list product/i }));

    await waitFor(() => {
      expect(finalizeAndSendNostrEvent).toHaveBeenCalledTimes(1);
    });

    expect((finalizeAndSendNostrEvent as jest.Mock).mock.calls[0][2])
      .toMatchObject({
        kind: 1,
        tags: expect.arrayContaining([
          ["t", "zapsnag"],
          ["t", "shopstr-zapsnag"],
          ["image", "https://cdn.example/product.webp"],
        ]),
        content: expect.stringContaining("#zapsnag"),
      });
  });
});
