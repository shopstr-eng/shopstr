import React, { useMemo } from "react";
import { Select, SelectItem, SelectSection, Avatar } from "@nextui-org/react";
import locations from "../../../../public/locationSelection.json";

export const locationAvatar = (location: string) => {
  const getLocationMap = () => {
    let countries = locations.countries.map((country) => [
      country.country,
      country,
    ]);
    let states = locations.states.map((state) => [state.state, state]);
    return new Map([...countries, ...states]);
  };
  const locationMap = getLocationMap();
  return locationMap.get(location) ? (
    <Avatar
      alt={location}
      className="h-6 w-6"
      src={`https://flagcdn.com/16x12/${locationMap.get(location)
        ?.iso3166}.png`}
    />
  ) : null;
};

const LocationDropdown = ({ value, ...props }) => {
  const locationMap = useMemo(() => {
    let countries = locations.countries.map((country) => [
      country.country,
      country,
    ]);
    let states = locations.states.map((state) => [state.state, state]);
    return new Map([...countries, ...states]);
  }, []);

  const locationOptions = useMemo(() => {
    const headingClasses =
      "flex w-full sticky top-1 z-20 py-1.5 px-2 dark:bg-dark-bg bg-light-bg shadow-small rounded-small";

    let countryOptions = (
      <SelectSection
        key={"countryOptions"}
        title="Countries"
        classNames={{
          heading: headingClasses,
        }}
        className="text-light-text dark:text-dark-text"
      >
        {locations.countries.map((country, index) => {
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

    let stateOptions = (
      <SelectSection
        key={"stateOptions"}
        title="U.S. States"
        classNames={{
          heading: headingClasses,
        }}
        className="text-light-text dark:text-dark-text"
      >
        {locations.states.map((state, index) => {
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
    return [stateOptions, countryOptions];
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
