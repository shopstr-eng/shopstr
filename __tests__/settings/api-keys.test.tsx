import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ChangeEvent, Key, MouseEventHandler, ReactNode } from "react";
import ApiKeysPage from "@/pages/settings/api-keys";
import { SignerContext } from "@/components/utility-components/nostr-context-provider";
import {
  buildApiKeysListProof,
  buildMcpRequestProofTemplate,
  MCP_SIGNED_EVENT_HEADER,
} from "@/utils/mcp/request-proof";
import type { NostrSigner } from "@/utils/nostr/signers/nostr-signer";

type ButtonMockProps = {
  children?: ReactNode;
  onClick?: MouseEventHandler<HTMLButtonElement>;
  isDisabled?: boolean;
  type?: "button" | "submit" | "reset";
};
type InputMockProps = {
  value?: string;
  onValueChange?: (value: string) => void;
  label?: string;
};
type SelectMockProps = {
  children?: ReactNode;
  label?: string;
  selectedKeys?: Iterable<Key>;
  onChange?: (event: ChangeEvent<HTMLSelectElement>) => void;
};
type SelectItemMockProps = {
  children?: ReactNode;
  value?: string;
};

jest.mock("next/router", () => ({
  useRouter: () => ({
    replace: jest.fn(),
    push: jest.fn(),
  }),
}));

jest.mock("@/components/settings/settings-bread-crumbs", () => ({
  SettingsBreadCrumbs: () => <div data-testid="breadcrumbs" />,
}));

jest.mock("@heroui/react", () => ({
  useDisclosure: () => ({
    isOpen: false,
    onOpen: jest.fn(),
    onClose: jest.fn(),
  }),
  Button: ({ children, onClick, isDisabled, type }: ButtonMockProps) => (
    <button disabled={isDisabled} onClick={onClick} type={type || "button"}>
      {children}
    </button>
  ),
  Input: ({ value, onValueChange, label }: InputMockProps) => (
    <label>
      {label}
      <input
        aria-label={label}
        value={value}
        onChange={(event) => onValueChange?.(event.target.value)}
      />
    </label>
  ),
  Select: ({ children, label, selectedKeys, onChange }: SelectMockProps) => {
    const selectedValue = String(Array.from(selectedKeys || [])[0] || "read");
    return (
      <label>
        {label}
        <select aria-label={label} value={selectedValue} onChange={onChange}>
          {children}
        </select>
      </label>
    );
  },
  SelectItem: ({ children, value }: SelectItemMockProps) => (
    <option value={value}>{children}</option>
  ),
  Spinner: () => <div>Loading...</div>,
}));

describe("ApiKeysPage", () => {
  const sign = jest.fn();
  const fetchMock = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = fetchMock;
    Object.assign(navigator, {
      clipboard: {
        writeText: jest.fn(),
      },
    });

    sign.mockResolvedValue({
      id: "signed-proof-id",
      pubkey: "f".repeat(64),
      kind: 27235,
      created_at: 1710000000,
      tags: [],
      content: "",
      sig: "signature",
    });
  });

  function renderPage() {
    return render(
      <SignerContext.Provider
        value={{
          pubkey: "f".repeat(64),
          isLoggedIn: true,
          signer: {
            connect: jest.fn().mockResolvedValue("f".repeat(64)),
            getPubKey: jest.fn().mockResolvedValue("f".repeat(64)),
            sign,
            encrypt: jest.fn(),
            decrypt: jest.fn(),
            close: jest.fn().mockResolvedValue(undefined),
            toJSON: () => ({ type: "test" }),
          } satisfies NostrSigner,
        }}
      >
        <ApiKeysPage />
      </SignerContext.Provider>
    );
  }

  it("signs the list-keys request and sends the signed proof header", async () => {
    fetchMock.mockResolvedValueOnce({
      json: async () => ({ keys: [] }),
    });

    renderPage();

    await waitFor(() => expect(sign).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    const [url, options] = fetchMock.mock.calls[0]!;
    expect(url).toContain("/api/mcp/api-keys?pubkey=");
    expect(options.headers[MCP_SIGNED_EVENT_HEADER]).toBe(
      JSON.stringify(await sign.mock.results[0]!.value)
    );

    const proofTemplate = sign.mock.calls[0]![0];
    expect(proofTemplate.tags).toEqual(
      buildMcpRequestProofTemplate(buildApiKeysListProof("f".repeat(64))).tags
    );
  });

  it("sends a signed proof when creating a new API key", async () => {
    fetchMock
      .mockResolvedValueOnce({
        json: async () => ({ keys: [] }),
      })
      .mockResolvedValueOnce({
        json: async () => ({
          success: true,
          key: "sk_created",
        }),
      })
      .mockResolvedValueOnce({
        json: async () => ({ keys: [] }),
      });

    renderPage();

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    fireEvent.change(screen.getByLabelText("Key Name"), {
      target: { value: "My Agent" },
    });
    fireEvent.click(screen.getByRole("button", { name: /generate api key/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));

    const createCall = fetchMock.mock.calls[1]!;
    const requestBody = JSON.parse(createCall[1].body);
    expect(requestBody).toEqual(
      expect.objectContaining({
        name: "My Agent",
        permissions: "read",
        pubkey: "f".repeat(64),
        signedEvent: expect.objectContaining({
          id: "signed-proof-id",
        }),
      })
    );
  });
});
