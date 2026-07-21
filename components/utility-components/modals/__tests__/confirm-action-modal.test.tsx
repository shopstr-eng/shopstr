import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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
    isDisabled,
    isLoading,
  }: {
    children: React.ReactNode;
    onPress?: () => void;
    onClick?: () => void;
    color?: string;
    type?: "button" | "submit" | "reset";
    isDisabled?: boolean;
    isLoading?: boolean;
  }) => (
    <button
      data-color={color}
      type={type}
      disabled={isDisabled || isLoading}
      onClick={onPress ?? onClick}
    >
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

  it("does not open when the trigger prevents default", async () => {
    const user = userEvent.setup();

    render(
      <ConfirmActionModal {...props}>
        <button onClick={(e) => e.preventDefault()}>Delete</button>
      </ConfirmActionModal>
    );

    await user.click(screen.getByRole("button", { name: "Delete" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("does not open when the trigger is disabled via isDisabled", async () => {
    const user = userEvent.setup();

    const TriggerStub = ({
      onClick,
      children,
    }: {
      isDisabled?: boolean;
      onClick?: React.MouseEventHandler<HTMLButtonElement>;
      children: React.ReactNode;
    }) => <button onClick={onClick}>{children}</button>;

    render(
      <ConfirmActionModal {...props}>
        <TriggerStub isDisabled>Delete</TriggerStub>
      </ConfirmActionModal>
    );

    await user.click(screen.getByRole("button", { name: "Delete" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("does not open when the trigger is disabled via the disabled prop", async () => {
    const user = userEvent.setup();

    const TriggerStub = ({
      onClick,
      children,
    }: {
      disabled?: boolean;
      onClick?: React.MouseEventHandler<HTMLButtonElement>;
      children: React.ReactNode;
    }) => <button onClick={onClick}>{children}</button>;

    render(
      <ConfirmActionModal {...props}>
        <TriggerStub disabled>Delete</TriggerStub>
      </ConfirmActionModal>
    );

    await user.click(screen.getByRole("button", { name: "Delete" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("awaits an async onConfirm before closing", async () => {
    const user = userEvent.setup();
    const asyncOnConfirm = jest.fn().mockResolvedValue(undefined);

    render(<ConfirmActionModal {...props} onConfirm={asyncOnConfirm} />);

    await user.click(screen.getByRole("button", { name: "Delete" }));
    await user.click(screen.getByRole("button", { name: props.buttonLabel }));

    expect(asyncOnConfirm).toHaveBeenCalledTimes(1);
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    );
  });

  it("disables the confirm button and guards against double-fire while onConfirm is pending", async () => {
    const user = userEvent.setup();
    let resolveConfirm: () => void = () => {};
    const asyncOnConfirm = jest.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveConfirm = resolve;
        })
    );

    render(<ConfirmActionModal {...props} onConfirm={asyncOnConfirm} />);

    await user.click(screen.getByRole("button", { name: "Delete" }));
    await user.click(screen.getByRole("button", { name: props.buttonLabel }));

    expect(asyncOnConfirm).toHaveBeenCalledTimes(1);

    const confirmButton = screen.getByRole("button", {
      name: props.buttonLabel,
    });
    expect(confirmButton).toBeDisabled();

    fireEvent.click(confirmButton);
    expect(asyncOnConfirm).toHaveBeenCalledTimes(1);

    resolveConfirm();
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    );
  });
});
