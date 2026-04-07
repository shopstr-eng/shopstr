import type { NextApiRequest, NextApiResponse } from "next";
import {
  addDiscountCode,
  getDiscountCodesByPubkey,
  validateDiscountCode,
  deleteDiscountCode,
} from "@/utils/db/db-service";
import {
  buildDiscountCodeCreateProof,
  buildDiscountCodeDeleteProof,
  buildDiscountCodesListProof,
  extractSignedEventFromRequest,
  verifySignedHttpRequestProof,
} from "@/utils/nostr/request-auth";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method === "POST") {
    try {
      const { code, pubkey, discountPercentage, expiration, maxUses } =
        req.body;

      if (!code || !pubkey || !discountPercentage) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      const signedEvent = extractSignedEventFromRequest(req);
      const verification = verifySignedHttpRequestProof(
        signedEvent,
        buildDiscountCodeCreateProof({
          code,
          pubkey,
          discountPercentage,
          expiration,
        })
      );

      if (!verification.ok) {
        return res
          .status(verification.status)
          .json({ error: verification.error });
      }

      await addDiscountCode(
        code,
        pubkey,
        discountPercentage,
        expiration,
        maxUses
      );
      res.status(200).json({ success: true });
    } catch (error) {
      console.error("Failed to add discount code:", error);
      res.status(500).json({ error: "Failed to add discount code" });
    }
  } else if (req.method === "GET") {
    try {
      const { pubkey, code, validate } = req.query;

      if (validate && code && pubkey) {
        const result = await validateDiscountCode(
          code as string,
          pubkey as string
        );
        return res.status(200).json(result);
      }

      if (!pubkey) {
        return res.status(400).json({ error: "Pubkey required" });
      }

      const signedEvent = extractSignedEventFromRequest(req);
      const verification = verifySignedHttpRequestProof(
        signedEvent,
        buildDiscountCodesListProof(pubkey as string)
      );

      if (!verification.ok) {
        return res
          .status(verification.status)
          .json({ error: verification.error });
      }

      const codes = await getDiscountCodesByPubkey(pubkey as string);
      res.status(200).json(codes);
    } catch (error) {
      console.error("Failed to fetch discount codes:", error);
      res.status(500).json({ error: "Failed to fetch discount codes" });
    }
  } else if (req.method === "DELETE") {
    try {
      const { code, pubkey } = req.body;

      if (!code || !pubkey) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      const signedEvent = extractSignedEventFromRequest(req);
      const verification = verifySignedHttpRequestProof(
        signedEvent,
        buildDiscountCodeDeleteProof({ code, pubkey })
      );

      if (!verification.ok) {
        return res
          .status(verification.status)
          .json({ error: verification.error });
      }

      await deleteDiscountCode(code, pubkey);
      res.status(200).json({ success: true });
    } catch (error) {
      console.error("Failed to delete discount code:", error);
      res.status(500).json({ error: "Failed to delete discount code" });
    }
  } else {
    res.status(405).json({ error: "Method not allowed" });
  }
}
