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
