import type { NextApiRequest, NextApiResponse } from "next";
import { HodlSettlementService } from "@/utils/nostr/hodl-settlement-service";
import { NostrManager } from "@/utils/nostr/nostr-manager";
import { getDbPool } from "@/utils/db/db-service";
import { applyRateLimit } from "@/utils/rate-limit";

const DEFAULT_RELAYS = [
    "wss://relay.damus.io", 
    "wss://nos.lol", 
    "wss://relay.nostr.band", 
    "wss://relay.primal.net",
    "wss://purplepag.es" 
];

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  await applyRateLimit(req, res);

  if (req.method !== "POST") return res.status(405).end();

  const { merchantPubkey } = req.body;
  if (!merchantPubkey) return res.status(400).json({ error: "Missing merchantPubkey" });

  try {
    const db = getDbPool();
    
    const configRes = await db.query(
        `SELECT * FROM seller_cloud_configs WHERE pubkey = $1 AND status = 'active'`, 
        [merchantPubkey]
    );
    
    if (configRes.rows.length === 0) {
        console.warn(`Trigger attempted for inactive merchant: ${merchantPubkey}`);
        return res.status(404).json({ error: "Merchant bot not active" });
    }

    const nostr = new NostrManager(DEFAULT_RELAYS);
    
    await new Promise(resolve => setTimeout(resolve, 1000));

    const service = await HodlSettlementService.createForSeller(configRes.rows[0], nostr);
    await service.init(); 

    res.status(200).json({ success: true });
  } catch (e) {
    console.error("Trigger failed:", e);
    res.status(500).json({ error: "Internal processing error" });
  }
}