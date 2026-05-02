import { useState, useMemo } from "react";
import {
  Select,
  SelectItem,
  SelectSection,
  Avatar,
  Input,
} from "@heroui/react";
import { MagnifyingGlassIcon } from "@heroicons/react/24/outline";
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

const LocationDropdown = ({ value, ...props }: { [x: string]: any }) => {
  const [searchValue, setSearchValue] = useState("");

  const locationOptions = useMemo(() => {
    const headingClasses =
      "flex w-full py-1.5 px-2 dark:bg-dark-bg bg-light-bg shadow-small rounded-small";

    const q = searchValue.trim().toLowerCase();

    const filteredCountries = locations.countries.filter((country) =>
      country.country.toLowerCase().includes(q)
    );

    const filteredStates = locations.states.filter((state) =>
      state.state.toLowerCase().includes(q)
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

    const mappedCountryOptions =
      filteredCountries.length > 0 ? (
        <SelectSection
          key={"countryOptions"}
          title="Countries"
          classNames={{
            heading: headingClasses,
          }}
          className="text-light-text dark:text-dark-text"
        >
          {filteredCountries.map((country) => {
            return (
              <SelectItem
                key={country.country}
                classNames={{
                  wrapper: "dark:bg-dark-bg bg-dark-bg",
                }}
                // startContent={
                //   <Avatar
                //     alt={country.country}
                //     className="h-6 w-6"
                //     src={`https://flagcdn.com/16x12/${country.iso3166}.png`}
                //   />
                // }
              >
                {country.country}
              </SelectItem>
            );
          })}
        </SelectSection>
      ) : null;

    const mappedStateOptions =
      filteredStates.length > 0 ? (
        <SelectSection
          key={"stateOptions"}
          title="U.S. States"
          classNames={{
            heading: headingClasses,
          }}
          className="text-light-text dark:text-dark-text"
        >
          {filteredStates.map((state) => {
            return (
              <SelectItem
                key={state.state}
                // startContent={
                //   <Avatar
                //     alt={state.state}
                //     className="h-6 w-6"
                //     src={`https://flagcdn.com/16x12/${state.iso3166}.png`}
                //   />
                // }
              >
                {state.state}
              </SelectItem>
            );
          })}
        </SelectSection>
      ) : null;

    const mappedRegionalOptions =
      filteredRegional.length > 0 ? (
        <SelectSection
          key={"regionalOptions"}
          title="Regional"
          classNames={{
            heading: headingClasses,
          }}
          className="text-light-text dark:text-dark-text"
        >
          {filteredRegional.map((regional) => (
            <SelectItem key={regional}>{regional}</SelectItem>
          ))}
        </SelectSection>
      ) : null;

    return [
      mappedRegionalOptions,
      mappedCountryOptions,
      mappedStateOptions,
    ].filter(Boolean) as JSX.Element[];
  }, [searchValue]);

  return (
    <Select
      startContent={locationAvatar(value)}
      {...props}
      className={`text-light-text dark:text-dark-text mt-2 ${props.className ?? ""}`}
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
              <MagnifyingGlassIcon
                aria-hidden="true"
                className="text-default-400 h-4 w-4"
              />
            }
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
