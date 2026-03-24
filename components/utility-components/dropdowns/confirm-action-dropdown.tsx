// TODO Fix this function to be more react like where children shouldn't be a prop, func should be renamed to something like "onConfirm", and the modal should be a child of this component instead of a sibling
import type React from "react";
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
    <Dropdown
      classNames={{
        content: "bg-white border-4 border-black rounded-md shadow-neo",
      }}
    >
      <DropdownTrigger>{children}</DropdownTrigger>
      <DropdownMenu
        variant="flat"
        aria-label="Confirm Action"
        classNames={{
          base: "text-black",
        }}
      >
        <DropdownSection
          title={helpText}
          showDivider={true}
          classNames={{
            heading: "text-black font-semibold",
          }}
        >
          <DropdownItem
            key="delete"
            className="font-bold text-red-500 data-[hover=true]:bg-red-50"
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
