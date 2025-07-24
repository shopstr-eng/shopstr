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
  return npub.startsWith("npub") && npub.length === 63;
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
    connectionString: process.env.DATABASE_URL,
  });

  try {
    await client.connect();

    // Create table if it doesn't exist
    await client.query(`
      CREATE TABLE IF NOT EXISTS signups (
        id SERIAL PRIMARY KEY,
        contact VARCHAR(255) NOT NULL UNIQUE,
        contact_type VARCHAR(10) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

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
