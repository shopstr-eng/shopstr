import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";
import PassphraseChallengeModal from "../request-passphrase-modal";

const mockRouterPush = jest.fn();
jest.mock("next/router", () => ({
  useRouter: () => ({
    push: mockRouterPush,
  }),
}));

jest.mock("@/utils/STATIC-VARIABLES", () => ({
  SHOPSTRBUTTONCLASSNAMES: "mock-button-class",
}));

jest.mock("@nextui-org/react", () => {
    const originalModule = jest.requireActual("@nextui-org/react");
    const MockInput = React.forwardRef(({ value, onChange, onKeyDown }: any, ref: any) => (
        <input
            ref={ref}
            type="password"
            value={value}
            onChange={onChange}
            onKeyDown={onKeyDown}
            aria-label="Passphrase"
        />
    ));
    MockInput.displayName = "MockInput";

    return {
        ...originalModule,
        Modal: ({ isOpen, children }: { isOpen: boolean; children: React.ReactNode }) =>
            isOpen ? <div role="dialog">{children}</div> : null,
        ModalContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
        ModalHeader: ({ children }: { children: React.ReactNode }) => <header>{children}</header>,
        ModalBody: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
        ModalFooter: ({ children }: { children: React.ReactNode }) => <footer>{children}</footer>,
        Button: ({ children, onClick }: any) => <button onClick={onClick}>{children}</button>,
        Input: MockInput,
    };
});


describe("PassphraseChallengeModal", () => {
    const mockSetIsOpen = jest.fn();
    const mockActionOnSubmit = jest.fn();
    const mockActionOnCancel = jest.fn();

    const defaultProps = {
        isOpen: true,
        setIsOpen: mockSetIsOpen,
        actionOnSubmit: mockActionOnSubmit,
        actionOnCancel: mockActionOnCancel,
    };

    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("should not render when isOpen is false", () => {
        render(<PassphraseChallengeModal {...defaultProps} isOpen={false} />);
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("should render correctly when isOpen is true", () => {
        render(<PassphraseChallengeModal {...defaultProps} />);
        expect(screen.getByText("Enter Passphrase")).toBeInTheDocument();
        expect(screen.getByLabelText("Passphrase")).toBeInTheDocument();
        expect(screen.getByRole("checkbox")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Submit" })).toBeInTheDocument();
    });

    it("should update passphrase state on input change", () => {
        render(<PassphraseChallengeModal {...defaultProps} />);
        const input = screen.getByLabelText("Passphrase");
        fireEvent.change(input, { target: { value: "testpass" } });
        expect(input).toHaveValue("testpass");
    });

    it("should toggle 'remember' checkbox on click", () => {
        render(<PassphraseChallengeModal {...defaultProps} />);
        const checkbox = screen.getByRole("checkbox") as HTMLInputElement;
        expect(checkbox.checked).toBe(false);
        fireEvent.click(checkbox);
        expect(checkbox.checked).toBe(true);
    });

    it("should call actionOnSubmit with correct values when Submit button is clicked", () => {
        render(<PassphraseChallengeModal {...defaultProps} />);
        
        const input = screen.getByLabelText("Passphrase");
        fireEvent.change(input, { target: { value: "testpass" } });

        const checkbox = screen.getByRole("checkbox");
        fireEvent.click(checkbox);

        const submitButton = screen.getByRole("button", { name: "Submit" });
        fireEvent.click(submitButton);

        expect(mockSetIsOpen).toHaveBeenCalledWith(false);
        expect(mockActionOnSubmit).toHaveBeenCalledWith("testpass", true);
    });

    it("should call actionOnSubmit when Enter key is pressed", () => {
        render(<PassphraseChallengeModal {...defaultProps} />);
        
        const input = screen.getByLabelText("Passphrase");
        fireEvent.change(input, { target: { value: "enter-key-pass" } });
        fireEvent.keyDown(input, { key: "Enter", code: "Enter" });

        expect(mockSetIsOpen).toHaveBeenCalledWith(false);
        expect(mockActionOnSubmit).toHaveBeenCalledWith("enter-key-pass", false);
    });

    it("should call onCancel and navigate to default route when Cancel is clicked", () => {
        render(<PassphraseChallengeModal {...defaultProps} />);
        const cancelButton = screen.getByRole("button", { name: "Cancel" });
        fireEvent.click(cancelButton);

        expect(mockActionOnCancel).toHaveBeenCalled();
        expect(mockSetIsOpen).toHaveBeenCalledWith(false);
        expect(mockRouterPush).toHaveBeenCalledWith("/marketplace");
    });
    
    it("should navigate to custom route when Cancel is clicked and onCancelRouteTo is provided", () => {
        const customRoute = "/custom-path";
        render(<PassphraseChallengeModal {...defaultProps} onCancelRouteTo={customRoute} />);
        const cancelButton = screen.getByRole("button", { name: "Cancel" });
        fireEvent.click(cancelButton);

        expect(mockRouterPush).toHaveBeenCalledWith(customRoute);
    });

    it("should display an error message when error prop is provided", () => {
        const error = new Error("Invalid passphrase");
        render(<PassphraseChallengeModal {...defaultProps} error={error} />);
        expect(screen.getByText(error.message)).toBeInTheDocument();
    });

    it("should focus the input when trying to submit with an empty passphrase", () => {
        render(<PassphraseChallengeModal {...defaultProps} />);
        const input = screen.getByLabelText("Passphrase");
        const submitButton = screen.getByRole("button", { name: "Submit" });
        
        fireEvent.click(submitButton);
        
        expect(input).toHaveFocus();
        expect(mockActionOnSubmit).not.toHaveBeenCalled();
    });
});