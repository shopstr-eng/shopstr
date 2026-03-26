import { NextApiRequest, NextApiResponse } from "next";
import { Client } from "pg";
import { generateSecretKey, getPublicKey, nip19 } from "nostr-tools";
import CryptoJS from "crypto-js";

// Helper function to get the base URL from the request
function getBaseUrl(req: NextApiRequest): string {
  const protocol = req.headers["x-forwarded-proto"] || "https";
  const host = req.headers.host;
  return `${protocol}://${host}`;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const { code } = req.query;

  if (!code) {
    return res.status(400).send("Missing authorization code");
  }

  try {
    // Determine provider from referer or state - default to google since Apple is commented out
    const provider = "google";

    let email: string;
    let userId: string;
    let isNewUser = false; // Flag to indicate if the user is new
    let userData: any; // Declare userData at top level

    if (provider === "google") {
      // Get redirect URI from cookie to ensure it matches what was sent to Google
      const cookies =
        req.headers.cookie?.split(";").reduce(
          (acc, cookie) => {
            const [key, value] = cookie.trim().split("=");
            if (key && value) {
              acc[key] = value;
            }
            return acc;
          },
          {} as Record<string, string>
        ) || {};

      const redirectUri =
        cookies["oauth_redirect_uri"] ||
        `${req.headers["x-forwarded-proto"] || "https"}://${
          req.headers.host
        }/api/auth/oauth-callback`;

      // Exchange code for token
      const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code: code as string,
          client_id: process.env["GOOGLE_CLIENT_ID"]!,
          client_secret: process.env["GOOGLE_CLIENT_SECRET"]!,
          redirect_uri: redirectUri,
          grant_type: "authorization_code",
        }),
      });

      const tokenData = await tokenResponse.json();

      if (!tokenResponse.ok || !tokenData.access_token) {
        throw new Error(`Token exchange failed: ${JSON.stringify(tokenData)}`);
      }

      // Get user info
      const userResponse = await fetch(
        "https://www.googleapis.com/oauth2/v2/userinfo",
        {
          headers: { Authorization: `Bearer ${tokenData.access_token}` },
        }
      );

      userData = await userResponse.json();

      email = userData.email;
      userId = userData.id; // Google userinfo endpoint uses 'id' field for user ID

      if (!email || !userId) {
        throw new Error(
          `Missing user data from Google. Email: ${email}, UserId: ${userId}`
        );
      }
    } else {
      /* TODO: Implement Apple OAuth when credentials are available
    else if (provider === "apple") {
      const origin = req.headers.origin || req.headers.referer?.split('/api/')[0] ||
                     `https://${req.headers.host}`;
      const tokenResponse = await fetch("https://appleid.apple.com/auth/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code: code as string,
          client_id: process.env["APPLE_CLIENT_ID"]!,
          client_secret: process.env["APPLE_CLIENT_SECRET"]!,
          redirect_uri: `${origin}/api/auth/oauth-callback`,
          grant_type: "authorization_code",
        }),
      });

      const tokenData = await tokenResponse.json();
      const decoded = JSON.parse(
        Buffer.from(tokenData.id_token.split(".")[1], "base64").toString()
      );
      email = decoded.email;
      userId = decoded.sub;
    }
    */
      throw new Error(`Unsupported OAuth provider: ${provider}`);
    }

    if (!email || !userId) {
      throw new Error(
        `Missing user data after OAuth. Email: ${email}, UserId: ${userId}`
      );
    }

    // Store or retrieve Nostr keys for this OAuth account
    const client = new Client({
      connectionString: process.env["DATABASE_URL"],
    });

    await client.connect();

    // Check if user exists
    const existingUser = await client.query(
      "SELECT pubkey, encrypted_nsec FROM oauth_auth WHERE provider = $1 AND provider_user_id = $2",
      [provider, userId]
    );

    let nsec, pubkey;

    if (existingUser.rows.length > 0) {
      // Existing user - decrypt their nsec
      const encryptionKey = CryptoJS.PBKDF2(
        `${provider}-${userId}`,
        "milk-market-oauth-salt",
        { keySize: 256 / 32, iterations: 1000 }
      ).toString();

      nsec = CryptoJS.AES.decrypt(
        existingUser.rows[0].encrypted_nsec,
        encryptionKey
      ).toString(CryptoJS.enc.Utf8);
      pubkey = existingUser.rows[0].pubkey;
      isNewUser = false; // User exists, so not a new user
    } else {
      // New user - generate keys
      const secretKey = generateSecretKey();
      pubkey = getPublicKey(secretKey);
      nsec = nip19.nsecEncode(secretKey);

      const encryptionKey = CryptoJS.PBKDF2(
        `${provider}-${userId}`,
        "milk-market-oauth-salt",
        { keySize: 256 / 32, iterations: 1000 }
      ).toString();

      const encryptedNsec = CryptoJS.AES.encrypt(
        nsec,
        encryptionKey
      ).toString();

      if (!userId) {
        throw new Error("userId is null or undefined before database insert");
      }

      await client.query(
        "INSERT INTO oauth_auth (provider, provider_user_id, email, pubkey, encrypted_nsec) VALUES ($1, $2, $3, $4, $5)",
        [provider, userId, email, pubkey, encryptedNsec]
      );
      isNewUser = true; // User is new, set flag
    }

    await client.end();

    // Redirect to success page with nsec and pubkey
    const successUrl = new URL("/auth/oauth-success", getBaseUrl(req));
    successUrl.searchParams.set("nsec", nsec);
    successUrl.searchParams.set("pubkey", pubkey);
    successUrl.searchParams.set("provider", provider);
    successUrl.searchParams.set("isNewUser", isNewUser.toString());
    if (userData.email) {
      successUrl.searchParams.set("email", userData.email);
    }

    res.redirect(successUrl.toString());
  } catch (error) {
    console.error("OAuth callback error:", error);
    res.redirect(
      `/auth/oauth-error?error=${encodeURIComponent(String(error))}`
    );
  }
}
