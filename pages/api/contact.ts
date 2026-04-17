import type { NextApiRequest, NextApiResponse } from "next";
import { getUncachableSendGridClient } from "@/utils/email/sendgrid-client";
import { applyRateLimit } from "@/utils/rate-limit";

const RATE_LIMIT = { limit: 5, windowMs: 60 * 1000 };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!applyRateLimit(req, res, "contact", RATE_LIMIT)) return;

  const { name, email, subject, message } = req.body;

  if (!name || !email || !message) {
    return res
      .status(400)
      .json({ error: "Name, email, and message are required" });
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ error: "Invalid email address" });
  }

  try {
    const { client, fromEmail } = await getUncachableSendGridClient();

    await client.send({
      to: "freemilk@milk.market",
      from: fromEmail,
      replyTo: email,
      subject: `[Contact Form] ${subject || "General Inquiry"} - from ${name}`,
      html: `
        <div style="font-family: sans-serif; max-width: 600px;">
          <h2 style="border-bottom: 2px solid #000; padding-bottom: 8px;">New Contact Form Submission</h2>
          <p><strong>Name:</strong> ${name}</p>
          <p><strong>Email:</strong> <a href="mailto:${email}">${email}</a></p>
          <p><strong>Subject:</strong> ${subject || "General Inquiry"}</p>
          <hr style="border: 1px solid #eee;" />
          <p><strong>Message:</strong></p>
          <p style="white-space: pre-wrap;">${message}</p>
        </div>
      `,
    });

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error("Contact form email error:", error);
    return res
      .status(500)
      .json({ error: "Failed to send message. Please try again." });
  }
}
