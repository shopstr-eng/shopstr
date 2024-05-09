import type { NextApiRequest, NextApiResponse } from "next";
import { DateTime } from "luxon";
import { v4 as uuid } from "uuid";
import { CashuMint, CashuWallet } from "@cashu/cashu-ts";
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

const UpdateInvoice = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== "POST") {
    return res.status(405).json({});
  }

  const event = parseRequestBody(req.body);

  const wallet = new CashuWallet(new CashuMint(event.mint));

  if (!event.id || !event.listing_id) {
    return res.status(400).json({});
  }

  const response = await repo()("invoices").select("*").where({ id: event.id });
  if (!response || response.length === 0) return res.status(404).json({});
  const {
    total,
    sub_total,
    tip_total,
    shipping_total,
    discount_total,
    fee_total,
    tax_total,
    currency,
    hash,
  } = response[0];

  try {
    await wallet.requestTokens(total, hash);
  } catch (error: any) {
    console.error(error);
    if (error.message.includes("quote already issued")) {
      await repo()("transactions").insert({
        id: uuid(),
        date_time: DateTime.now().toUTC().toSQL(),
        total,
        sub_total,
        tip_total,
        shipping_total,
        discount_total,
        fee_total,
        tax_total,
        currency,
        merchant_id: event.merchant_id,
        listing_id: event.listing_id,
        funding_source: "ln",
        customer_location: locationToSqlGeo(
          await getLocationFromReqHeaders(req.headers),
        ),
        merchant_location: locationToSqlGeo(
          await getLocationFromAddress(event.merchant_location),
        ),
      });
      return res.status(200).json({});
    }
    throw error;
  }
  return res.status(201).json({});
};

export default UpdateInvoice;
