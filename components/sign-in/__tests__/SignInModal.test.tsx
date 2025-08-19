import React from "react";
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import SignInModal from "../SignInModal";
import { useRouter } from "next/router";
import { RelaysContext } from "../../../utils/context/context";
import { SignerContext } from "@/components/utility-components/nostr-context-provider";
import * as nostrHelpers from "@/utils/nostr/nostr-helper-functions";
import { NostrNSecSigner } from "@/utils/nostr/signers/nostr-nsec-signer";

jest.mock("next/router", () => ({ useRouter: jest.fn() }));
jest.mock("@/utils/nostr/nostr-helper-functions", () => ({
  validateNSecKey: jest.fn(),
  parseBunkerToken: jest.fn(),
  setLocalStorageDataOnSignIn: jest.fn(),
}));
jest.spyOn(NostrNSecSigner, "getEncryptedNSEC").mockReturnValue({
  encryptedPrivKey: "encrypted-key",
  pubkey: "test-pubkey",
});

const helpers = nostrHelpers as jest.Mocked<typeof nostrHelpers>;

const mockRelays = {
  isLoading: false,
  relayList: ["wss://relay.damus.io"],
  readRelayList: ["wss://relay.damus.io"],
  writeRelayList: ["wss://relay.damus.io"],
  setRelayList: jest.fn(),
  setReadRelayList: jest.fn(),
  setWriteRelayList: jest.fn(),
};
const mockNewSigner = jest.fn();
const mockSignerCtx = {
  newSigner: mockNewSigner,
  signer: null,
  setSigner: jest.fn(),
};

function renderModal(open = true) {
  const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
  const push = jest.fn();
  const onClose = jest.fn();
  (useRouter as jest.Mock).mockReturnValue({ push });
  render(
    <RelaysContext.Provider value={mockRelays}>
      <SignerContext.Provider value={mockSignerCtx}>
        <SignInModal isOpen={open} onClose={onClose} />
      </SignerContext.Provider>
    </RelaysContext.Provider>
  );
  return { user, push, onClose };
}

describe("SignInModal", () => {
  beforeAll(() => jest.useFakeTimers());
  afterAll(() => jest.useRealTimers());

  beforeEach(() => {
    jest.clearAllMocks();
    jest.clearAllTimers();
  });

  it("doesn't render when closed", () => {
    renderModal(false);
    expect(screen.queryByText("Shopstr")).toBeNull();
  });

  it("redirects to keys on Sign Up", async () => {
    const { user, push } = renderModal();
    const btn = screen.getAllByRole("button", { name: /sign up/i })[0];
    await user.click(btn);
    await waitFor(() => expect(push).toHaveBeenCalledWith("/onboarding/keys"));
  });

  describe("Extension Sign-in", () => {
    it("succeeds and navigates to user-profile", async () => {
      const signer = { getPubKey: jest.fn().mockResolvedValue("pk") };
      mockNewSigner.mockReturnValue(signer);

      const { user, push } = renderModal();
      await user.click(
        screen.getByRole("button", { name: /extension sign-in/i })
      );
      await waitFor(() => {
        expect(signer.getPubKey).toHaveBeenCalled();
        expect(push).toHaveBeenCalledWith("/onboarding/user-profile");
      });
    });

    it("shows a failure modal on error", async () => {
      mockNewSigner.mockImplementation(() => {
        throw new Error("User rejected");
      });
      const { user } = renderModal();
      await user.click(
        screen.getByRole("button", { name: /extension sign-in/i })
      );
      expect(
        await screen.findByText(/extension sign-in failed!/i)
      ).toBeInTheDocument();
    });
  });

  describe("Bunker Sign-in", () => {
    it("validates the token on input", async () => {
      helpers.parseBunkerToken.mockReturnValue(false);
      const { user } = renderModal();
      await user.click(screen.getByTestId("bunker-open-btn"));

      const input = await screen.findByPlaceholderText(
        /paste your bunker token/i
      );
      await user.type(input, "xyz");
      expect(helpers.parseBunkerToken).toHaveBeenCalledWith("xyz");
    });

    it("succeeds and navigates to user-profile", async () => {
      helpers.parseBunkerToken.mockReturnValue(true);
      const signer = {
        connect: jest.fn().mockResolvedValue(undefined),
        getPubKey: jest.fn().mockResolvedValue("pk"),
      };
      mockNewSigner.mockReturnValue(signer);

      const { user, push } = renderModal();
      await user.click(screen.getByTestId("bunker-open-btn"));
      const input = await screen.findByPlaceholderText(
        /paste your bunker token/i
      );
      await user.type(input, "bunker://valid-token");

      await user.click(screen.getByTestId("bunker-submit-btn"));
      await waitFor(() =>
        expect(push).toHaveBeenCalledWith("/onboarding/user-profile")
      );
    });

    it("shows a failure modal on connection error", async () => {
      helpers.parseBunkerToken.mockReturnValue(true);
      const signer = { connect: jest.fn().mockRejectedValue(new Error()) };
      mockNewSigner.mockReturnValue(signer);

      const { user } = renderModal();
      await user.click(screen.getByTestId("bunker-open-btn"));
      const input = await screen.findByPlaceholderText(
        /paste your bunker token/i
      );
      await user.type(input, "bunker://valid-token");
      await user.click(screen.getByTestId("bunker-submit-btn"));

      expect(
        await screen.findByText(/bunker sign-in failed!/i)
      ).toBeInTheDocument();
    });
  });

  describe("NSec Sign-in", () => {
    it("validates the private key on input", async () => {
      helpers.validateNSecKey.mockReturnValue(false);
      const { user } = renderModal();
      await user.click(screen.getByTestId("nsec-open-btn"));

      const pkInput = await screen.findByPlaceholderText(
        /paste your nostr private key/i
      );
      await user.type(pkInput, "abc");
      expect(helpers.validateNSecKey).toHaveBeenCalledWith("abc");
    });

    it("succeeds and navigates to user-profile", async () => {
      helpers.validateNSecKey.mockReturnValue(true);
      const signer = { getPubKey: jest.fn().mockResolvedValue("pk") };
      mockNewSigner.mockReturnValue(signer);

      const { user, push } = renderModal();
      await user.click(screen.getByTestId("nsec-open-btn"));

      const pkInput = await screen.findByPlaceholderText(
        /paste your nostr private key/i
      );
      const passInput = screen.getByPlaceholderText(
        /enter a passphrase of your choice/i
      );
      await user.type(pkInput, "nsec1validkey");
      await user.type(passInput, "password123");

      await user.click(screen.getByTestId("nsec-submit-btn"));

      act(() => jest.runAllTimers());

      await waitFor(() =>
        expect(push).toHaveBeenCalledWith("/onboarding/user-profile")
      );
    });

    it("shows a failure modal if passphrase is empty", async () => {
      helpers.validateNSecKey.mockReturnValue(true);
      const { user } = renderModal();
      await user.click(screen.getByTestId("nsec-open-btn"));

      const pkInput = await screen.findByPlaceholderText(
        /paste your nostr private key/i
      );
      await user.type(pkInput, "nsec1validkey");

      await user.click(screen.getByTestId("nsec-submit-btn"));
      expect(
        await screen.findByText(/No passphrase provided!/i)
      ).toBeInTheDocument();
    });
  });
});
