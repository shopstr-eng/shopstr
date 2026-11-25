import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import ArbiterControls from "../arbiter-controls";
import { SignerContext } from "@/components/utility-components/nostr-context-provider";
import { createNip98AuthorizationHeader } from "@/utils/nostr/nip98-auth";

jest.mock("@/utils/nostr/nip98-auth", () => ({
  createNip98AuthorizationHeader: jest.fn(),
}));

jest.mock("@heroui/react", () => {
  const React = require("react");
  return {
    Button: ({
      children,
      isDisabled,
      isLoading,
      onPress,
    }: {
      children: any;
      isDisabled?: boolean;
      isLoading?: boolean;
      onPress?: () => void;
    }) =>
      React.createElement(
        "button",
        { disabled: isDisabled || isLoading, onClick: onPress, type: "button" },
        children
      ),
  };
});

jest.mock("@/components/utility-components/confirmation-modal", () => {
  const React = require("react");
  return function MockConfirmationModal({
    isOpen,
    onConfirm,
    onCancel,
  }: {
    isOpen: boolean;
    onConfirm: () => void;
    onCancel: () => void;
  }) {
    if (!isOpen) return null;
    return React.createElement(
      "div",
      { role: "dialog" },
      React.createElement(
        "button",
        { type: "button", onClick: onConfirm },
        "Confirm Ruling"
      ),
      React.createElement(
        "button",
        { type: "button", onClick: onCancel },
        "Cancel"
      )
    );
  };
});

const mockCreateNip98AuthorizationHeader =
  createNip98AuthorizationHeader as jest.Mock;

describe("ArbiterControls", () => {
  const originalEnv = process.env;
  const mockSigner = { sign: jest.fn(), getPubKey: jest.fn() } as any;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = {
      ...originalEnv,
      NEXT_PUBLIC_ARBITER_NOSTR_PUBKEY: "arbiter-pubkey",
      NEXT_PUBLIC_ARBITER_API_SECRET: "legacy-browser-secret",
    };
    mockCreateNip98AuthorizationHeader.mockResolvedValue("Nostr signed-event");
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true }),
    }) as any;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("signs arbiter rulings with NIP-98 and never sends the legacy browser secret", async () => {
    const onRuled = jest.fn();

    render(
      <SignerContext.Provider
        value={
          {
            signer: mockSigner,
            pubkey: "arbiter-pubkey",
            isLoggedIn: true,
          } as any
        }
      >
        <ArbiterControls
          orderId="order-1"
          token="cashuAtoken"
          reason="item not received"
          onRuled={onRuled}
        />
      </SignerContext.Provider>
    );

    fireEvent.click(screen.getByRole("button", { name: /Rule for Seller/i }));
    fireEvent.click(screen.getByRole("button", { name: /Confirm Ruling/i }));

    const expectedBody = JSON.stringify({
      orderId: "order-1",
      token: "cashuAtoken",
      rulingFor: "seller",
    });
    await waitFor(() =>
      expect(mockCreateNip98AuthorizationHeader).toHaveBeenCalledWith(
        mockSigner,
        "http://localhost/api/arbiter/rule",
        "POST",
        expectedBody
      )
    );

    expect(global.fetch).toHaveBeenCalledWith("/api/arbiter/rule", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Nostr signed-event",
      },
      body: expectedBody,
    });
    expect(
      JSON.stringify((global.fetch as jest.Mock).mock.calls)
    ).not.toContain("legacy-browser-secret");
    expect(onRuled).toHaveBeenCalledWith("seller");
  });
});
