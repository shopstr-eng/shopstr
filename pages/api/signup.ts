import { NextApiRequest, NextApiResponse } from "next";
import { Client } from "pg";

interface SignupData {
  contact: string;
  contactType: "email" | "nostr";
}

const isValidEmail = (email: string): boolean => {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
};

const isValidNostrPub = (npub: string): boolean => {
  return npub.startsWith("npub1") && npub.length === 63;
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { contact, contactType }: SignupData = req.body;

  // Validate input
  if (!contact || !contactType) {
    return res
      .status(400)
      .json({ error: "Contact and contact type are required" });
  }

  if (!["email", "nostr"].includes(contactType)) {
    return res.status(400).json({ error: "Invalid contact type" });
  }

  // Validate contact format
  const isValid =
    contactType === "email" ? isValidEmail(contact) : isValidNostrPub(contact);

  if (!isValid) {
    const errorMsg =
      contactType === "email"
        ? "Invalid email format"
        : "Invalid Nostr public key format";
    return res.status(400).json({ error: errorMsg });
  }

  const client = new Client({
    connectionString: process.env["DATABASE_URL"],
  });

  try {
    await client.connect();

    // Check if contact already exists
    const existingSignup = await client.query(
      "SELECT id FROM signups WHERE contact = $1",
      [contact]
    );

    if (existingSignup.rows.length > 0) {
      return res.status(409).json({ error: "Contact already registered" });
    }

    // Insert new signup
    const result = await client.query(
      "INSERT INTO signups (contact, contact_type) VALUES ($1, $2) RETURNING id",
      [contact, contactType]
    );

    // If it's an email signup, also send to Beehiiv
    if (contactType === "email") {
      try {
        const beehiivResponse = await fetch(
          `${
            req.headers.origin || "http://localhost:5000"
          }/api/beehiiv-subscribe`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ email: contact }),
          }
        );

        if (!beehiivResponse.ok) {
          console.warn(
            "Failed to subscribe to Beehiiv:",
            await beehiivResponse.text()
          );
          // Don't fail the whole request if Beehiiv fails
        }
      } catch (beehiivError) {
        console.warn("Beehiiv subscription error:", beehiivError);
        // Don't fail the whole request if Beehiiv fails
      }
    }

    res.status(201).json({
      success: true,
      message: "Successfully registered for updates",
      id: result.rows[0].id,
    });
  } catch (error) {
    console.error("Database error:", error);
    res.status(500).json({ error: "Internal server error" });
  } finally {
    await client.end();
  }
}
