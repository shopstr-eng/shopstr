import React, { useMemo, useRef, useEffect, useState } from "react";
import { Select, SelectItem, SelectSection, Avatar } from "@nextui-org/react";
import locations from "../../public/locationSelection.json";

const LocationDropdown = ({ value, ...props }) => {
  const locationOptions = useMemo(() => {
    const headingClasses =
      "flex w-full sticky top-1 z-20 py-1.5 px-2 bg-default-100 shadow-small rounded-small";

    let countryOptions = (
      <SelectSection
        title="Countries"
        classNames={{
          heading: headingClasses,
        }}
      >
        {locations.countries.map((country) => {
          return (
            <SelectItem
              key={country.country}
              startContent={
                <Avatar
                  alt={country.country}
                  className="w-6 h-6"
                  src={`https://flagcdn.com/16x12/${country.iso3166}.png`}
                />
              }
            >
              {country.country}
            </SelectItem>
          );
        })}
      </SelectSection>
    );

    let stateOptions = (
      <SelectSection
        title="U.S. States"
        classNames={{
          heading: headingClasses,
        }}
      >
        {locations.states.map((state) => {
          return (
            <SelectItem
              key={state.state}
              startContent={
                <Avatar
                  alt={state.state}
                  className="w-6 h-6"
                  src={`https://flagcdn.com/16x12/${state.iso3166}.png`}
                />
              }
            >
              {state.state}
            </SelectItem>
          );
        })}
      </SelectSection>
    );
    return [stateOptions, countryOptions];
  }, []);

  const locationMap = useMemo(() => {
    let countries = locations.countries.map((country) => [
      country.country,
      country,
    ]);
    let states = locations.states.map((state) => [state.state, state]);
    return new Map([...countries, ...states]);
  }, []);

  let startContent = locationMap.get(location) ? (
    <Avatar
      alt={value}
      className="w-6 h-6"
      src={`https://flagcdn.com/16x12/${locationMap.get(location)
        ?.iso3166}.png`}
    />
  ) : null;
  return (
    <Select startContent={startContent} {...props}>
      {locationOptions}
    </Select>
  );
};

export default LocationDropdown;
