import React, { Dispatch, SetStateAction } from "react";
import { Input } from "@nextui-org/react";
import {
  MagnifyingGlassIcon,
} from "@heroicons/react/24/outline";
import CategoryDropdown from "./dropdowns/category-dropdown";

export const Search = ({
  searchQuery,
  setSearchQuery,
  ...props
}: {
    searchQuery: string;
    setSearchQuery?: Dispatch<SetStateAction<string>>;
} & { [key: string]: any }) => {
  return (
    <Input
      className="text-light-text dark:text-dark-text"
      isClearable
      label="Listings"
      placeholder="Type to search..."
      value={searchQuery}
      startContent={<MagnifyingGlassIcon height={"1em"} />}
      onChange={(event) => {
        if (!setSearchQuery) return;
        const value = event.target.value;
        setSearchQuery(value);
      }}
      onClear={() => {
        if (!setSearchQuery) return;
        setSearchQuery("");
      }}
      {...props}
    ></Input>
  );
};

export default CategoryDropdown;
