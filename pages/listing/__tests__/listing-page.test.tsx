import "@testing-library/jest-dom";
import { render, screen, waitFor } from "@testing-library/react";
import { useRouter } from "next/router";
import { nip19 } from "nostr-tools";
import type { ReactNode } from "react";

import ListingPage from "../[[...productId]]";
import { ProductContext } from "@/utils/context/context";
import { NostrEvent } from "@/utils/types/types";

jest.mock("next/router", () => ({
  useRouter: jest.fn(),
}));

jest.mock(
  "@heroui/react",
  () => ({
    Modal: ({ children }: { children: ReactNode }) => <div>{children}</div>,
    ModalContent: ({ children }: { children: ReactNode }) => (
      <div>{children}</div>
    ),
    ModalHeader: ({ children }: { children: ReactNode }) => (
      <div>{children}</div>
    ),
    ModalBody: ({ children }: { children: ReactNode }) => (
      <div>{children}</div>
    ),
    Dropdown: ({ children }: { children: ReactNode }) => (
      <div>{children}</div>
    ),
    DropdownTrigger: ({ children }: { children: ReactNode }) => (
      <div>{children}</div>
    ),
    DropdownMenu: ({ children }: { children: ReactNode }) => (
      <div>{children}</div>
    ),
    DropdownItem: ({ children }: { children: ReactNode }) => (
      <div>{children}</div>
    ),
    Button: ({
      children,
      onPress,
    }: {
      children: ReactNode;
      onPress?: () => void;
    }) => <button onClick={onPress}>{children}</button>,
  }),
  { virtual: true }
);

jest.mock("@heroicons/react/24/outline", () => ({
  XCircleIcon: () => <svg data-testid="x-circle-icon" />,
  EllipsisVerticalIcon: () => <svg data-testid="ellipsis-vertical-icon" />,
}));

jest.mock("@/utils/parsers/product-parser-functions", () => ({
  __esModule: true,
  default: jest.fn((event: NostrEvent) => {
    const title = event.tags.find((tag: string[]) => tag[0] === "title")?.[1];
    if (!title) {
      return undefined;
    }

    return {
      id: event.id,
      pubkey: event.pubkey,
      title,
      summary:
        event.tags.find((tag: string[]) => tag[0] === "summary")?.[1] || "",
      images: [
        event.tags.find((tag: string[]) => tag[0] === "image")?.[1] ||
          "https://example.com/listing.png",
      ],
    };
  }),
}));

jest.mock("@/utils/parsers/zapsnag-parser", () => ({
  parseZapsnagNote: jest.fn(() => undefined),
}));

jest.mock(
  "../../../components/utility-components/checkout-card",
  () =>
    function MockCheckoutCard({
      productData,
    }: {
      productData: { title: string; summary?: string };
    }) {
      return (
        <div data-testid="checkout-card">
          <div>{productData.title}</div>
          <div>{productData.summary}</div>
        </div>
      );
    }
);

jest.mock("@/components/storefront/storefront-theme-wrapper", () => ({
  __esModule: true,
  default: ({ children }: { children: ReactNode }) => (
    <div data-testid="storefront-theme-wrapper">{children}</div>
  ),
}));

jest.mock("@/components/utility-components/modals/event-modals", () => ({
  RawEventModal: () => null,
  EventIdModal: () => null,
}));

jest.mock("../../../components/ZapsnagButton", () => () => (
  <div data-testid="zapsnag-button" />
));

jest.mock("@/components/utility-components/shopstr-spinner", () => ({
  __esModule: true,
  default: () => <div data-testid="shopstr-spinner" />,
}));

const mockUseRouter = useRouter as jest.Mock;

const relayHintedIdentifier = nip19.naddrEncode({
  identifier: "listing-d-tag",
  pubkey: "a".repeat(64),
  kind: 30402,
  relays: ["wss://relay.shopstr.example", "wss://relay-2.shopstr.example"],
});

function createEvent({
  id,
  title,
  summary = "",
  pubkey = "a".repeat(64),
  dTag = "listing-d-tag",
}: {
  id: string;
  title: string;
  summary?: string;
  pubkey?: string;
  dTag?: string;
}): NostrEvent {
  return {
    id,
    pubkey,
    created_at: 1710000000,
    kind: 30402,
    tags: [
      ["d", dTag],
      ["title", title],
      ["summary", summary],
      ["image", "https://example.com/listing.png"],
    ],
    content: "",
    sig: "f".repeat(128),
  };
}

const defaultOgMeta = {
  title: "Shopstr Listing",
  description: "Check out this listing on Shopstr!",
  image: "/shopstr-2000x2000.png",
  url: `/listing/${relayHintedIdentifier}`,
};

