// @ts-nocheck
import React, { Dispatch, SetStateAction, useMemo } from "react";
import {
  Avatar,
  Autocomplete,
  AutocompleteItem,
  AutocompleteSection,
} from "@nextui-org/react";
import locations from "../../../public/locationSelection.json";
import { PiMapPinBold } from "react-icons/pi";
import { getNameToCodeMap  } from "@/utils/location/location";

<<<<<<< HEAD
export const locationAvatar = (location: string) => {
  const getLocationMap = () => {
    let countries = locations.countries.map(
      (country) => [country.country, country.iso3166] as const,
    );
    let states = locations.states.map(
      (state) => [state.state, state.iso3166] as const,
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

    let globalOptions = (
      <SelectSection
        key={"globalOptions"}
        title="Global"
        classNames={{
          heading: headingClasses,
        }}
        className="text-light-text dark:text-dark-text"
      >
        <SelectItem key={"Worldwide"}>Worldwide</SelectItem>
        <SelectItem key={"Online"}>Online</SelectItem>
      </SelectSection>
    );
    return [stateOptions, countryOptions, globalOptions];
  }, []);
=======
export const LocationAvatar = ({
  name,
  iso3166,
}: {
  name?: string;
  iso3166?: string;
}) => {
  if (!name && !iso3166) {
    return null;
  }
  const code = iso3166 || getNameToCodeMap(name as string);
  if (code == null) {
    return null;
  }
>>>>>>> af23432 (updates)

  return (
    <Avatar
      alt={name}
      className="h-6 w-6 text-light-text dark:text-dark-text"
      src={`https://flagcdn.com/${code.toLocaleLowerCase()}.svg`}
    />
  );
};

const LocationDropdown = ({
  selectedLocation,
  setSelectedLocation,
  ...props
}: {
  selectedLocation: string | null;
  setSelectedLocation?: Dispatch<SetStateAction<string | null>>;
} & { [key: string]: any }) => {
  console.log("hmm selectedLocation ", selectedLocation);
  return (
    <Autocomplete
      className="text-light-text dark:text-dark-text"
      // selectedKey={selectedLocation ? selectedLocation : null}
      onSelectionChange={(key) => {
        if (!setSelectedLocation) return;
        setSelectedLocation(key as string);
      }}
      label={"Location"}
      placeholder={"Search for a country or state"}
      startContent={<PiMapPinBold />}
      isClearable
      defaultItems={locations}
      defaultInputValue={selectedLocation}
      {...props}
    >
      {({ section, values }) => (
        <AutocompleteSection
          key={section}
          items={values}
          showDivider
          title={section}
        >
          {({ name, iso3166 }) => (
            <AutocompleteItem
              className="text-light-text dark:text-dark-text"
              startContent={
                <LocationAvatar name={name} iso3166={iso3166}></LocationAvatar>
              }
              key={name}
            >
              {name}
            </AutocompleteItem>
          )}
        </AutocompleteSection>
      )}
    </Autocomplete>
  );
};

export default LocationDropdown;
