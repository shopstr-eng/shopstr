import type { NextApiRequest, NextApiResponse } from "next";
import { HodlSettlementService } from "@/utils/nostr/hodl-settlement-service";
import { NostrManager } from "@/utils/nostr/nostr-manager";
import { getActiveSellerConfigs } from "@/utils/db/db-service";
import { applyRateLimit } from "@/utils/rate-limit";

const RELAYS = ["wss://relay.damus.io", "wss://nos.lol", "wss://relay.nostr.band", "wss://relay.primal.net"];
const nostr = new NostrManager(RELAYS);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const cronSecret = req.headers["authorization"];
  const isAuthorized = process.env.CRON_SECRET && cronSecret === `Bearer ${process.env.CRON_SECRET}`;

  if (!isAuthorized) {
      await applyRateLimit(req, res);
  }
  
  const sellers = await getActiveSellerConfigs();
  
  let processedCount = 0;

  for (const sellerConfig of sellers) {
      try {
          const service = await HodlSettlementService.createForSeller(sellerConfig, nostr);
          
          await service.init();
          processedCount++;
      } catch (e) {
          console.error(`Worker failed for ${sellerConfig.pubkey}`, e);
      }
  }

  res.status(200).json({ status: "Ran settlement checks", processed: processedCount });
}