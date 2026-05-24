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
import { applyRateLimit } from "@/utils/rate-limit";

// Low-volume CRUD for sellers; validation reads (GET with code+pubkey) sit
// on the buyer checkout path, so the limit is generous enough to cover a
// burst of cart adjustments.
const RATE_LIMIT = { limit: 120, windowMs: 60 * 1000 };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (!applyRateLimit(req, res, "discount-codes", RATE_LIMIT)) return;

  if (req.method === "POST") {
    try {
      const {
        code,
        pubkey,
        discountPercentage,
        expiration,
        maxUses,
        shippingDiscountType,
        shippingDiscountValue,
      } = req.body;

      // A code must offer *something* — either a product percentage or a
      // shipping discount. A code with neither would silently no-op at
      // checkout, so reject it at the API boundary.
      const pct = Number(discountPercentage) || 0;
      const shipType =
        (shippingDiscountType as
          | "none"
          | "free"
          | "percent"
          | "fixed"
          | undefined) || "none";
      const shipValRaw = Number(shippingDiscountValue) || 0;
      if (!code || !pubkey || (pct <= 0 && shipType === "none")) {
        return res.status(400).json({ error: "Missing required fields" });
      }
      if (pct < 0 || pct > 100) {
        return res
          .status(400)
          .json({ error: "discountPercentage must be between 0 and 100" });
      }
      if (shipType === "percent" && (shipValRaw <= 0 || shipValRaw > 100)) {
        return res.status(400).json({
          error: "Percent shipping discount must be between 0 and 100",
        });
      }
      if (shipType === "fixed" && shipValRaw <= 0) {
        return res
          .status(400)
          .json({ error: "Fixed shipping discount must be greater than 0" });
      }

      const signedEvent = extractSignedEventFromRequest(req);
      const verification = verifySignedHttpRequestProof(
        signedEvent,
        buildDiscountCodeCreateProof({
          code,
          pubkey,
          discountPercentage: pct,
          expiration,
          shippingDiscountType: shipType === "none" ? undefined : shipType,
          shippingDiscountValue:
            shipType === "percent" || shipType === "fixed"
              ? shipValRaw
              : undefined,
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
        pct,
        expiration,
        maxUses,
        shipType,
        shipType === "free" ? 0 : shipValRaw
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
