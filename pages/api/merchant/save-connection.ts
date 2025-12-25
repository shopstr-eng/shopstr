import type { NextApiRequest, NextApiResponse } from "next";
import { saveMerchantConnection } from "@/utils/db/db-service";
import { encryptForServer } from "@/utils/encryption";
import { applyRateLimit } from "@/utils/rate-limit";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  await applyRateLimit(req, res);
  
  if (req.method !== "POST") return res.status(405).end();

  const { pubkey, nwcString, privKey } = req.body;

  if (!pubkey || !nwcString || !privKey) {
    return res.status(400).json({ error: "Missing credentials" });
  }

  try {
    const encNwc = encryptForServer(nwcString);
    const encPriv = encryptForServer(privKey);

    await saveMerchantConnection(pubkey, encNwc, encPriv);
    
    res.status(200).json({ success: true });
  } catch (error) {
    console.error("Save config failed:", error);
    res.status(500).json({ error: "Internal Error" });
  }
}