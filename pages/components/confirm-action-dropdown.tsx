import React from "react";
import {
  Dropdown,
  DropdownTrigger,
  DropdownMenu,
  DropdownItem,
  DropdownSection,
} from "@nextui-org/react";

export default function ConfirmActionDropdown({
  children,
  header,
  label,
  func,
}) {
  return (
    <Dropdown backdrop="blur">
      <DropdownTrigger>{children}</DropdownTrigger>
      <DropdownMenu variant="faded" aria-label="Static Actions">
        <DropdownSection title={header} showDivider={true}></DropdownSection>
        <DropdownItem
          key="delete"
          className="text-danger"
          color="danger"
          onClick={func}
        >
          {label}
        </DropdownItem>
      </DropdownMenu>
    </Dropdown>
  );
}
