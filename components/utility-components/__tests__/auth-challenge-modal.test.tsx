import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";
import AuthChallengeModal from "../auth-challenge-modal";

const mockRouterPush = jest.fn();
jest.mock("next/router", () => ({
  useRouter: () => ({
    push: mockRouterPush,
  }),
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
  };
});

window.open = jest.fn();


describe("AuthChallengeModal", () => {
  const mockSetIsOpen = jest.fn();
  const defaultProps = {
    isOpen: true,
    setIsOpen: mockSetIsOpen,
    challenge: "This is a text challenge",
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("does not render when isOpen is false", () => {
    render(<AuthChallengeModal {...defaultProps} isOpen={false} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("renders with a text challenge when challenge is not a URL", () => {
    render(<AuthChallengeModal {...defaultProps} />);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Waiting for confirmation")).toBeInTheDocument();
    expect(screen.getByText(defaultProps.challenge)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Open Signer" })
    ).not.toBeInTheDocument();
  });

  it("renders with a URL challenge and 'Open Signer' button", () => {
    const urlChallenge = "https://example.com/auth";
    render(<AuthChallengeModal {...defaultProps} challenge={urlChallenge} />);

    expect(
      screen.getByText("Please confirm this action on your remote signer")
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Open Signer" })
    ).toBeInTheDocument();
  });

  it("displays an error message when error prop is provided", () => {
    const error = new Error("Something went wrong");
    render(<AuthChallengeModal {...defaultProps} error={error} />);
    expect(screen.getByText(error.message)).toBeInTheDocument();
  });

  it("calls window.open when 'Open Signer' button is clicked", () => {
    const urlChallenge = "https://example.com/auth";
    render(<AuthChallengeModal {...defaultProps} challenge={urlChallenge} />);

    const openSignerButton = screen.getByRole("button", {
      name: "Open Signer",
    });
    fireEvent.click(openSignerButton);

    expect(window.open).toHaveBeenCalledWith(urlChallenge, "_blank");
  });

  describe("Cancel Button Logic", () => {
    it("calls setIsOpen and routes to /marketplace on cancel by default", () => {
      render(<AuthChallengeModal {...defaultProps} />);
      const cancelButton = screen.getByRole("button", { name: "Cancel" });
      fireEvent.click(cancelButton);

      expect(mockSetIsOpen).toHaveBeenCalledWith(false);
      expect(mockRouterPush).toHaveBeenCalledWith("/marketplace");
    });

    it("calls a custom action and routes to a custom path on cancel", () => {
      const mockActionOnCancel = jest.fn();
      const customRoute = "/custom-path";
      render(
        <AuthChallengeModal
          {...defaultProps}
          actionOnCancel={mockActionOnCancel}
          onCancelRouteTo={customRoute}
        />
      );
      const cancelButton = screen.getByRole("button", { name: "Cancel" });
      fireEvent.click(cancelButton);

      expect(mockSetIsOpen).toHaveBeenCalledWith(false);
      expect(mockActionOnCancel).toHaveBeenCalled();
      expect(mockRouterPush).toHaveBeenCalledWith(customRoute);
    });
  });
});