import React, { useMemo } from "react";
import { Select, SelectItem, SelectSection } from "@nextui-org/react";
import locations from "../../../public/locationSelection.json";

const CountryDropdown = ({ value, ...props }: { [x: string]: any }) => {
  const countryOptions = useMemo(() => {
    const headingClasses =
      "flex w-full sticky top-1 z-20 py-1.5 px-2 dark:bg-dark-bg bg-light-bg shadow-small rounded-small";

    let countryOptions = (
      <SelectSection
        key={"countryOptions"}
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
    <Select {...props} className="mt-2 text-light-text dark:text-dark-text">
      {countryOptions}
    </Select>
  );
};

export default CountryDropdown;
