import { NextApiRequest } from "next";
import NodeGeocoder from "node-geocoder";
import geoip from "fast-geoip";
geoip.enableCache();

export const getLocationFromReqHeaders = async (
  headers: NextApiRequest["headers"],
) => {
  try {
    if (headers["origin"] === "http://localhost:3000") return null;
    let ip = headers["x-real-ip"] as string;
    const forwardedFor = headers["x-forwarded-for"] as string;
    if (!ip && forwardedFor) {
      ip = forwardedFor?.split(",").at(0) ?? "Unknown";
    }
    const res = await geoip.lookup(ip);
    if (!res) return null;
    return { latitude: res.ll[0], longitude: res.ll[1] };
  } catch (_) {
    return null;
  }
};

export const getLocationFromAddress = async (address: string) => {
  try {
    const options: NodeGeocoder.Options = {
      provider: "opencage",
      apiKey: process.env["OPENCAGE_API_KEY"],
    };
    const geocoder = NodeGeocoder(options);
    const res = await geocoder.geocode({ address, limit: 1 });
    if (!res[0].latitude || !res[0].longitude) return null;
    return { latitude: res[0].latitude, longitude: res[0].longitude };
  } catch (_) {
    return null;
  }
};

export const locationToSqlGeo = (
  location: { latitude: number; longitude: number } | null,
) => {
  if (!location) return null;
  return `SRID=4326;POINT(${location.longitude} ${location.latitude})`;
};
