import { render, waitFor } from "@testing-library/react";
import { SignerContextProvider } from "../nostr-context-provider";

jest.mock("../request-passphrase-modal", () => () => null);
jest.mock("../auth-challenge-modal", () => () => null);
jest.mock("../migration-prompt-modal", () => () => null);

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
});
