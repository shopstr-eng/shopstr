import { NextApiRequest, NextApiResponse } from "next";
import { getEmailFlow } from "@/utils/db/db-service";
import {
  renderFlowEmail,
  FlowEmailStorefrontStyle,
  MergeTagData,
} from "@/utils/email/flow-email-templates";
import { sendEmail } from "@/utils/email/email-service";
import { applyRateLimit } from "@/utils/rate-limit";

const RATE_LIMIT = { limit: 5, windowMs: 60 * 1000 };

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!applyRateLimit(req, res, "email-flows-send-test", RATE_LIMIT)) return;

  const { flowId } = req.query;
  const flowIdNum = parseInt(flowId as string, 10);
  if (isNaN(flowIdNum)) {
    return res.status(400).json({ error: "Invalid flow ID" });
  }

  const {
    seller_pubkey,
    target_email,
    subject,
    body_html,
    shop_name,
    shop_url,
    storefront_style,
  } = req.body as {
    seller_pubkey?: string;
    target_email?: string;
    subject?: string;
    body_html?: string;
    shop_name?: string;
    shop_url?: string;
    storefront_style?: FlowEmailStorefrontStyle | null;
  };

  if (!seller_pubkey) {
    return res.status(400).json({ error: "seller_pubkey is required" });
  }
  if (!target_email || !isValidEmail(target_email)) {
    return res.status(400).json({ error: "A valid target_email is required" });
  }
  if (typeof subject !== "string" || typeof body_html !== "string") {
    return res
      .status(400)
      .json({ error: "subject and body_html are required" });
  }

  try {
    const flow = await getEmailFlow(flowIdNum);
    if (!flow) {
      return res.status(404).json({ error: "Flow not found" });
    }
    if (flow.seller_pubkey !== seller_pubkey) {
      return res.status(403).json({ error: "Not authorized" });
    }

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://milk.market";

    const mergeData: MergeTagData = {
      buyer_name: "Test Buyer",
      shop_name: shop_name || flow.from_name || "Your Shop",
      product_title: "Sample Product",
      order_id: "TEST-12345",
      shop_url: shop_url || `${baseUrl}/${flow.seller_pubkey}`,
    };

    const { subject: rendered_subject, html } = renderFlowEmail(
      subject,
      body_html,
      mergeData,
      storefront_style || undefined
    );

    const testSubject = `[TEST] ${rendered_subject}`;
    const replyTo = flow.reply_to || undefined;

    const ok = await sendEmail(target_email, testSubject, html, replyTo);
    if (!ok) {
      return res
        .status(500)
        .json({ error: "Failed to send test email. Check server logs." });
    }
    return res.status(200).json({ success: true });
  } catch (error) {
    console.error("Error sending test flow email:", error);
    return res.status(500).json({ error: "Failed to send test email" });
  }
}
