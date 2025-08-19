import React from "react";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import FailureModal from "../failure-modal";

jest.mock("@heroicons/react/24/outline", () => ({
  XCircleIcon: () => <div data-testid="x-circle-icon" />,
}));

jest.mock("@nextui-org/react", () => ({
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
}));

describe("FailureModal", () => {
  const mockOnClose = jest.fn();
  const defaultProps = {
    isOpen: true,
    onClose: mockOnClose,
    bodyText: "This is a test failure message.",
  };

  beforeEach(() => {
    mockOnClose.mockClear();
  });

  it("should not render when isOpen is false", () => {
    render(<FailureModal {...defaultProps} isOpen={false} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("should render correctly when isOpen is true", () => {
    render(<FailureModal {...defaultProps} />);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("should display the static error header and icon", () => {
    render(<FailureModal {...defaultProps} />);
    expect(screen.getByText("Error")).toBeInTheDocument();
    expect(screen.getByTestId("x-circle-icon")).toBeInTheDocument();
  });

  it("should display the provided bodyText", () => {
    render(<FailureModal {...defaultProps} />);
    expect(screen.getByText(defaultProps.bodyText)).toBeInTheDocument();
  });
});
