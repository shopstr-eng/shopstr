import { useMemo } from "react";
import { Select, SelectItem, SelectSection } from "@heroui/react";
import locations from "../../../public/locationSelection.json";

const CountryDropdown = ({ _value, ...props }: { [x: string]: any }) => {
  const countryOptions = useMemo(() => {
    const headingClasses =
      "sticky top-1 z-20 flex w-full rounded-small border border-zinc-800 bg-[#111] px-2 py-1.5 shadow-small";

    const countryOptions = (
      <SelectSection
        key={"countryOptions"}
        classNames={{
          heading: headingClasses,
        }}
        className="text-white"
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
      className="mt-2 text-white"
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
