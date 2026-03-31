import type { NextApiRequest, NextApiResponse } from "next";
import {
  getStock,
  getAllStock,
  setStock,
  deductStock,
  restoreStock,
  checkAvailability,
  syncFromNostrEvent,
} from "@/utils/db/inventory-service";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method === "GET") {
    return handleGet(req, res);
  }
  if (req.method === "POST") {
    return handlePost(req, res);
  }
  return res.status(405).json({ error: "Method not allowed" });
}

async function handleGet(req: NextApiRequest, res: NextApiResponse) {
  const { productId, variantKey } = req.query;
  if (!productId || typeof productId !== "string") {
    return res.status(400).json({ error: "productId is required" });
  }

  try {
    if (variantKey && typeof variantKey === "string") {
      const result = await getStock(productId, variantKey);
      return res.status(200).json({ success: true, ...result });
    }
    const result = await getAllStock(productId);
    return res.status(200).json({ success: true, ...result });
  } catch (error) {
    console.error("Inventory GET error:", error);
    return res.status(500).json({ error: "Failed to fetch inventory" });
  }
}

async function handlePost(req: NextApiRequest, res: NextApiResponse) {
  const { action } = req.body;

  try {
    switch (action) {
      case "check": {
        const { productId, quantity = 1, selectedSize } = req.body;
        if (!productId)
          return res.status(400).json({ error: "productId is required" });
        const result = await checkAvailability(
          productId,
          quantity,
          selectedSize
        );
        return res.status(200).json({ success: true, ...result });
      }

      case "deduct": {
        const { productId, amount, orderId, variantKey } = req.body;
        if (!productId || !amount || !orderId) {
          return res
            .status(400)
            .json({ error: "productId, amount, and orderId are required" });
        }
        const result = await deductStock(
          productId,
          amount,
          orderId,
          variantKey
        );
        if (!result.success) {
          return res.status(409).json({ success: false, error: result.error });
        }
        return res.status(200).json({ success: true, ...result });
      }

      case "set": {
        const { productId, sellerPubkey, quantity, variantKey, source } =
          req.body;
        if (!productId || !sellerPubkey || quantity === undefined) {
          return res.status(400).json({
            error: "productId, sellerPubkey, and quantity are required",
          });
        }
        const result = await setStock(
          productId,
          sellerPubkey,
          quantity,
          variantKey,
          source || "seller_override"
        );
        return res.status(200).json({ success: true, ...result });
      }

      case "restore": {
        const { productId, amount, orderId, variantKey } = req.body;
        if (!productId || !amount || !orderId) {
          return res
            .status(400)
            .json({ error: "productId, amount, and orderId are required" });
        }
        const result = await restoreStock(
          productId,
          amount,
          orderId,
          variantKey
        );
        return res.status(200).json({ success: true, ...result });
      }

      case "sync": {
        const { productId, sellerPubkey, globalQuantity, sizeQuantities } =
          req.body;
        if (!productId || !sellerPubkey) {
          return res
            .status(400)
            .json({ error: "productId and sellerPubkey are required" });
        }
        const sizeMap = sizeQuantities
          ? new Map<string, number>(
              Object.entries(sizeQuantities).map(([k, v]) => [k, Number(v)])
            )
          : undefined;
        await syncFromNostrEvent(
          productId,
          sellerPubkey,
          globalQuantity,
          sizeMap
        );
        return res.status(200).json({
          success: true,
          message: "Inventory synced from product event",
        });
      }

      default:
        return res.status(400).json({ error: `Unknown action: ${action}` });
    }
  } catch (error) {
    console.error("Inventory POST error:", error);
    return res
      .status(500)
      .json({ error: "Failed to process inventory operation" });
  }
}
