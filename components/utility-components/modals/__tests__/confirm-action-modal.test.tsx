import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ConfirmActionModal from "../confirm-action-modal";

// Mock NextUI components to avoid complex DOM structures in tests
jest.mock("@nextui-org/react", () => {
  const React = require("react");
  return {
    useDisclosure: () => {
      const [isOpen, setIsOpen] = React.useState(false);
      return {
        isOpen,
        onOpen: () => setIsOpen(true),
        onOpenChange: () => setIsOpen(!isOpen),
      };
    },
    Modal: ({ children, isOpen }: { children: React.ReactNode; isOpen: boolean }) => (
      isOpen ? <div role="dialog">{children}</div> : null
    ),
    ModalContent: ({ children }: { children: (onClose: () => void) => React.ReactNode }) => (
      <div>{children(() => {})}</div>
    ),
    ModalHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    ModalBody: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    ModalFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    Button: ({ 
      children, 
      onPress, 
      color, 
      variant 
    }: { 
      children: React.ReactNode; 
      onPress?: () => void;
      color?: string;
      variant?: string;
    }) => (
      <button 
        onClick={onPress} 
        data-color={color} 
        data-variant={variant}
      >
        {children}
      </button>
    ),
  };
});

describe("ConfirmActionModal", () => {
  const mockOnConfirm = jest.fn();
  const props = {
    title: "Confirm Delete",
    description: "Are you sure you want to proceed?",
    confirmLabel: "Yes, Confirm",
    onConfirm: mockOnConfirm,
    children: <button>Trigger Action</button>,
  };

  beforeEach(() => {
    mockOnConfirm.mockClear();
  });

  it("renders the trigger component correctly", () => {
    render(<ConfirmActionModal {...props} />);
    expect(screen.getByText("Trigger Action")).toBeInTheDocument();
  });

  it("does not show the modal by default", () => {
    render(<ConfirmActionModal {...props} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("opens the modal when the trigger is clicked", async () => {
    const user = userEvent.setup();
    render(<ConfirmActionModal {...props} />);
    
    await user.click(screen.getByText("Trigger Action"));
    
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Are you sure you want to proceed?")).toBeInTheDocument();
    expect(screen.getByText("Confirm Delete")).toBeInTheDocument();
  });

  it("calls the onConfirm callback when the confirm button is clicked", async () => {
    const user = userEvent.setup();
    render(<ConfirmActionModal {...props} />);
    
    // Open modal
    await user.click(screen.getByText("Trigger Action"));
    
    // Click confirm
    const confirmButton = screen.getByText("Yes, Confirm");
    await user.click(confirmButton);
    
    expect(mockOnConfirm).toHaveBeenCalledTimes(1);
  });

  it("closes the modal after confirmation", async () => {
    const user = userEvent.setup();
    render(<ConfirmActionModal {...props} />);
    
    await user.click(screen.getByText("Trigger Action"));
    await user.click(screen.getByText("Yes, Confirm"));
    
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });
});
