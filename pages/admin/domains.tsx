"use client";

import { useCallback, useContext, useEffect, useState } from "react";
import { SignerContext } from "@/components/utility-components/nostr-context-provider";
import ProtectedRoute from "@/components/utility-components/protected-route";

type AdminDomain = {
  domain: string;
  pubkey: string;
  shopSlug: string;
  verified: boolean;
  domainType: string;
  tlsStatus: string;
  verificationToken: string | null;
  attachedAt: string | null;
  adminNotifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

const STATUS_OPTIONS = [
  "pending_dns",
  "dns_verified",
  "attached",
  "active",
  "failed",
] as const;

function AdminDomainsInner() {
  const { signer, pubkey: userPubkey } = useContext(SignerContext);
  const [domains, setDomains] = useState<AdminDomain[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updating, setUpdating] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!userPubkey || !signer?.sign) return;
    setLoading(true);
    setError(null);
    try {
      const signedEvent = await signer.sign({
        pubkey: userPubkey,
        kind: 27235,
        created_at: Math.floor(Date.now() / 1000),
        tags: [
          ["action", "admin-domain-list"],
          ["method", "GET"],
          ["path", "/api/admin/custom-domains"],
        ],
        content: "Authorize custom domain admin list",
      } as any);
      const r = await fetch(
        `/api/admin/custom-domains?signedEvent=${encodeURIComponent(
          JSON.stringify(signedEvent)
        )}`
      );
      const data = await r.json();
      if (!r.ok) {
        setError(data.error || "Failed to load");
        setDomains([]);
        return;
      }
      setDomains(data.domains || []);
    } catch (err: any) {
      setError(err?.message || "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [userPubkey, signer]);

  useEffect(() => {
    if (userPubkey && signer?.sign) load();
  }, [userPubkey, signer, load]);

  const updateStatus = useCallback(
    async (domain: string, tlsStatus: string) => {
      if (!signer?.sign || !userPubkey) {
        setError("Sign in required");
        return;
      }
      setUpdating(domain);
      try {
        const signedEvent = await signer.sign({
          pubkey: userPubkey,
          kind: 27235,
          created_at: Math.floor(Date.now() / 1000),
          tags: [
            ["action", "admin-domain-status"],
            ["method", "POST"],
            ["path", "/api/admin/custom-domains/status"],
            ["field", "domain", domain.toLowerCase()],
            ["field", "tlsStatus", tlsStatus],
          ],
          content: "Authorize custom domain status update",
        } as any);
        const r = await fetch("/api/admin/custom-domains/status", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ domain, tlsStatus, signedEvent }),
        });
        const data = await r.json();
        if (!r.ok) {
          setError(data.error || "Update failed");
          return;
        }
        await load();
      } catch (err: any) {
        setError(err?.message || "Update failed");
      } finally {
        setUpdating(null);
      }
    },
    [signer, userPubkey, load]
  );

  return (
    <div className="mx-auto max-w-6xl px-4 pt-24 pb-24">
      <h1 className="text-2xl font-bold text-gray-900">
        Custom Domains (Admin)
      </h1>
      <p className="mt-1 text-sm text-gray-600">
        Manually attach DNS-verified domains in the Replit Deployment dashboard,
        then mark them <code>attached</code>. Once the certificate is live, mark
        them <code>active</code>.
      </p>

      {error && (
        <div className="mt-4 rounded bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <p className="mt-6 text-sm text-gray-500">Loading…</p>
      ) : domains.length === 0 ? (
        <p className="mt-6 text-sm text-gray-500">No custom domains yet.</p>
      ) : (
        <div className="mt-6 space-y-3">
          {domains.map((d) => (
            <div
              key={d.domain}
              className="rounded-lg border border-gray-200 bg-white p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-base font-semibold text-gray-900">
                    {d.domain}
                  </p>
                  <p className="text-xs text-gray-500">
                    {d.domainType} → /stall/{d.shopSlug} · submitted{" "}
                    {new Date(d.createdAt).toLocaleString()}
                  </p>
                  <p className="mt-1 font-mono text-xs break-all text-gray-400">
                    Seller: {d.pubkey}
                  </p>
                  {d.verificationToken && (
                    <p className="mt-1 font-mono text-xs break-all text-gray-400">
                      TXT (_milkmarket.{d.domain}): {d.verificationToken}
                    </p>
                  )}
                </div>
                <div className="flex flex-col items-end gap-2">
                  <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-700">
                    {d.tlsStatus} {d.verified ? "· DNS ✓" : ""}
                  </span>
                  <select
                    value={d.tlsStatus}
                    onChange={(e) => updateStatus(d.domain, e.target.value)}
                    disabled={updating === d.domain}
                    className="rounded-md border border-gray-300 px-2 py-1 text-xs"
                  >
                    {STATUS_OPTIONS.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function AdminDomainsPage() {
  return (
    <ProtectedRoute>
      <AdminDomainsInner />
    </ProtectedRoute>
  );
}
