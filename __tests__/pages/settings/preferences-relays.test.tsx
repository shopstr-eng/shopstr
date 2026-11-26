import React from "react";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import "@testing-library/jest-dom";
import { Relay } from "nostr-tools";
import PreferencesPage from "@/pages/settings/preferences";

// ── Module mocks ──────────────────────────────────────────────────────────────

jest.mock("nostr-tools", () => ({
  Relay: { connect: jest.fn() },
}));

jest.mock(
  "@heroui/react",
  () => {
    const React = require("react");
    return {
      Modal: ({ isOpen, children }: any) =>
        isOpen
          ? React.createElement("div", { role: "dialog" }, children)
          : null,
      ModalContent: ({ children }: any) =>
        React.createElement(
          React.Fragment,
          null,
          typeof children === "function" ? children(() => {}) : children
        ),
      ModalHeader: ({ children }: any) =>
        React.createElement("h2", null, children),
      ModalBody: ({ children }: any) =>
        React.createElement("div", null, children),
      ModalFooter: ({ children }: any) =>
        React.createElement("div", null, children),
      Button: ({ children, onClick, type }: any) =>
        React.createElement(
          "button",
          { onClick, type: type ?? "button" },
          children
        ),
      Textarea: ({
        value,
        onChange,
        onBlur,
        onKeyDown,
        placeholder,
        isInvalid,
        errorMessage,
      }: any) =>
        React.createElement(
          "div",
          null,
          React.createElement("textarea", {
            placeholder,
            value: value ?? "",
            onChange,
            onBlur,
            onKeyDown,
          }),
          isInvalid && errorMessage
            ? React.createElement("span", null, errorMessage)
            : null
        ),
      Radio: ({ children }: any) =>
        React.createElement("label", null, children),
      RadioGroup: ({ children }: any) =>
        React.createElement("div", null, children),
    };
  },
  { virtual: true }
);

jest.mock("@heroicons/react/24/outline", () => ({
  InformationCircleIcon: () => null,
  MinusCircleIcon: () => null,
}));

jest.mock("next-themes", () => ({
  useTheme: () => ({ theme: "light", setTheme: jest.fn() }),
}));

jest.mock("@/utils/nostr/nostr-helper-functions", () => ({
  createBlossomServerEvent: jest.fn(),
  createNostrRelayEvent: jest.fn(),
  getStoredBlossomServers: jest.fn().mockReturnValue([]),
  getStoredMints: jest.fn().mockReturnValue([]),
  getStoredRelays: jest.fn().mockReturnValue(["wss://shared.example"]),
  getStoredReadRelays: jest.fn().mockReturnValue(["wss://read.example"]),
  getStoredWriteRelays: jest.fn().mockReturnValue(["wss://write.example"]),
  publishWalletEvent: jest.fn(),
  saveAddress: jest.fn(),
  deleteAddress: jest.fn(),
  getSavedAddresses: jest.fn().mockReturnValue([]),
}));

jest.mock("@/components/utility-components/nostr-context-provider", () => {
  const React = require("react");
  return {
    NostrContext: React.createContext({ nostr: undefined }),
    SignerContext: React.createContext({ signer: undefined }),
  };
});

jest.mock("@/utils/context/context", () => {
  const React = require("react");
  return { CashuWalletContext: React.createContext({}) };
});

jest.mock("@/components/utility-components/protected-route", () => ({
  __esModule: true,
  default: ({ children }: any) =>
    React.createElement(React.Fragment, null, children),
}));

jest.mock("@/components/settings/settings-bread-crumbs", () => ({
  SettingsBreadCrumbs: () => null,
}));

jest.mock("@/components/utility-components/shopstr-slider", () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock("@/components/utility-components/failure-modal", () => ({
  __esModule: true,
  default: ({ isOpen, bodyText }: any) =>
    isOpen ? React.createElement("div", { role: "alert" }, bodyText) : null,
}));

jest.mock("@/components/utility-components/edit-address-form", () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock("@/components/utility-components/saved-addresses-list", () => ({
  __esModule: true,
  default: () => null,
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

const mockConnect = Relay.connect as jest.Mock;

// The three "Add Relay" buttons on the page, in order: Read/Write, Read Only,
// Write Only. Taken before any modal is open, so the modal's own submit
// button isn't included.
const openRelayModal = (section: "all" | "read" | "write") => {
  const index = { all: 0, read: 1, write: 2 }[section];
  const buttons = screen.getAllByRole("button", { name: "Add Relay" });
  expect(buttons).toHaveLength(3);
  fireEvent.click(buttons[index]!);
};

const submitRelay = (url: string) => {
  const dialog = screen.getByRole("dialog");
  fireEvent.change(within(dialog).getByPlaceholderText("wss://..."), {
    target: { value: url },
  });
  fireEvent.click(within(dialog).getByRole("button", { name: "Add Relay" }));
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("PreferencesPage relay management", () => {
  beforeEach(() => {
    mockConnect.mockReset();
    mockConnect.mockResolvedValue({ close: jest.fn() });
  });

  it.each([
    ["all", "Add Read/Write Relay"],
    ["read", "Add Read Only Relay"],
    ["write", "Add Write Only Relay"],
  ] as const)(
    "opens a single Add Relay modal for the %s section",
    (section, heading) => {
      render(<PreferencesPage />);
      openRelayModal(section);

      expect(screen.getAllByRole("dialog")).toHaveLength(1);
      expect(
        screen.getByRole("heading", { name: heading })
      ).toBeInTheDocument();
    }
  );

  it("rejects a relay that is already in the Read Only list", async () => {
    render(<PreferencesPage />);
    openRelayModal("read");
    submitRelay("wss://read.example");

    expect(
      await screen.findByText("This relay is already in your Read Only relays.")
    ).toBeInTheDocument();
    expect(mockConnect).not.toHaveBeenCalled();
    // The modal stays open so the user can fix the URL, and the list is unchanged.
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(
      screen.getAllByText("wss://read.example", { selector: "div" })
    ).toHaveLength(1);
  });

  it("rejects a relay that is already in the Write Only list", async () => {
    render(<PreferencesPage />);
    openRelayModal("write");
    submitRelay("wss://write.example");

    expect(
      await screen.findByText(
        "This relay is already in your Write Only relays."
      )
    ).toBeInTheDocument();
    expect(mockConnect).not.toHaveBeenCalled();
  });

  it("adds a Read/Write relay to the Read Only list too", async () => {
    render(<PreferencesPage />);
    openRelayModal("read");
    submitRelay("wss://shared.example");

    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    );
    expect(mockConnect).toHaveBeenCalledWith("wss://shared.example");
    // Once in Read/Write Relays and once in Read Only Relays.
    expect(screen.getAllByText("wss://shared.example")).toHaveLength(2);
  });

  it("ignores surrounding whitespace when checking for duplicates", async () => {
    render(<PreferencesPage />);
    openRelayModal("write");
    submitRelay("wss://write.example  ");

    expect(
      await screen.findByText(
        "This relay is already in your Write Only relays."
      )
    ).toBeInTheDocument();
    expect(mockConnect).not.toHaveBeenCalled();
  });
});
