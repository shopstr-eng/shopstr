import { useMemo } from "react";
import { Select, SelectItem, SelectSection } from "@nextui-org/react";
import locations from "../../../public/locationSelection.json";

const CountryDropdown = ({
  _value,
  classNames,
  ...props
}: {
  [x: string]: any;
}) => {
  const countryOptions = useMemo(() => {
    const headingClasses =
      "flex w-full sticky top-1 z-20 py-1.5 px-2 bg-white text-black font-semibold shadow-small rounded-small";

    const countryOptions = (
      <SelectSection
        key={"countryOptions"}
        classNames={{
          heading: headingClasses,
        }}
      >
        {locations.countries.map((country) => {
          return (
            <SelectItem
              key={country.country}
              classNames={{
                base: "text-black data-[hover=true]:bg-gray-100",
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
    <Select
      {...props}
      classNames={{
        trigger:
          classNames?.trigger ||
          "bg-white text-black border-2 border-black rounded-md shadow-neo",
        popoverContent: "bg-white border-2 border-black rounded-md",
        value: classNames?.value || "!text-black font-normal",
        label: classNames?.label || "text-gray-600 font-normal",
        innerWrapper: classNames?.innerWrapper || "!bg-white",
        ...(classNames || {}),
      }}
    >
      {countryOptions}
    </Select>
  );
};

export default CountryDropdown;
