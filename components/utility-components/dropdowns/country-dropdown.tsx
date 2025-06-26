import React, { useMemo } from "react";
import { Select, SelectItem, SelectSection } from "@nextui-org/react";
import locations from "../../../public/locationSelection.json";

const CountryDropdown = ({ _value, ...props }: { [x: string]: any }) => {
  const countryOptions = useMemo(() => {
    const headingClasses =
      "flex w-full sticky top-1 z-20 py-1.5 px-2 bg-light-bg shadow-small rounded-small";

    const countryOptions = (
      <SelectSection
        key={"countryOptions"}
        classNames={{
          heading: headingClasses,
        }}
        className="text-dark-text"
      >
        {locations.countries.map((country) => {
          return (
            <SelectItem
              key={country.country}
              classNames={{
                wrapper: "bg-light-bg",
              }}
              value={country.country}
            >
              {country.country}
            </SelectItem>
          );
        })}
      </SelectSection>
    );
    return [countryOptions];
  }, []);

  return (
    <Select {...props} className="mt-2 text-dark-text">
      {countryOptions}
    </Select>
  );
};

export default CountryDropdown;
