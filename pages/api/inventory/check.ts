import type { NextApiRequest, NextApiResponse } from "next";
import { getDbPool } from "@/utils/db/db-service";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== "POST") return res.status(405).end();
    
    const { productIds } = req.body; 
    if (!productIds || !Array.isArray(productIds)) return res.status(400).json({ error: "Invalid product IDs" });

    const db = getDbPool();
    const client = await db.connect();

    try {
        const unavailable = [];
        
        for (const id of productIds) {
            const prodRes = await client.query(`SELECT tags FROM product_events WHERE id = $1`, [id]);
            const tags = prodRes.rows[0]?.tags || [];
            const qtyTag = tags.find((t: string[]) => t[0] === 'quantity');
            const maxQty = qtyTag ? parseInt(qtyTag[1]) : 0;

            const resRes = await client.query(`SELECT COUNT(*) FROM inventory_reservations WHERE product_id = $1`, [id]);
            const reserved = parseInt(resRes.rows[0].count);

            if (maxQty > 0 && reserved >= maxQty) unavailable.push(id);
        }

        res.status(200).json({ available: unavailable.length === 0, unavailable });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: "Internal Error" });
    } finally {
        client.release();
    }
}