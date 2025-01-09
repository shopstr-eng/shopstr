import type { NextApiRequest, NextApiResponse } from "next";
import { CashuMint, CashuWallet } from "@cashu/cashu-ts";
import { DateTime } from "luxon";
import { v4 as uuid } from "uuid";
import repo from "../../../utils/metrics/repo";

const requestMint = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== "POST") {
    return res.status(405).json({});
  }

  try {
    const { mintUrl, total, currency } = req.body;

    const wallet = new CashuWallet(new CashuMint(mintUrl));

    const { request, quote } = await wallet.createMintQuote(total);

    const id = uuid();

    await repo()("invoices").insert({
      id,
      date_time: DateTime.now().toUTC().toSQL(),
      total,
      currency,
      hash: quote,
    });
    return res.status(200).json({ pr: request, hash: quote, id });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error });
  }
};

export default requestMint;
