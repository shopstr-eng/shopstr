import { render, waitFor } from "@testing-library/react";
import Landing from "@/pages/index";
import { ProductContext } from "@/utils/context/context";
import { SignerContext } from "@/components/utility-components/nostr-context-provider";

jest.mock("next/router", () => ({
  useRouter: () => ({
    pathname: "/",
    push: jest.fn(),
  }),
}));

jest.mock("@heroui/react", () => ({
  Button: ({ children, onPress, onClick }: any) => (
    <button type="button" onClick={onPress ?? onClick}>
      {children}
    </button>
  ),
  Image: ({ alt }: any) => <img alt={alt} />,
  useDisclosure: () => ({
    isOpen: false,
    onOpen: jest.fn(),
    onClose: jest.fn(),
  }),
}));

jest.mock("framer-motion", () => ({
  motion: new Proxy(
    {},
    {
      get:
        () =>
        ({ children, ...props }: any) => <div {...props}>{children}</div>,
    }
  ),
}));

jest.mock("@/components/sign-in/SignInModal", () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock("@/components/utility-components/product-card", () => ({
  __esModule: true,
  default: () => <div data-testid="product-card" />,
}));

describe("Landing", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("does not surface a runtime error overlay when marketplace stats are unavailable", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: "db unavailable" }),
    }) as any;
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});

    render(
      <SignerContext.Provider
        value={{ signer: undefined, pubkey: "", isLoggedIn: false } as any}
      >
        <ProductContext.Provider
          value={
            {
              productEvents: [],
              isLoading: false,
              addNewlyCreatedProductEvent: jest.fn(),
              removeDeletedProductEvent: jest.fn(),
            } as any
          }
        >
          <Landing />
        </ProductContext.Provider>
      </SignerContext.Provider>
    );

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith("/api/db/marketplace-stats", {
        cache: "no-store",
      })
    );
    expect(errorSpy).not.toHaveBeenCalled();

    errorSpy.mockRestore();
  });
});
