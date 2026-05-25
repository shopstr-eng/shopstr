import { getDbPool } from "./db-service";

export type TlsStatus =
  | "pending_dns"
  | "dns_verified"
  | "attached"
  | "active"
  | "failed";

export type DomainType = "subdomain" | "apex";

export interface CustomDomainRow {
  id: number;
  pubkey: string;
  domain: string;
  shop_slug: string;
  verified: boolean;
  domain_type: DomainType;
  verification_token: string | null;
  tls_status: TlsStatus;
  attached_at: string | null;
  admin_notified_at: string | null;
  created_at: string;
  updated_at: string;
}

const pool = getDbPool();

export async function getDomainByPubkey(
  pubkey: string
): Promise<CustomDomainRow | null> {
  const r = await pool.query<CustomDomainRow>(
    `SELECT * FROM custom_domains WHERE pubkey = $1 LIMIT 1`,
    [pubkey]
  );
  return r.rows[0] ?? null;
}

export async function getDomainByHost(
  host: string
): Promise<CustomDomainRow | null> {
  const r = await pool.query<CustomDomainRow>(
    `SELECT * FROM custom_domains WHERE domain = $1 LIMIT 1`,
    [host.toLowerCase()]
  );
  return r.rows[0] ?? null;
}

export async function upsertPendingDomain(params: {
  pubkey: string;
  domain: string;
  shopSlug: string;
  domainType: DomainType;
  verificationToken: string;
}): Promise<CustomDomainRow> {
  const r = await pool.query<CustomDomainRow>(
    `INSERT INTO custom_domains
       (pubkey, domain, shop_slug, verified, domain_type, verification_token, tls_status, admin_notified_at)
     VALUES ($1, $2, $3, false, $4, $5, 'pending_dns', NULL)
     ON CONFLICT (pubkey) DO UPDATE SET
       domain = EXCLUDED.domain,
       shop_slug = EXCLUDED.shop_slug,
       verified = false,
       domain_type = EXCLUDED.domain_type,
       verification_token = EXCLUDED.verification_token,
       tls_status = 'pending_dns',
       attached_at = NULL,
       admin_notified_at = NULL,
       updated_at = NOW()
     RETURNING *`,
    [
      params.pubkey,
      params.domain.toLowerCase(),
      params.shopSlug,
      params.domainType,
      params.verificationToken,
    ]
  );
  // INSERT ... ON CONFLICT DO UPDATE ... RETURNING * is guaranteed to
  // return exactly one row in either branch, so the non-null assertion is
  // safe here and lets the function preserve its `CustomDomainRow` return
  // type for callers.
  return r.rows[0]!;
}

export async function markVerified(pubkey: string): Promise<void> {
  await pool.query(
    `UPDATE custom_domains
       SET verified = true,
           tls_status = CASE
             WHEN tls_status IN ('attached','active') THEN tls_status
             ELSE 'dns_verified'
           END,
           updated_at = NOW()
     WHERE pubkey = $1`,
    [pubkey]
  );
}

export async function markAdminNotified(pubkey: string): Promise<void> {
  await pool.query(
    `UPDATE custom_domains SET admin_notified_at = NOW(), updated_at = NOW()
     WHERE pubkey = $1`,
    [pubkey]
  );
}

export async function setTlsStatus(
  domain: string,
  status: TlsStatus
): Promise<void> {
  const setAttached =
    status === "attached" || status === "active"
      ? `, attached_at = COALESCE(attached_at, NOW())`
      : "";
  await pool.query(
    `UPDATE custom_domains
       SET tls_status = $2,
           updated_at = NOW()
           ${setAttached}
     WHERE domain = $1`,
    [domain.toLowerCase(), status]
  );
}

export async function listDomains(filter?: {
  status?: TlsStatus | "needs_attach";
}): Promise<CustomDomainRow[]> {
  if (filter?.status === "needs_attach") {
    const r = await pool.query<CustomDomainRow>(
      `SELECT * FROM custom_domains
         WHERE tls_status IN ('dns_verified','pending_dns')
         ORDER BY created_at DESC`
    );
    return r.rows;
  }
  if (filter?.status) {
    const r = await pool.query<CustomDomainRow>(
      `SELECT * FROM custom_domains WHERE tls_status = $1 ORDER BY created_at DESC`,
      [filter.status]
    );
    return r.rows;
  }
  const r = await pool.query<CustomDomainRow>(
    `SELECT * FROM custom_domains ORDER BY created_at DESC`
  );
  return r.rows;
}

export async function deleteDomainByPubkey(pubkey: string): Promise<void> {
  await pool.query(`DELETE FROM custom_domains WHERE pubkey = $1`, [pubkey]);
}

export function classifyDomain(domain: string): DomainType {
  const parts = domain.toLowerCase().trim().split(".");
  // Treat 2-label domains (e.g. example.com) as apex. 3+ labels are subdomains.
  // This is a heuristic and ignores public-suffix list complexity (e.g.
  // co.uk). Sellers using ccTLD apex domains can still proceed -- the worst
  // case is they receive both A and CNAME instructions and pick the right one.
  return parts.length <= 2 ? "apex" : "subdomain";
}

export function isValidDomain(domain: string): boolean {
  if (!domain) return false;
  const d = domain.toLowerCase().trim();
  if (d.length > 253) return false;
  if (d.includes("..")) return false;
  if (d.startsWith(".") || d.endsWith(".")) return false;
  // Each label: 1-63 chars, alphanumerics + hyphens (not at start/end).
  const labelRe = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;
  const labels = d.split(".");
  if (labels.length < 2) return false;
  return labels.every((l) => labelRe.test(l));
}
