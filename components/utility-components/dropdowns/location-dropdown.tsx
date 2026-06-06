import { useState, useMemo } from "react";
import {
  Select,
  SelectItem,
  SelectSection,
  Avatar,
  Input,
} from "@heroui/react";
import locations from "../../../public/locationSelection.json";

export const locationAvatar = (location: string) => {
  const getLocationMap = () => {
    const countries = locations.countries.map(
      (country) => [country.country, country.iso3166] as const
    );
    const states = locations.states.map(
      (state) => [state.state, state.iso3166] as const
    );
    return new Map([...countries, ...states]);
  };
  const locationMap = getLocationMap();
  return locationMap.get(location) ? (
    <Avatar
      alt={location}
      className="h-6 w-6"
      src={`https://flagcdn.com/16x12/${locationMap.get(location)}.png`}
    />
  ) : null;
};

const LocationDropdown = ({
  value,
  selectedKeys: selectedKeysProp,
  classNames,
  ...props
}: {
  [x: string]: any;
}) => {
  const [searchValue, setSearchValue] = useState("");
  const resolvedSelectedKeys =
    selectedKeysProp !== undefined ? selectedKeysProp : value ? [value] : [];
  const locationOptions = useMemo(() => {
    const headingClasses =
      "flex w-full py-1.5 px-2 bg-white text-black font-semibold shadow-small rounded-small";

    const q = searchValue.trim().toLowerCase();

    const filteredStates = locations.states.filter((state) =>
      state.state.toLowerCase().includes(q)
    );

    const filteredCountries = locations.countries.filter((country) =>
      country.country.toLowerCase().includes(q)
    );

    const regionalOptionsList = [
      "Worldwide",
      "US & Canada",
      "Europe",
      "Online",
    ];

    const filteredRegional = regionalOptionsList.filter((regional) =>
      regional.toLowerCase().includes(q)
    );

    const stateOptions =
      filteredStates.length > 0 ? (
        <SelectSection
          key={"stateOptions"}
          title="U.S. States"
          classNames={{
            heading: headingClasses,
          }}
        >
          {filteredStates.map((state) => {
            return (
              <SelectItem
                key={state.state}
                classNames={{
                  base: "text-black data-[hover=true]:!bg-primary-yellow",
                }}
              >
                {state.state}
              </SelectItem>
            );
          })}
        </SelectSection>
      ) : null;

    const countryOptions =
      filteredCountries.length > 0 ? (
        <SelectSection
          key={"countryOptions"}
          title="Countries"
          classNames={{
            heading: headingClasses,
          }}
        >
          {filteredCountries.map((country) => {
            return (
              <SelectItem
                key={country.country}
                classNames={{
                  base: "text-black data-[hover=true]:!bg-primary-yellow",
                }}
              >
                {country.country}
              </SelectItem>
            );
          })}
        </SelectSection>
      ) : null;

    const regionalOptions =
      filteredRegional.length > 0 ? (
        <SelectSection
          key={"regionalOptions"}
          title="Regional"
          classNames={{
            heading: headingClasses,
          }}
        >
          {filteredRegional.map((regional) => (
            <SelectItem
              key={regional}
              classNames={{
                base: "text-black data-[hover=true]:!bg-primary-yellow",
              }}
            >
              {regional === "US & Canada" ? "US & Canada" : regional}
            </SelectItem>
          ))}
        </SelectSection>
      ) : null;

    return [stateOptions, countryOptions, regionalOptions].filter(Boolean);
  }, [searchValue]);

  return (
    <Select
      startContent={locationAvatar(value)}
      selectedKeys={resolvedSelectedKeys}
      {...props}
      classNames={{
        ...classNames,
        trigger:
          "bg-white text-black border-4 border-black rounded-md shadow-neo h-12 data-[hover=true]:bg-white data-[open=true]:bg-white data-[focus=true]:bg-white data-[focus-visible=true]:bg-white",
        popoverContent: "bg-white border-4 border-black rounded-md",
        value: "text-black font-semibold",
        label: "text-black font-semibold",
        innerWrapper: "bg-white",
        mainWrapper: "bg-white",
        listbox: "bg-white",
      }}
      listboxProps={{
        topContent: (
          <Input
            aria-label="Search location"
            className="mb-1 px-1 py-1"
            value={searchValue}
            onValueChange={setSearchValue}
            placeholder="Search location..."
            type="text"
            startContent={
              <span aria-hidden="true" className="text-sm leading-none">
                🔍
              </span>
            }
            classNames={{
              input: "text-black placeholder:text-gray-400",
              inputWrapper:
                "border-2 border-black rounded-md bg-white data-[hover=true]:bg-white group-data-[focus=true]:bg-white",
            }}
            onKeyDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          />
        ),
      }}
    >
      {locationOptions}
    </Select>
  );
};

export default LocationDropdown;
