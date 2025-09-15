import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import MigrationPromptModal from "../migration-prompt-modal";
import { migrateToNip49 } from "@/utils/nostr/encryption-migration";

jest.mock("@/utils/nostr/encryption-migration", () => ({
  migrateToNip49: jest.fn(),
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
    ModalBody: ({ children }: { children: React.ReactNode }) => (
      <main>{children}</main>
    ),
    Button: ({ children, onClick, isDisabled, isLoading }: any) => (
      <button onClick={onClick} disabled={isDisabled || isLoading}>
        {children}
      </button>
    ),
    Input: ({ value, onChange, onKeyDown, isInvalid, errorMessage }: any) => (
      <div>
        <input
          type="password"
          value={value}
          onChange={onChange}
          onKeyDown={onKeyDown}
          aria-label="Your Passphrase"
        />
        {isInvalid && <div role="alert">{errorMessage}</div>}
      </div>
    ),
  };
});

const mockedMigrateToNip49 = migrateToNip49 as jest.Mock;

describe("MigrationPromptModal", () => {
  const mockOnClose = jest.fn();
  const mockOnSuccess = jest.fn();
  const defaultProps = {
    isOpen: true,
    onClose: mockOnClose,
    onSuccess: mockOnSuccess,
  };

  let consoleErrorSpy: jest.SpyInstance;

  beforeAll(() => {
    consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterAll(() => {
    consoleErrorSpy.mockRestore();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should not render when isOpen is false", () => {
    render(<MigrationPromptModal {...defaultProps} isOpen={false} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("should render correctly with title, description, and input field", () => {
    render(<MigrationPromptModal {...defaultProps} />);
    expect(screen.getByText("Encryption Upgrade")).toBeInTheDocument();
    expect(screen.getByLabelText("Your Passphrase")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Later" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Upgrade Encryption" })
    ).toBeInTheDocument();
  });

  it("should have the upgrade button disabled initially", () => {
    render(<MigrationPromptModal {...defaultProps} />);
    expect(
      screen.getByRole("button", { name: "Upgrade Encryption" })
    ).toBeDisabled();
  });

  it("should enable the upgrade button when a passphrase is entered", () => {
    render(<MigrationPromptModal {...defaultProps} />);
    const input = screen.getByLabelText("Your Passphrase");
    fireEvent.change(input, { target: { value: "testpass" } });
    expect(
      screen.getByRole("button", { name: "Upgrade Encryption" })
    ).toBeEnabled();
  });

  it("should call onSuccess and onClose when migration succeeds", async () => {
    mockedMigrateToNip49.mockResolvedValue(true);
    render(<MigrationPromptModal {...defaultProps} />);

    const input = screen.getByLabelText("Your Passphrase");
    fireEvent.change(input, { target: { value: "correctpass" } });

    const upgradeButton = screen.getByRole("button", {
      name: "Upgrade Encryption",
    });
    fireEvent.click(upgradeButton);

    await waitFor(() => {
      expect(mockOnSuccess).toHaveBeenCalled();
      expect(mockOnClose).toHaveBeenCalled();
    });
  });

  it("should show an error message when migration fails (returns false)", async () => {
    mockedMigrateToNip49.mockResolvedValue(false);
    render(<MigrationPromptModal {...defaultProps} />);

    const input = screen.getByLabelText("Your Passphrase");
    fireEvent.change(input, { target: { value: "wrongpass" } });

    const upgradeButton = screen.getByRole("button", {
      name: "Upgrade Encryption",
    });
    fireEvent.click(upgradeButton);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Migration failed. Please try again with the correct passphrase."
    );
    expect(mockOnSuccess).not.toHaveBeenCalled();
    expect(mockOnClose).not.toHaveBeenCalled();
  });

  it("should show an error message when migration throws an error", async () => {
    mockedMigrateToNip49.mockRejectedValue(new Error("Decryption failed"));
    render(<MigrationPromptModal {...defaultProps} />);

    const input = screen.getByLabelText("Your Passphrase");
    fireEvent.change(input, { target: { value: "anotherwrongpass" } });

    const upgradeButton = screen.getByRole("button", {
      name: "Upgrade Encryption",
    });
    fireEvent.click(upgradeButton);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Failed to decrypt with the provided passphrase. Please try again."
    );
  });

  it("should call migration handler when Enter key is pressed in the input", () => {
    mockedMigrateToNip49.mockResolvedValue(true);
    render(<MigrationPromptModal {...defaultProps} />);

    const input = screen.getByLabelText("Your Passphrase");
    fireEvent.change(input, { target: { value: "enterpass" } });
    fireEvent.keyDown(input, { key: "Enter", code: "Enter" });

    expect(mockedMigrateToNip49).toHaveBeenCalledWith("enterpass");
  });

  it("should call onClose when the 'Later' button is clicked", () => {
    render(<MigrationPromptModal {...defaultProps} />);
    const laterButton = screen.getByRole("button", { name: "Later" });
    fireEvent.click(laterButton);
    expect(mockOnClose).toHaveBeenCalled();
  });
});
