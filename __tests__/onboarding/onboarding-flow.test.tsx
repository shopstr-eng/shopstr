import React from "react";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";

import { RelaysContext } from "@/utils/context/context";
import { SignerContext } from "@/components/utility-components/nostr-context-provider";

// ---------------------------------------------------------------------------
// Router mock. Each test installs a fresh router via setRouter() so we can
// assert on push/replace calls and feed query params into the page.
// ---------------------------------------------------------------------------
let currentRouter: any;

const setRouter = (overrides: Partial<any> = {}) => {
  currentRouter = {
    isReady: true,
    query: {},
    push: jest.fn(),
    replace: jest.fn(),
    ...overrides,
  };
  return currentRouter;
};

jest.mock("next/router", () => ({
  useRouter: () => currentRouter,
}));

// ---------------------------------------------------------------------------
// Child components are stubbed out — these tests only guard navigation/param
// threading, not the inner forms or the Pro checkout engine.
// ---------------------------------------------------------------------------
jest.mock("@/components/settings/market-profile-form", () => () => (
  <div data-testid="market-profile-form" />
));
jest.mock("@/components/settings/buyer-profile-form", () => () => (
  <div data-testid="buyer-profile-form" />
));
jest.mock("@/components/settings/shop-profile-form", () => () => (
  <div data-testid="shop-profile-form" />
));

// ProCheckout exposes a button so we can simulate a completed Pro payment and
// confirm the page advances with plan=pro.
jest.mock("@/components/pro/pro-checkout", () => ({
  __esModule: true,
  default: ({ onComplete }: { onComplete: (s: string) => void }) => (
    <button data-testid="pro-complete" onClick={() => onComplete("paid")}>
      Complete Pro
    </button>
  ),
}));

// new-account.tsx dependencies — key generation and signer creation are mocked
// so handleNext runs synchronously without real crypto.
jest.mock("@/utils/nostr/nostr-helper-functions", () => ({
  generateKeys: jest.fn(async () => ({ nsec: "nsec_test", npub: "npub_test" })),
  setLocalStorageDataOnSignIn: jest.fn(),
}));

jest.mock("@/utils/nostr/signers/nostr-nsec-signer", () => ({
  NostrNSecSigner: {
    getEncryptedNSEC: jest.fn(() => ({
      encryptedPrivKey: "enc",
      pubkey: "pk_test",
    })),
  },
}));

// Import pages after mocks are registered.
import OnboardingChoosePlan from "@/pages/onboarding/choose-plan";
import UserTypeSelection from "@/pages/onboarding/user-type";
import NewAccount from "@/pages/onboarding/new-account";
import OnboardingMarketProfile from "@/pages/onboarding/market-profile";
import OnboardingShopProfile from "@/pages/onboarding/shop-profile";
import OnboardingStripeConnect from "@/pages/onboarding/stripe-connect";

const relaysValue = {
  relayList: [],
  readRelayList: [],
  writeRelayList: [],
  isLoading: false,
} as any;

const renderWithSigner = (
  ui: React.ReactElement,
  signerValue: Partial<any> = {}
) => {
  const value = {
    signer: {},
    isLoggedIn: false,
    isAuthStateResolved: true,
    pubkey: "",
    npub: "",
    newSigner: jest.fn(() => ({
      getPubKey: jest.fn(async () => "pk_test"),
    })),
    ...signerValue,
  } as any;
  return render(
    <SignerContext.Provider value={value}>
      <RelaysContext.Provider value={relaysValue}>{ui}</RelaysContext.Provider>
    </SignerContext.Provider>
  );
};

beforeEach(() => {
  jest.clearAllMocks();
});

