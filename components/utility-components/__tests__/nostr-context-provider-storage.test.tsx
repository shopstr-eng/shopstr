import { render, waitFor } from "@testing-library/react";
import { SignerContextProvider } from "../nostr-context-provider";
import { NostrManager } from "@/utils/nostr/nostr-manager";
import { setLocalStorageDataOnSignIn } from "@/utils/nostr/nostr-helper-functions";
import type { NostrSigner } from "@/utils/nostr/signers/nostr-signer";
import { webcrypto } from "node:crypto";

jest.mock("../request-passphrase-modal", () => () => null);
jest.mock("../auth-challenge-modal", () => () => null);
jest.mock("../migration-prompt-modal", () => () => null);

const originalCrypto = globalThis.crypto;

beforeAll(() => {
  Object.defineProperty(globalThis, "crypto", {
    configurable: true,
    value: webcrypto,
  });
});

afterAll(() => {
  Object.defineProperty(globalThis, "crypto", {
    configurable: true,
    value: originalCrypto,
  });
});

describe("SignerContextProvider storage loading", () => {
  beforeEach(() => {
    localStorage.clear();
    jest.restoreAllMocks();
  });

  it("does not report a storage parse warning when no signer is stored", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});

    render(
      <SignerContextProvider>
        <div>signed out</div>
      </SignerContextProvider>
    );

    await waitFor(() => {
      expect(warn).not.toHaveBeenCalledWith(
        expect.stringContaining('Storage parse error for key "signer"'),
        expect.anything()
      );
    });
  });

  it("does not overwrite encrypted NIP-46 credentials while loading the runtime signer", async () => {
    const runtimeSigner = {
      toJSON: () => ({
        type: "nip46",
        bunker:
          "bunker://7f0f1a4418a17e704c73152bd1ab2252db1c7fe16a6c2bdad50634e1c00262b3?relay=wss://relay.example",
        appPrivKey:
          "1111111111111111111111111111111111111111111111111111111111111111",
      }),
    } as unknown as NostrSigner;
    const loadedSigner = {
      getPubKey: jest
        .fn()
        .mockResolvedValue(
          "2222222222222222222222222222222222222222222222222222222222222222"
        ),
    } as unknown as NostrSigner;
    jest.spyOn(NostrManager, "signerFrom").mockReturnValue(loadedSigner);

    await setLocalStorageDataOnSignIn({
      signer: runtimeSigner,
      signerPassphrase: "secret-passphrase",
    });

    render(
      <SignerContextProvider>
        <div>signed in</div>
      </SignerContextProvider>
    );

    await waitFor(() => {
      expect(NostrManager.signerFrom).toHaveBeenCalled();
    });

    expect(JSON.parse(localStorage.getItem("signer") || "null")).toEqual({
      type: "nip46",
      encryptedSigner: expect.any(String),
    });
  });
});
