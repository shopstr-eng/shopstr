import React, { Dispatch, SetStateAction, useMemo } from "react";
import { Select, SelectItem, SelectSection } from "@nextui-org/react";
import { CATEGORIES } from "@/components/utility/STATIC-VARIABLES";
import { Squares2X2Icon } from "@heroicons/react/24/outline";

export const CategoryDropdown = ({
  selectedCategories,
  setSelectedCategories,
  ...props
}: {
  selectedCategories: Set<string>;
  setSelectedCategories?: Dispatch<SetStateAction<Set<string>>>;
} & { [key: string]: any }) => {
  return (
    <Select
      className="text-light-text dark:text-dark-text"
      label="Categories"
      placeholder="Select categories"
      selectedKeys={selectedCategories}
      startContent={<Squares2X2Icon className="h-4 w-4" />}
      onChange={(event) => {
        if (!setSelectedCategories) return;
        if (event.target.value === "") {
          setSelectedCategories(new Set<string>([]));
        } else {
          setSelectedCategories(new Set<string>(event.target.value.split(",")));
        }
      }}
      selectionMode="multiple"
      {...props}
    >
      <SelectSection className="text-light-text dark:text-dark-text">
        {CATEGORIES.map(({ name, icon }) => (
          <SelectItem value={name} key={name} startContent={icon}>
            {name}
          </SelectItem>
        ))}
      </SelectSection>
    </Select>
  );
};

export default CategoryDropdown;