// ===========================================================================
// new-account.tsx — Step 1 → user-type (or choose-plan for Shopify migrate)
// ===========================================================================
describe("new-account onboarding step", () => {
  it("sends a fresh seller to user-type, carrying the plan param", async () => {
    setRouter({ query: { plan: "pro" } });
    const user = userEvent.setup();
    renderWithSigner(<NewAccount />);

    await user.type(screen.getByPlaceholderText(/Enter a passphrase/i), "pw");
    await user.click(screen.getByRole("button", { name: /Next/i }));

    await waitFor(() => {
      expect(currentRouter.push).toHaveBeenCalledWith(
        "/onboarding/user-type?plan=pro"
      );
    });
  });

  it("goes straight to user-type with no params when no plan is set", async () => {
    setRouter({ query: {} });
    const user = userEvent.setup();
    renderWithSigner(<NewAccount />);

    await user.type(screen.getByPlaceholderText(/Enter a passphrase/i), "pw");
    await user.click(screen.getByRole("button", { name: /Next/i }));

    await waitFor(() => {
      expect(currentRouter.push).toHaveBeenCalledWith("/onboarding/user-type");
    });
  });

  it("Shopify migrate path skips user-type and lands on choose-plan", async () => {
    setRouter({ query: { migrate: "shopify", plan: "pro" } });
    const user = userEvent.setup();
    renderWithSigner(<NewAccount />);

    await user.type(screen.getByPlaceholderText(/Enter a passphrase/i), "pw");
    await user.click(screen.getByRole("button", { name: /Next/i }));

    await waitFor(() => {
      expect(currentRouter.push).toHaveBeenCalledWith(
        "/onboarding/choose-plan?type=seller&migrate=shopify&plan=pro"
      );
    });
  });
});

// ===========================================================================
// user-type.tsx — Step 2: seller → choose-plan, buyer → market-profile
// ===========================================================================
describe("user-type onboarding step", () => {
  it("routes a seller to choose-plan", async () => {
    setRouter({ query: {} });
    const user = userEvent.setup();
    render(<UserTypeSelection />);

    await user.click(screen.getByText("Vendor"));
    await user.click(screen.getByRole("button", { name: /Next/i }));

    expect(currentRouter.push).toHaveBeenCalledWith(
      "/onboarding/choose-plan?type=seller"
    );
  });

  it("threads plan + migrate params into choose-plan for a seller", async () => {
    setRouter({ query: { plan: "pro", migrate: "shopify" } });
    const user = userEvent.setup();
    render(<UserTypeSelection />);

    await user.click(screen.getByText("Vendor"));
    await user.click(screen.getByRole("button", { name: /Next/i }));

    expect(currentRouter.push).toHaveBeenCalledWith(
      "/onboarding/choose-plan?type=seller&plan=pro&migrate=shopify"
    );
  });

  it("routes a buyer straight to market-profile, skipping choose-plan", async () => {
    setRouter({ query: {} });
    const user = userEvent.setup();
    render(<UserTypeSelection />);

    await user.click(screen.getByText("Shopper"));
    await user.click(screen.getByRole("button", { name: /Next/i }));

    expect(currentRouter.push).toHaveBeenCalledWith(
      "/onboarding/market-profile?type=buyer"
    );
  });

  it("Shopify migrate redirect auto-skips role selection to choose-plan", async () => {
    setRouter({ query: { migrate: "shopify", plan: "free" } });
    render(<UserTypeSelection />);

    await waitFor(() => {
      expect(currentRouter.replace).toHaveBeenCalledWith(
        "/onboarding/choose-plan?type=seller&migrate=shopify&plan=free"
      );
    });
  });
});

