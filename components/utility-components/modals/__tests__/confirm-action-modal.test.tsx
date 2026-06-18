import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ConfirmActionModal from "../confirm-action-modal";

jest.mock("@heroui/react", () => ({
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
  Button: ({
    children,
    onPress,
    onClick,
    color,
    type,
  }: {
    children: React.ReactNode;
    onPress?: () => void;
    onClick?: () => void;
    color?: string;
    type?: "button" | "submit" | "reset";
  }) => (
    <button data-color={color} type={type} onClick={onPress ?? onClick}>
      {children}
    </button>
  ),
}));

describe("ConfirmActionModal", () => {
  const onConfirm = jest.fn();
  const props = {
    helpText: "Are you sure you want to delete this listing?",
    buttonLabel: "Delete Listing",
    onConfirm,
    children: <button>Delete</button>,
  };

  beforeEach(() => {
    onConfirm.mockClear();
  });

  it("opens a confirmation modal from the trigger", async () => {
    const user = userEvent.setup();
    render(<ConfirmActionModal {...props} />);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Delete" }));

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText(props.helpText)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: props.buttonLabel })
    ).toBeInTheDocument();
  });

  it("preserves the trigger click handler when opening", async () => {
    const user = userEvent.setup();
    const onTriggerClick = jest.fn();

    render(
      <ConfirmActionModal {...props}>
        <button onClick={onTriggerClick}>Delete</button>
      </ConfirmActionModal>
    );

    await user.click(screen.getByRole("button", { name: "Delete" }));

    expect(onTriggerClick).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("does not open from a disabled trigger", async () => {
    const user = userEvent.setup();

    render(
      <ConfirmActionModal {...props}>
        <button disabled>Delete</button>
      </ConfirmActionModal>
    );

    await user.click(screen.getByRole("button", { name: "Delete" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("closes without confirming when cancelled", async () => {
    const user = userEvent.setup();
    render(<ConfirmActionModal {...props} />);

    await user.click(screen.getByRole("button", { name: "Delete" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("confirms once and closes the modal", async () => {
    const user = userEvent.setup();
    render(<ConfirmActionModal {...props} />);

    await user.click(screen.getByRole("button", { name: "Delete" }));
    await user.click(screen.getByRole("button", { name: props.buttonLabel }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("uses non-submit buttons for modal actions", async () => {
    const user = userEvent.setup();
    render(<ConfirmActionModal {...props} />);

    await user.click(screen.getByRole("button", { name: "Delete" }));

    expect(screen.getByRole("button", { name: "Cancel" })).toHaveAttribute(
      "type",
      "button"
    );
    expect(
      screen.getByRole("button", { name: props.buttonLabel })
    ).toHaveAttribute("type", "button");
  });
});
