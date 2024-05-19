import type { NextApiRequest, NextApiResponse } from "next";
import { DateTime } from "luxon";
import { v4 as uuid } from "uuid";
import repo from "../../../utils/metrics/repo";
import {
  locationToSqlGeo,
  getLocationFromReqHeaders,
  getLocationFromAddress,
} from "@/utils/metrics/geo";

const parseRequestBody = (body: string) => {
  const parsedBody = typeof body === "string" ? JSON.parse(body) : body;
  return parsedBody;
};

const CreateCashuPaidStatus = async (
  req: NextApiRequest,
  res: NextApiResponse,
) => {
  if (req.method !== "POST") {
    return res.status(405).json({});
  }

  const event = parseRequestBody(req.body);

  await repo()("transactions").insert({
    id: uuid(),
    date_time: DateTime.now().toUTC().toSQL(),
    total: event.total,
    sub_total: event.sub_total,
    tip_total: event.tip_total,
    shipping_total: event.shipping_total,
    discount_total: event.discount_total,
    fee_total: event.fee_total,
    tax_total: event.tax_total,
    currency: event.currency,
    merchant_id: event.merchant_id,
    listing_id: event.listing_id,
    funding_source: "cashu",
    customer_location: locationToSqlGeo(
      await getLocationFromReqHeaders(req.headers),
    ),
    merchant_location: locationToSqlGeo(
      await getLocationFromAddress(event.merchant_location),
    ),
  });
  return res.status(200).json({});
};

export default CreateCashuPaidStatus;
