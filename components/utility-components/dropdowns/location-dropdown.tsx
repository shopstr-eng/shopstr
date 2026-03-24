import { useMemo } from "react";
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

const LocationDropdown = ({
  value,
  classNames,
  ...props
}: {
  [x: string]: any;
}) => {
  const locationOptions = useMemo(() => {
    const headingClasses =
      "flex w-full sticky top-1 z-20 py-1.5 px-2 bg-white text-black font-semibold shadow-small rounded-small";

    const countryOptions = (
      <SelectSection
        key={"countryOptions"}
        title="Countries"
        classNames={{
          heading: headingClasses,
        }}
      >
        {locations.countries.map((country) => {
          return (
            <SelectItem
              key={country.country}
              classNames={{
                base: "text-black data-[hover=true]:!bg-primary-yellow",
              }}
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
      >
        {locations.states.map((state) => {
          return (
            <SelectItem
              key={state.state}
              classNames={{
                base: "text-black data-[hover=true]:!bg-primary-yellow",
              }}
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
      >
        <SelectItem
          key={"Worldwide"}
          classNames={{
            base: "text-black data-[hover=true]:!bg-primary-yellow",
          }}
        >
          Worldwide
        </SelectItem>
        <SelectItem
          key={"US & Canada"}
          classNames={{
            base: "text-black data-[hover=true]:!bg-primary-yellow",
          }}
        >
          US &amp; Canada
        </SelectItem>
        <SelectItem
          key={"Europe"}
          classNames={{
            base: "text-black data-[hover=true]:!bg-primary-yellow",
          }}
        >
          Europe
        </SelectItem>
        <SelectItem
          key={"Online"}
          classNames={{
            base: "text-black data-[hover=true]:!bg-primary-yellow",
          }}
        >
          Online
        </SelectItem>
      </SelectSection>
    );
    return [stateOptions, countryOptions, regionalOptions];
  }, []);

  return (
    <Select
      startContent={locationAvatar(value)}
      {...props}
      classNames={{
        ...classNames,
        trigger:
          "bg-white text-black border-4 border-black rounded-md shadow-neo h-12 data-[hover=true]:bg-white data-[open=true]:bg-white data-[focus=true]:bg-white data-[focus-visible=true]:bg-white",
        popoverContent: "bg-white border-4 border-black rounded-md",
        value: "text-black font-semibold",
        label: "text-black font-semibold",
        innerWrapper: "bg-white",
        mainWrapper: "bg-white",
        listbox: "bg-white",
      }}
    >
      {locationOptions}
    </Select>
  );
};

export default LocationDropdown;
