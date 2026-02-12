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
    <Dropdown
      classNames={{
        content:
          "border border-zinc-800 bg-[#161616] p-1 rounded-xl shadow-xl min-w-[200px] max-w-[90vw]",
      }}
    >
      <DropdownTrigger>{children}</DropdownTrigger>
      <DropdownMenu variant="flat" aria-label="Confirm Action">
        <DropdownSection
          title={helpText}
          showDivider={true}
          classNames={{
            heading:
              "text-zinc-500 font-bold uppercase tracking-wider text-[10px] md:text-xs px-2 py-2 whitespace-normal",
            divider: "bg-zinc-800",
          }}
        >
          <DropdownItem
            key="delete"
            className="rounded-lg text-danger data-[hover=true]:bg-red-500/10 data-[hover=true]:text-red-500"
            color="danger"
            onPress={onConfirm}
          >
            {buttonLabel}
          </DropdownItem>
        </DropdownSection>
      </DropdownMenu>
    </Dropdown>
  );
}
