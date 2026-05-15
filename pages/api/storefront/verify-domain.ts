import type { NextApiRequest, NextApiResponse } from "next";
import dns from "dns";
import { promisify } from "util";
import { applyRateLimit } from "@/utils/rate-limit";
import { getDomainByPubkey, markVerified } from "@/utils/db/custom-domains";

const resolveCname = promisify(dns.resolveCname);
const resolve4 = promisify(dns.resolve4);
const resolveTxt = promisify(dns.resolveTxt);

const RATE_LIMIT = { limit: 30, windowMs: 60 * 1000 };

const PRIMARY_HOST = (
  process.env.REPLIT_DEPLOYMENT_HOST || "milk.market"
).toLowerCase();

const VALID_CNAME_TARGETS = [
  PRIMARY_HOST,
  "milk.market",
  "milk-market.replit.app",
]
  .map((h) => h.toLowerCase().replace(/\.$/, ""))
  .filter((v, i, a) => a.indexOf(v) === i);

function normalizeHost(h: string): string {
  return h.toLowerCase().trim().replace(/\.$/, "");
}

function cnameMatches(observed: string, expected: string): boolean {
  const o = normalizeHost(observed);
  const e = normalizeHost(expected);
  return o === e || o.endsWith("." + e);
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (!applyRateLimit(req, res, "verify-domain", RATE_LIMIT)) return;

  const { pubkey } = req.body ?? {};
  if (!pubkey) {
    return res.status(400).json({ error: "pubkey is required" });
  }

  try {
    const row = await getDomainByPubkey(pubkey);
    if (!row) {
      return res.status(404).json({ error: "No custom domain found" });
    }

    const domain = row.domain;
    const expectedToken = row.verification_token;

    const observed: {
      cname: string[] | null;
      a: string[] | null;
      txt: string[] | null;
    } = { cname: null, a: null, txt: null };

    let cnameMatch = false;
    let aMatch = false;
    let txtMatch = !expectedToken;

    try {
      const recs = await resolveCname(domain);
      observed.cname = recs;
      cnameMatch = recs.some((r) =>
        VALID_CNAME_TARGETS.some((t) => cnameMatches(r, t))
      );
    } catch {
      // No CNAME — try A records.
    }

    if (!cnameMatch) {
      try {
        const targetIps = await resolve4(PRIMARY_HOST);
        const got = await resolve4(domain);
        observed.a = got;
        const targetSet = new Set(targetIps.map((s) => s.trim()));
        aMatch = got.length > 0 && got.every((ip) => targetSet.has(ip.trim()));
      } catch {
        // ignore
      }
    }

    if (expectedToken) {
      try {
        const txt = await resolveTxt(`_milkmarket.${domain}`);
        const flat = txt.map((parts) => parts.join("")).flat();
        observed.txt = flat;
        txtMatch = flat.some((v) => v.trim() === expectedToken);
      } catch {
        observed.txt = [];
        txtMatch = false;
      }
    }

    const dnsTargetMatch = cnameMatch || aMatch;
    const verified = dnsTargetMatch && txtMatch;

    if (verified) {
      await markVerified(pubkey);
    }

    let message = "";
    if (verified) {
      message =
        "Domain verified! An admin will attach it to the deployment shortly to provision your TLS certificate.";
    } else if (!dnsTargetMatch && !txtMatch) {
      message =
        "Neither the DNS target record nor the TXT verification record was found. DNS changes can take up to 48h to propagate.";
    } else if (!dnsTargetMatch) {
      message = `TXT verification succeeded, but no CNAME pointing to ${VALID_CNAME_TARGETS[0]} (or A record matching ${PRIMARY_HOST}) was found.`;
    } else {
      message = `DNS target verified, but the TXT record at _milkmarket.${domain} doesn't match. Make sure the value is exactly: ${expectedToken}`;
    }

    return res.status(200).json({
      domain,
      verified,
      tlsStatus: verified ? "dns_verified" : row.tls_status,
      observed,
      expected: {
        cnameAnyOf: VALID_CNAME_TARGETS,
        txt: expectedToken
          ? { host: `_milkmarket.${domain}`, value: expectedToken }
          : null,
      },
      message,
    });
  } catch (error) {
    console.error("Domain verification error:", error);
    return res.status(500).json({ error: "Verification failed" });
  }
}
