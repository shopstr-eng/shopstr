import { NextApiRequest, NextApiResponse } from "next";
import {
  getEmailFlow,
  getFlowSteps,
  getFlowEnrollments,
  enrollInFlow,
  scheduleStepExecutions,
  getPopupEmailCapturesBySeller,
  cancelEnrollment,
} from "@/utils/db/db-service";
import { verifyNip98Request } from "@/utils/nostr/nip98-auth";
import { applyRateLimit } from "@/utils/rate-limit";

const PER_IP_LIMIT = { limit: 10, windowMs: 60 * 1000 };
const PER_PUBKEY_LIMIT = { limit: 10, windowMs: 60 * 1000 };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST" && req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!applyRateLimit(req, res, "flows-send-to-contacts:ip", PER_IP_LIMIT))
    return;

  const flowIdNum = parseInt(req.query.flowId as string, 10);
  if (isNaN(flowIdNum)) {
    return res.status(400).json({ error: "Invalid flow ID" });
  }

  const authResult = await verifyNip98Request(req, req.method);
  if (!authResult.ok) {
    return res.status(401).json({ error: authResult.error });
  }

  if (
    !applyRateLimit(
      req,
      res,
      "flows-send-to-contacts:pubkey",
      PER_PUBKEY_LIMIT,
      authResult.pubkey
    )
  )
    return;

  try {
    const flow = await getEmailFlow(flowIdNum);
    if (!flow) {
      return res.status(404).json({ error: "Flow not found" });
    }
    if (flow.seller_pubkey !== authResult.pubkey) {
      return res.status(403).json({ error: "Not authorized" });
    }

    if (flow.status !== "active") {
      return res.status(400).json({
        error: "Activate this flow before sending it to your contacts.",
      });
    }

    const steps = await getFlowSteps(flowIdNum);
    if (steps.length === 0) {
      return res.status(400).json({
        error: "Add at least one email to this flow before sending.",
      });
    }

    // GET: return the seller's contacts plus whether each has already received
    // this flow, so the dashboard can present a selectable list.
    if (req.method === "GET") {
      const allContacts = await getPopupEmailCapturesBySeller(
        authResult.pubkey
      );
      const enrollments = await getFlowEnrollments(flowIdNum);
      const received = new Set(
        enrollments
          .filter((e) => e.status === "active" || e.status === "completed")
          .map((e) => e.recipient_email.trim().toLowerCase())
      );
      return res.status(200).json({
        contacts: allContacts
          .filter((c) => (c.email || "").trim().length > 0)
          .map((c) => ({
            email: c.email,
            discountCode: c.discount_code,
            discountPercentage: Number(c.discount_percentage),
            alreadyReceived: received.has((c.email || "").trim().toLowerCase()),
          })),
      });
    }

    const allContacts = await getPopupEmailCapturesBySeller(authResult.pubkey);
    if (allContacts.length === 0) {
      return res.status(200).json({ enrolled: 0, skipped: 0, total: 0 });
    }

    // Optionally narrow to a specific set of contacts chosen in the dashboard.
    // When `emails` is omitted entirely, fall back to sending to every contact.
    const rawEmails = (req.body as { emails?: unknown })?.emails;
    if (rawEmails !== undefined && !Array.isArray(rawEmails)) {
      return res.status(400).json({ error: "Invalid contact selection." });
    }
    let selectedSet: Set<string> | null = null;
    if (Array.isArray(rawEmails)) {
      selectedSet = new Set(
        rawEmails
          .filter((e): e is string => typeof e === "string")
          .map((e) => e.trim().toLowerCase())
          .filter((e) => e.length > 0)
      );
      if (selectedSet.size === 0) {
        return res
          .status(400)
          .json({ error: "Select at least one contact to send to." });
      }
    }

    const contacts = selectedSet
      ? allContacts.filter((c) =>
          selectedSet!.has((c.email || "").trim().toLowerCase())
        )
      : allContacts;

    if (contacts.length === 0) {
      return res.status(200).json({ enrolled: 0, skipped: 0, total: 0 });
    }

    // Anyone already enrolled (active or completed) has already received this
    // flow's emails, so we skip them to honor "contacts that haven't received
    // that email before".
    const enrollments = await getFlowEnrollments(flowIdNum);
    const alreadyReceived = new Set(
      enrollments
        .filter((e) => e.status === "active" || e.status === "completed")
        .map((e) => e.recipient_email.trim().toLowerCase())
    );

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://milk.market";
    const shopUrl = `${baseUrl}/${authResult.pubkey}`;

    let enrolled = 0;
    let skipped = 0;

    for (const contact of contacts) {
      const email = (contact.email || "").trim();
      if (!email) continue;

      const key = email.toLowerCase();
      if (alreadyReceived.has(key)) {
        skipped++;
        continue;
      }
      // Guard against duplicate captures within this run.
      alreadyReceived.add(key);

      let enrollmentId: number | null = null;
      try {
        const enrollment = await enrollInFlow({
          flow_id: flow.id,
          recipient_email: email,
          recipient_pubkey: null,
          enrollment_data: {
            shop_name: flow.from_name || "Milk Market",
            shop_url: shopUrl,
            discount_code: contact.discount_code || "",
            discount_percentage:
              contact.discount_percentage != null
                ? String(contact.discount_percentage)
                : "",
          },
        });
        enrollmentId = enrollment.id;

        await scheduleStepExecutions(enrollment.id, flow.id);
        enrolled++;
      } catch (contactError) {
        console.error("Failed to enroll contact in flow:", email, contactError);
        skipped++;
        // If the enrollment row was created but scheduling failed, cancel it so
        // it doesn't linger as "active" with no emails queued — that would make
        // future runs skip this contact forever. Cancelling lets a later send
        // re-enroll and retry them.
        if (enrollmentId !== null) {
          try {
            await cancelEnrollment(enrollmentId);
          } catch (cancelError) {
            console.error(
              "Failed to roll back stranded enrollment:",
              enrollmentId,
              cancelError
            );
          }
        }
        // Allow a retry within this same run's dedup set.
        alreadyReceived.delete(key);
      }
    }

    return res.status(200).json({
      enrolled,
      skipped,
      total: contacts.length,
    });
  } catch (error) {
    console.error("Error sending flow to contacts:", error);
    return res.status(500).json({ error: "Failed to send flow to contacts" });
  }
}
