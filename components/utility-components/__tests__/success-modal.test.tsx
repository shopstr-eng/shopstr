import React from "react";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import SuccessModal from "../success-modal";

jest.mock("@heroicons/react/24/outline", () => ({
  CheckCircleIcon: () => <div data-testid="check-circle-icon" />,
}));

jest.mock("@nextui-org/react", () => ({
  Modal: ({ isOpen, children }: { isOpen: boolean; children: React.ReactNode }) =>
    isOpen ? <div role="dialog">{children}</div> : null,
  ModalContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  ModalHeader: ({ children }: { children: React.ReactNode }) => <header>{children}</header>,
  ModalBody: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
}));

describe("SuccessModal", () => {
  const mockOnClose = jest.fn();
  const defaultProps = {
    isOpen: true,
    onClose: mockOnClose,
    bodyText: "Your operation was successful.",
  };

  beforeEach(() => {
    mockOnClose.mockClear();
  });

  it("should not render when isOpen is false", () => {
    render(<SuccessModal {...defaultProps} isOpen={false} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("should render correctly when isOpen is true", () => {
    render(<SuccessModal {...defaultProps} />);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("should display the static success header and icon", () => {
    render(<SuccessModal {...defaultProps} />);
    expect(screen.getByText("Success")).toBeInTheDocument();
    expect(screen.getByTestId("check-circle-icon")).toBeInTheDocument();
  });

  it("should display the provided bodyText", () => {
    render(<SuccessModal {...defaultProps} />);
    expect(screen.getByText(defaultProps.bodyText)).toBeInTheDocument();
  });
});