import React, { useMemo } from "react";
import { Select, SelectItem, SelectSection, Avatar } from "@nextui-org/react";
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
  const locationOptions = useMemo(() => {
    const headingClasses =
      "flex w-full sticky top-1 z-20 py-1.5 px-2 dark:bg-dark-bg bg-light-bg shadow-small rounded-small";

    const countryOptions = (
      <SelectSection
        key={"countryOptions"}
        title="Countries"
        classNames={{
          heading: headingClasses,
        }}
        className="text-light-text dark:text-dark-text"
      >
        {locations.countries.map((country) => {
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
    );

    const stateOptions = (
      <SelectSection
        key={"stateOptions"}
        title="U.S. States"
        classNames={{
          heading: headingClasses,
        }}
        className="text-light-text dark:text-dark-text"
      >
        {locations.states.map((state) => {
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
    );

    const regionalOptions = (
      <SelectSection
        key={"regionalOptions"}
        title="Regional"
        classNames={{
          heading: headingClasses,
        }}
        className="text-light-text dark:text-dark-text"
      >
        <SelectItem key={"Worldwide"}>Worldwide</SelectItem>
        <SelectItem key={"US & Canada"}>US &amp; Canada</SelectItem>
        <SelectItem key={"Europe"}>Europe</SelectItem>
        <SelectItem key={"Online"}>Online</SelectItem>
      </SelectSection>
    );
    return [regionalOptions, countryOptions, stateOptions];
  }, []);

  return (
    <Select
      startContent={locationAvatar(value)}
      {...props}
      className="mt-2 text-light-text dark:text-dark-text"
    >
      {locationOptions}
    </Select>
  );
};

export default LocationDropdown;
