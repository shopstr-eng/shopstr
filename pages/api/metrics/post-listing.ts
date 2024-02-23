import type { NextApiRequest, NextApiResponse } from "next";
import { DateTime } from "luxon";
import { v4 as uuid } from "uuid";
import repo from "../../../utils/metrics/repo";
import { getLocationFromAddress, locationToSqlGeo } from "@/utils/metrics/geo";

const parseRequestBody = (body: string) => {
  const parsedBody = typeof body === "string" ? JSON.parse(body) : body;
  return parsedBody;
};

const PostListing = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== "POST") {
    return res.status(405).json({});
  }

  const event = parseRequestBody(req.body);

  try {
    await repo()("listings").insert({
      id: uuid(),
      listing_id: event.listing_id,
      date_time: DateTime.now().toUTC().toSQL(),
      merchant_id: event.merchant_id,
      merchant_location: locationToSqlGeo(
        await getLocationFromAddress(event.merchant_location),
      ),
      relays: event.relays,
    });
  } catch (error: any) {
    console.error(error);
  }
  return res.status(201).json({});
};

export default PostListing;
