import { ProductFormValues } from "@/pages/api/nostr/post-event";
import locations from "../../public/locationSelection.json";

let codeToNameMap: { [key: string]: string };
const buildCodeToNameMap = () => {
  const map = {};
  locations.forEach(l => l.values.forEach(v => Object.assign(map, { [v.iso3166.toLowerCase()]: v.name })))
  return map;
}
export const getCodeToNameMap = (code: string) => {
  if (!codeToNameMap) {
    codeToNameMap = buildCodeToNameMap();
  }
  return codeToNameMap[code.toLowerCase()];
}

let nameToCodeMap: { [key: string]: string };
const buildNameToCodeMap = () => {
  const map = {};
  locations.forEach(l => l.values.forEach(v => Object.assign(map, { [v.name.toUpperCase()]: v.iso3166 })))
  return map;
}
export const getNameToCodeMap = (name: string) => {
  if (!nameToCodeMap) {
    nameToCodeMap = buildNameToCodeMap();
  }
  return nameToCodeMap[name.toUpperCase()];
}

export const buildListingGeotags = ({
  iso3166,
}: {
  iso3166: string;
}) => {
  let countryCode: string;
  let countryName: string;
  let regionCode: string;
  let regionName: string;

  if (iso3166.includes("-")) {
    countryCode = iso3166.split("-")[0];
    regionCode = iso3166;
    countryName = getCodeToNameMap(countryCode);
    regionName = getCodeToNameMap(regionCode);
  } else {
    countryCode = iso3166;
    regionCode = "";
    countryName = getCodeToNameMap(countryCode);
    regionName = "";
  }
  return [
    ["G", "countryCode"],
    ["g", countryCode, "countryCode"],
    ["G", "regionCode"],
    ["g", regionCode, "regionCode"],
    ["G", "countryName"],
    ["g", countryName, "countryName"],
    ["G", "regionName"],
    ["g", regionName, "regionName"],
  ] as ProductFormValues;
};