// ===========================================================================
// choose-plan.tsx — Step 3: Free vs Pro selection
// ===========================================================================
describe("choose-plan onboarding step", () => {
  it("Free selection continues to market-profile with plan=free", async () => {
    setRouter({ query: { type: "seller" } });
    const user = userEvent.setup();
    render(<OnboardingChoosePlan />);

    await user.click(screen.getByText("Free"));
    await user.click(
      screen.getByRole("button", { name: /Continue with Free/i })
    );

    expect(currentRouter.push).toHaveBeenCalledWith(
      "/onboarding/market-profile?type=seller&plan=free"
    );
  });

  it("carries the migrate param through the Free path", async () => {
    setRouter({ query: { type: "seller", migrate: "shopify" } });
    const user = userEvent.setup();
    render(<OnboardingChoosePlan />);

    await user.click(screen.getByText("Free"));
    await user.click(
      screen.getByRole("button", { name: /Continue with Free/i })
    );

    expect(currentRouter.push).toHaveBeenCalledWith(
      "/onboarding/market-profile?type=seller&plan=free&migrate=shopify"
    );
  });

  it("Pro checkout completion advances with plan=pro", async () => {
    setRouter({ query: { type: "seller", plan: "pro" } });
    const user = userEvent.setup();
    render(<OnboardingChoosePlan />);

    // plan=pro deep-link auto-selects Pro and renders ProCheckout.
    await user.click(await screen.findByTestId("pro-complete"));

    expect(currentRouter.push).toHaveBeenCalledWith(
      "/onboarding/market-profile?type=seller&plan=pro"
    );
  });

  it("Skip-for-now falls back to the Free path", async () => {
    setRouter({ query: { type: "seller", plan: "pro", migrate: "shopify" } });
    const user = userEvent.setup();
    render(<OnboardingChoosePlan />);

    await user.click(screen.getByText(/Skip for now/i));

    expect(currentRouter.push).toHaveBeenCalledWith(
      "/onboarding/market-profile?type=seller&plan=free&migrate=shopify"
    );
  });
});

// ===========================================================================
// market-profile.tsx — Step 4: seller → shop-profile, buyer → marketplace
// ===========================================================================
describe("market-profile onboarding step", () => {
  it("seller advances to shop-profile preserving plan + migrate", async () => {
    setRouter({ query: { type: "seller", plan: "pro", migrate: "shopify" } });
    const user = userEvent.setup();
    render(<OnboardingMarketProfile />);

    await user.click(screen.getByRole("button", { name: /Next \(or skip\)/i }));

    expect(currentRouter.push).toHaveBeenCalledWith(
      "/onboarding/shop-profile?plan=pro&migrate=shopify"
    );
  });

  it("seller with only a plan param keeps it through to shop-profile", async () => {
    setRouter({ query: { type: "seller", plan: "free" } });
    const user = userEvent.setup();
    render(<OnboardingMarketProfile />);

    await user.click(screen.getByRole("button", { name: /Next \(or skip\)/i }));

    expect(currentRouter.push).toHaveBeenCalledWith(
      "/onboarding/shop-profile?plan=free"
    );
  });

  it("buyer finishes at the marketplace, never touching shop-profile", async () => {
    setRouter({ query: { type: "buyer" } });
    const user = userEvent.setup();
    render(<OnboardingMarketProfile />);

    await user.click(
      screen.getByRole("button", { name: /Finish \(or skip\)/i })
    );

    expect(currentRouter.push).toHaveBeenCalledWith("/marketplace");
  });
});

// ===========================================================================
// shop-profile.tsx — Step 5: → stripe-connect
// ===========================================================================
describe("shop-profile onboarding step", () => {
  it("advances to stripe-connect preserving plan + migrate", async () => {
    setRouter({ query: { plan: "pro", migrate: "shopify" } });
    const user = userEvent.setup();
    render(<OnboardingShopProfile />);

    await user.click(
      screen.getByRole("button", { name: /Finish \(or skip\)/i })
    );

    expect(currentRouter.push).toHaveBeenCalledWith(
      "/onboarding/stripe-connect?plan=pro&migrate=shopify"
    );
  });

  it("advances with just the plan param when migrate is absent", async () => {
    setRouter({ query: { plan: "free" } });
    const user = userEvent.setup();
    render(<OnboardingShopProfile />);

    await user.click(
      screen.getByRole("button", { name: /Finish \(or skip\)/i })
    );

    expect(currentRouter.push).toHaveBeenCalledWith(
      "/onboarding/stripe-connect?plan=free"
    );
  });
});

