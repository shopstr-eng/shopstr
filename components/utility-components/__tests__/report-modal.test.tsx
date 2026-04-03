import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import ReportModal from "../report-modal";
import {
  NostrContext,
  SignerContext,
} from "@/components/utility-components/nostr-context-provider";
import { publishReportEvent, REPORT_REASONS } from "@/utils/nostr/reporting";

jest.mock("@/utils/nostr/reporting", () => ({
  ...jest.requireActual("@/utils/nostr/reporting"),
  publishReportEvent: jest.fn(),
}));

jest.mock("@nextui-org/react", () => {
  const originalModule = jest.requireActual("@nextui-org/react");
  return {
    ...originalModule,
    Modal: ({
      isOpen,
      children,
    }: {
      isOpen: boolean;
      children: React.ReactNode;
    }) => (isOpen ? <div role="dialog">{children}</div> : null),
    ModalContent: ({ children }: { children: React.ReactNode }) => (
      <div>{children}</div>
    ),
    ModalHeader: ({ children }: { children: React.ReactNode }) => (
      <header>{children}</header>
    ),
    ModalBody: ({ children }: { children: React.ReactNode }) => (
      <main>{children}</main>
    ),
    ModalFooter: ({ children }: { children: React.ReactNode }) => (
      <footer>{children}</footer>
    ),
    Select: ({ children, onChange, selectedKeys }: any) => (
      <select
        aria-label="Reason"
        value={selectedKeys?.[0] || ""}
        onChange={(e) => onChange?.(e)}
      >
        {children}
      </select>
    ),
    SelectItem: ({ children, value }: any) => (
      <option value={value}>{children}</option>
    ),
    Input: ({ value, onChange, label, placeholder }: any) => (
      <input
        aria-label={label}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
      />
    ),
    Button: ({ children, onClick }: any) => (
      <button onClick={onClick}>{children}</button>
    ),
  };
});

jest.mock("../failure-modal", () => ({
  __esModule: true,
  default: ({ isOpen, bodyText }: { isOpen: boolean; bodyText: string }) =>
    isOpen ? <div>{bodyText}</div> : null,
}));

jest.mock("../success-modal", () => ({
  __esModule: true,
  default: ({ isOpen, bodyText }: { isOpen: boolean; bodyText: string }) =>
    isOpen ? <div>{bodyText}</div> : null,
}));

const mockPublishReportEvent = publishReportEvent as jest.Mock;

function renderWithProviders(ui: React.ReactElement) {
  return render(
    <NostrContext.Provider value={{ nostr: {} as any }}>
      <SignerContext.Provider
        value={{ isLoggedIn: true, signer: {} as any, pubkey: "viewer-pubkey" }}
      >
        {ui}
      </SignerContext.Provider>
    </NostrContext.Provider>
  );
}

describe("ReportModal", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders all NIP-56 reason options", () => {
    renderWithProviders(
      <ReportModal
        isOpen={true}
        onClose={jest.fn()}
        targetType="profile"
        pubkey="target-pubkey"
      />
    );

    for (const reason of REPORT_REASONS) {
      const pretty = reason.charAt(0).toUpperCase() + reason.slice(1);
      expect(screen.getByText(pretty)).toBeInTheDocument();
    }
  });

  it("submits report and closes modal", async () => {
    const onClose = jest.fn();
    mockPublishReportEvent.mockResolvedValue(undefined);

    renderWithProviders(
      <ReportModal
        isOpen={true}
        onClose={onClose}
        targetType="listing"
        pubkey="target-pubkey"
        dTag="listing-d"
        productTitle="Vintage Camera"
      />
    );

    fireEvent.change(screen.getByLabelText("Reason"), {
      target: { value: "illegal" },
    });
    fireEvent.change(screen.getByLabelText("Details (optional)"), {
      target: { value: "Prohibited item details" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Submit" }));

    await waitFor(() => {
      expect(mockPublishReportEvent).toHaveBeenCalledWith(
        expect.any(Object),
        expect.any(Object),
        "listing",
        "target-pubkey",
        "illegal",
        "Prohibited item details",
        "listing-d"
      );
    });

    expect(onClose).toHaveBeenCalled();
  });
});
