// TODO Fix this function to be more react like where children shouldn't be a prop, func should be renamed to something like "onConfirm", and the modal should be a child of this component instead of a sibling
import React from "react";
import {
  Dropdown,
  DropdownTrigger,
  DropdownMenu,
  DropdownItem,
  DropdownSection,
} from "@nextui-org/react";

type ConfirmActionDropdownProps = {
  helpText: string;
  buttonLabel: string;
  onConfirm: () => void;
  children: React.ReactNode;
};
export default function ConfirmActionDropdown({
  helpText,
  buttonLabel,
  onConfirm,
  children,
}: ConfirmActionDropdownProps) {
  return (
    <Dropdown>
      <DropdownTrigger>{children}</DropdownTrigger>
      <DropdownMenu variant="faded" aria-label="Static Actions">
        <DropdownSection title={helpText} showDivider={true}>
          <DropdownItem
            key="delete"
            className="text-danger"
            color="danger"
            onClick={onConfirm}
          >
            {buttonLabel}
          </DropdownItem>
        </DropdownSection>
      </DropdownMenu>
    </Dropdown>
  );
}