// ===========================================================================
// stripe-connect.tsx — Step 6: final destination depends on migrate
// ===========================================================================
describe("stripe-connect onboarding step", () => {
  it("a normal seller skips to the marketplace", async () => {
    setRouter({ query: { plan: "pro" } });
    const user = userEvent.setup();
    renderWithSigner(<OnboardingStripeConnect />);

    await user.click(screen.getByRole("button", { name: /Skip for Now/i }));

    expect(currentRouter.push).toHaveBeenCalledWith("/marketplace");
  });

  it("a Shopify-migrating seller lands back on the stall import flow", async () => {
    setRouter({ query: { migrate: "shopify" } });
    const user = userEvent.setup();
    renderWithSigner(<OnboardingStripeConnect />);

    await user.click(screen.getByRole("button", { name: /Skip for Now/i }));

    expect(currentRouter.push).toHaveBeenCalledWith(
      "/settings/stall?tab=products&migrate=shopify"
    );
  });
});

// ===========================================================================
// Full-flow integration: walk seller paths end-to-end, asserting the plan +
// migrate params survive every hop (the bug class this suite guards against).
// ===========================================================================
describe("seller flow param threading (end-to-end)", () => {
  const advance = (
    PageComponent: React.ComponentType,
    query: Record<string, string>
  ) => {
    cleanup();
    setRouter({ query });
    render(<PageComponent />);
    return userEvent.setup();
  };

  it("Pro path keeps plan=pro from choose-plan to stripe-connect", async () => {
    // choose-plan (Pro) -> market-profile
    let user = advance(OnboardingChoosePlan, { type: "seller", plan: "pro" });
    await user.click(await screen.findByTestId("pro-complete"));
    expect(currentRouter.push).toHaveBeenCalledWith(
      "/onboarding/market-profile?type=seller&plan=pro"
    );

    // market-profile -> shop-profile
    user = advance(OnboardingMarketProfile, { type: "seller", plan: "pro" });
    await user.click(screen.getByRole("button", { name: /Next \(or skip\)/i }));
    expect(currentRouter.push).toHaveBeenCalledWith(
      "/onboarding/shop-profile?plan=pro"
    );

    // shop-profile -> stripe-connect
    user = advance(OnboardingShopProfile, { plan: "pro" });
    await user.click(
      screen.getByRole("button", { name: /Finish \(or skip\)/i })
    );
    expect(currentRouter.push).toHaveBeenCalledWith(
      "/onboarding/stripe-connect?plan=pro"
    );
  });

  it("Shopify migrate path keeps migrate=shopify from choose-plan to the final redirect", async () => {
    // choose-plan (Free) -> market-profile
    let user = advance(OnboardingChoosePlan, {
      type: "seller",
      migrate: "shopify",
    });
    await user.click(screen.getByText("Free"));
    await user.click(
      screen.getByRole("button", { name: /Continue with Free/i })
    );
    expect(currentRouter.push).toHaveBeenCalledWith(
      "/onboarding/market-profile?type=seller&plan=free&migrate=shopify"
    );

    // market-profile -> shop-profile
    user = advance(OnboardingMarketProfile, {
      type: "seller",
      plan: "free",
      migrate: "shopify",
    });
    await user.click(screen.getByRole("button", { name: /Next \(or skip\)/i }));
    expect(currentRouter.push).toHaveBeenCalledWith(
      "/onboarding/shop-profile?plan=free&migrate=shopify"
    );

    // shop-profile -> stripe-connect
    user = advance(OnboardingShopProfile, {
      plan: "free",
      migrate: "shopify",
    });
    await user.click(
      screen.getByRole("button", { name: /Finish \(or skip\)/i })
    );
    expect(currentRouter.push).toHaveBeenCalledWith(
      "/onboarding/stripe-connect?plan=free&migrate=shopify"
    );

    // stripe-connect -> stall import (migrate preserved as destination)
    user = advance(OnboardingStripeConnect, { migrate: "shopify" });
    await user.click(screen.getByRole("button", { name: /Skip for Now/i }));
    expect(currentRouter.push).toHaveBeenCalledWith(
      "/settings/stall?tab=products&migrate=shopify"
    );
  });
});