function renderListingPage({
  initialProductEvent,
  productEvents,
  isLoading,
}: {
  initialProductEvent: NostrEvent | null;
  productEvents: NostrEvent[];
  isLoading: boolean;
}) {
  return render(
    <ProductContext.Provider
      value={{
        productEvents,
        isLoading,
        addNewlyCreatedProductEvent: jest.fn(),
        removeDeletedProductEvent: jest.fn(),
      }}
    >
      <ListingPage
        ogMeta={defaultOgMeta}
        initialProductEvent={initialProductEvent}
      />
    </ProductContext.Provider>
  );
}

describe("Listing page direct-load reconciliation", () => {
  let routerState: {
    isReady: boolean;
    push: jest.Mock;
    replace: jest.Mock;
    query: { productId: string[] };
  };

  beforeEach(() => {
    jest.clearAllMocks();
    routerState = {
      isReady: true,
      push: jest.fn(),
      replace: jest.fn(),
      query: { productId: [relayHintedIdentifier] },
    };
    mockUseRouter.mockImplementation(() => routerState);
  });

  test("keeps the SSR-seeded listing visible for relay-hinted naddr routes after hydration", async () => {
    const seededEvent = createEvent({
      id: "seeded-event-id",
      title: "SSR Relay Listing",
      summary: "Rendered before product hydration",
    });

    const { rerender } = renderListingPage({
      initialProductEvent: seededEvent,
      productEvents: [],
      isLoading: true,
    });

    expect(screen.getByTestId("checkout-card")).toHaveTextContent(
      "SSR Relay Listing"
    );

    rerender(
      <ProductContext.Provider
        value={{
          productEvents: [
            createEvent({
              id: "hydrated-event-id",
              title: "SSR Relay Listing",
              summary: "Hydrated relay listing",
            }),
          ],
          isLoading: false,
          addNewlyCreatedProductEvent: jest.fn(),
          removeDeletedProductEvent: jest.fn(),
        }}
      >
        <ListingPage
          ogMeta={defaultOgMeta}
          initialProductEvent={seededEvent}
        />
      </ProductContext.Provider>
    );

    await waitFor(() =>
      expect(screen.getByTestId("checkout-card")).toHaveTextContent(
        "SSR Relay Listing"
      )
    );
  });

  test("prefers the matching hydrated context event once it becomes available", async () => {
    const seededEvent = createEvent({
      id: "seeded-event-id",
      title: "SSR Relay Listing",
      summary: "Seeded summary",
    });
    const hydratedEvent = createEvent({
      id: "hydrated-event-id",
      title: "Hydrated Relay Listing",
      summary: "Fresh context summary",
    });

    const { rerender } = renderListingPage({
      initialProductEvent: seededEvent,
      productEvents: [],
      isLoading: true,
    });

    expect(screen.getByTestId("checkout-card")).toHaveTextContent(
      "SSR Relay Listing"
    );

    rerender(
      <ProductContext.Provider
        value={{
          productEvents: [hydratedEvent],
          isLoading: false,
          addNewlyCreatedProductEvent: jest.fn(),
          removeDeletedProductEvent: jest.fn(),
        }}
      >
        <ListingPage
          ogMeta={defaultOgMeta}
          initialProductEvent={seededEvent}
        />
      </ProductContext.Provider>
    );

    await waitFor(() =>
      expect(screen.getByTestId("checkout-card")).toHaveTextContent(
        "Hydrated Relay Listing"
      )
    );
    expect(screen.getByTestId("checkout-card")).toHaveTextContent(
      "Fresh context summary"
    );
  });

  test("clears stale listing state when the route changes to a different listing", async () => {
    const seededEvent = createEvent({
      id: "seeded-event-id",
      title: "Cold Load Listing",
      summary: "Initial route listing",
    });

    const { rerender } = renderListingPage({
      initialProductEvent: seededEvent,
      productEvents: [],
      isLoading: false,
    });

    expect(screen.getByTestId("checkout-card")).toHaveTextContent(
      "Cold Load Listing"
    );

    routerState = {
      ...routerState,
      query: { productId: ["different-listing-route"] },
    };

    rerender(
      <ProductContext.Provider
        value={{
          productEvents: [],
          isLoading: false,
          addNewlyCreatedProductEvent: jest.fn(),
          removeDeletedProductEvent: jest.fn(),
        }}
      >
        <ListingPage
          ogMeta={{
            ...defaultOgMeta,
            url: "/listing/different-listing-route",
          }}
          initialProductEvent={null}
        />
      </ProductContext.Provider>
    );

    await waitFor(() =>
      expect(screen.queryByTestId("checkout-card")).not.toBeInTheDocument()
    );
    expect(screen.getByTestId("shopstr-spinner")).toBeInTheDocument();
    expect(screen.queryByText("Cold Load Listing")).not.toBeInTheDocument();
  });
});
