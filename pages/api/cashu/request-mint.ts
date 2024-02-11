import type { NextApiRequest, NextApiResponse } from "next";
import { CashuMint, CashuWallet, getEncodedToken } from "@cashu/cashu-ts";
import { DateTime } from "luxon";
import { v4 as uuid } from "uuid";
import repo from "../../../utils/repo";

const wallet = new CashuWallet(
  new CashuMint(
    "https://legend.lnbits.com/cashu/api/v1/4gr9Xcmz3XEkUNwiBiQGoC",
  ),
);

const requestMint = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== "POST") {
    return res.status(405).json({});
  }

  try {
    const { total, currency } = req.body;

    const { pr, hash } = await wallet.requestMint(total);

    const id = uuid();

    await repo()("invoices").insert({
      id,
      date_time: DateTime.now().toUTC().toSQL(),
      total,
      currency,
      hash,
    });
    return res.status(200).json({ pr, hash, id });
  } catch (error) {
    console.error(error);
    return res.status(500).json({});
  }
};

export default requestMint;
