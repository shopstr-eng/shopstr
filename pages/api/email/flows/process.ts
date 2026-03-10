import { NextApiRequest, NextApiResponse } from "next";
import {
  getPendingExecutions,
  markExecutionSent,
  markExecutionFailed,
} from "@/utils/db/db-service";
import {
  renderFlowEmail,
  MergeTagData,
} from "@/utils/email/flow-email-templates";
import { getUncachableSendGridClient } from "@/utils/email/sendgrid-client";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

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

    for (const execution of executions) {
      try {
        const mergeData: MergeTagData = {
          ...(execution.enrollment_data || {}),
        };

        const { subject, html } = renderFlowEmail(
          execution.subject,
          execution.body_html,
          mergeData
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
