import { NextApiRequest, NextApiResponse } from "next";
import {
  getPendingExecutions,
  markExecutionSent,
  markExecutionFailed,
  fetchShopProfileByPubkeyFromDb,
} from "@/utils/db/db-service";
import {
  renderFlowEmail,
  MergeTagData,
  FlowEmailStorefrontStyle,
} from "@/utils/email/flow-email-templates";
import { getUncachableSendGridClient } from "@/utils/email/sendgrid-client";
import { applyRateLimit } from "@/utils/rate-limit";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (
    !applyRateLimit(req, res, "flows-process", { limit: 30, windowMs: 60_000 })
  )
    return;

  const secret = req.headers["x-flow-processor-secret"] || req.body?.secret;
  const expectedSecret = process.env.FLOW_PROCESSOR_SECRET;

  if (!expectedSecret || secret !== expectedSecret) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const batchSize = Math.min(parseInt(req.body?.batch_size) || 50, 50);
    const executions = await getPendingExecutions(batchSize);

    if (executions.length === 0) {
      return res.status(200).json({ processed: 0, results: [] });
    }

    let sgClient: Awaited<
      ReturnType<typeof getUncachableSendGridClient>
    > | null = null;
    try {
      sgClient = await getUncachableSendGridClient();
    } catch (error) {
      console.error("Failed to initialize SendGrid client:", error);
      return res
        .status(500)
        .json({ error: "Failed to initialize email client" });
    }

    const results: Array<{
      execution_id: number;
      status: "sent" | "failed";
      error?: string;
    }> = [];

    // Cache per-seller storefront style for the duration of this batch so we
    // don't re-fetch the kind 30019 event for every execution from the same
    // seller. `null` means "looked up, no storefront / no colors".
    const styleCache = new Map<string, FlowEmailStorefrontStyle | null>();

    const getStorefrontStyle = async (
      sellerPubkey: string
    ): Promise<FlowEmailStorefrontStyle | null> => {
      if (styleCache.has(sellerPubkey))
        return styleCache.get(sellerPubkey) ?? null;
      try {
        const evt = await fetchShopProfileByPubkeyFromDb(sellerPubkey);
        if (!evt?.content) {
          styleCache.set(sellerPubkey, null);
          return null;
        }
        const parsed = JSON.parse(evt.content);
        const sf = parsed?.storefront;
        const cs = sf?.colorScheme;
        if (!cs && !sf?.neoShadows) {
          styleCache.set(sellerPubkey, null);
          return null;
        }
        const style: FlowEmailStorefrontStyle = {
          primary: cs?.primary,
          secondary: cs?.secondary,
          accent: cs?.accent,
          background: cs?.background,
          text: cs?.text,
          neoShadows: !!sf?.neoShadows,
        };
        styleCache.set(sellerPubkey, style);
        return style;
      } catch (err) {
        console.error(
          "Failed to load storefront style for flow email:",
          sellerPubkey,
          err
        );
        styleCache.set(sellerPubkey, null);
        return null;
      }
    };

    for (const execution of executions) {
      try {
        const mergeData: MergeTagData = {
          ...(execution.enrollment_data || {}),
          shop_name:
            execution.enrollment_data?.shop_name ||
            execution.from_name ||
            "Milk Market",
        };

        const sfStyle = await getStorefrontStyle(execution.seller_pubkey);

        const { subject, html } = renderFlowEmail(
          execution.subject,
          execution.body_html,
          mergeData,
          sfStyle ?? undefined
        );

        const fromAddress = execution.from_name
          ? { email: sgClient.fromEmail, name: execution.from_name }
          : sgClient.fromEmail;

        const msg: any = {
          to: execution.recipient_email,
          from: fromAddress,
          subject,
          html,
        };

        if (execution.reply_to) {
          msg.replyTo = execution.reply_to;
        }

        await sgClient.client.send(msg);

        await markExecutionSent(execution.id);
        results.push({ execution_id: execution.id, status: "sent" });
      } catch (error: any) {
        const errorMessage = error?.message || "Unknown error sending email";
        await markExecutionFailed(execution.id, errorMessage);
        results.push({
          execution_id: execution.id,
          status: "failed",
          error: errorMessage,
        });
      }
    }

    const sent = results.filter((r) => r.status === "sent").length;
    const failed = results.filter((r) => r.status === "failed").length;

    return res.status(200).json({
      processed: results.length,
      sent,
      failed,
      results,
    });
  } catch (error) {
    console.error("Error processing email flow executions:", error);
    return res.status(500).json({ error: "Failed to process executions" });
  }
}
