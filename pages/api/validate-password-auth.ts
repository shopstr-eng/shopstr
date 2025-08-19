import { NextApiRequest, NextApiResponse } from "next";

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const passwordStorageKey = process.env["PASSWORD_STORAGE_KEY"];

  res.status(200).json({ value: passwordStorageKey });
}
