import { useMemo } from "react";
import { Select, SelectItem, SelectSection } from "@heroui/react";
import locations from "../../../public/locationSelection.json";

const CountryDropdown = ({ _value, ...props }: { [x: string]: any }) => {
  const countryOptions = useMemo(() => {
    const headingClasses =
      "flex w-full sticky top-1 z-20 py-1.5 px-2 dark:bg-zinc-900 bg-white shadow-small rounded-small";

    const countryOptions = (
      <SelectSection
        key={"countryOptions"}
        classNames={{
          heading: headingClasses,
        }}
        className="text-light-text dark:text-dark-text"
      >
        {locations.countries.map((country) => {
          return (
            <SelectItem key={country.country}>{country.country}</SelectItem>
          );
        })}
      </SelectSection>
    );
    return [countryOptions];
  }, []);

  return (
    <Select
      {...props}
      className="text-light-text dark:text-dark-text mt-2"
      classNames={{
        trigger: "h-12",
        value: "text-base",
      }}
    >
      {countryOptions}
    </Select>
  );
};

export default CountryDropdown;
