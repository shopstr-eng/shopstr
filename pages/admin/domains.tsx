"use client";

import { useCallback, useContext, useEffect, useRef, useState } from "react";
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

type AdminGate = "checking" | "allowed" | "denied" | "no-signer";

function AdminDomainsInner() {
  const { signer, pubkey: userPubkey } = useContext(SignerContext);

  const [gate, setGate] = useState<AdminGate>("checking");
  const [domains, setDomains] = useState<AdminDomain[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updating, setUpdating] = useState<string | null>(null);

  // Hold latest signer/pubkey in a ref so the load() callback identity stays
  // stable across re-renders. Otherwise every signer-state churn (e.g. the
  // passphrase challenge handler updating React state) would re-create load,
  // re-fire the load effect, and start a second signer.sign() in parallel
  // with the first — which collides on the NSec passphrase prompt and
  // strands the original promise (it never resolves, so `loading` stays
  // true forever).
  const signerRef = useRef(signer);
  const pubkeyRef = useRef(userPubkey);
  useEffect(() => {
    signerRef.current = signer;
  }, [signer]);
  useEffect(() => {
    pubkeyRef.current = userPubkey;
  }, [userPubkey]);
  const inflightRef = useRef(false);
  const loadedOnceRef = useRef(false);

  // Check admin status as soon as we have the user's pubkey.
  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (!userPubkey) {
        setGate("checking");
        return;
      }
      try {
        const r = await fetch(
          `/api/admin/check?pubkey=${encodeURIComponent(userPubkey)}`
        );
        const data = await r.json();
        if (cancelled) return;
        if (data.isAdmin) {
          if (typeof signer?.sign !== "function") {
            setGate("no-signer");
          } else {
            setGate("allowed");
          }
        } else {
          setGate("denied");
        }
      } catch {
        if (!cancelled) setGate("denied");
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [userPubkey, signer]);

  const load = useCallback(async () => {
    const currentSigner = signerRef.current;
    const currentPubkey = pubkeyRef.current;
    if (!currentPubkey || typeof currentSigner?.sign !== "function") return;
    if (inflightRef.current) return; // guard against concurrent calls
    inflightRef.current = true;
    setLoading(true);
    setError(null);
    try {
      const signedEvent = await currentSigner.sign({
        kind: 27235,
        created_at: Math.floor(Date.now() / 1000),
        tags: [
          ["action", "admin-domain-list"],
          ["method", "POST"],
          ["path", "/api/admin/custom-domains"],
        ],
        content: "Authorize custom domain admin list",
      } as any);
      const r = await fetch("/api/admin/custom-domains", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signedEvent }),
      });
      let data: any = null;
      try {
        data = await r.json();
      } catch {
        data = null;
      }
      if (!r.ok) {
        setError(
          `${(data && data.error) || "Failed to load"}${
            r.status ? ` (HTTP ${r.status})` : ""
          }`
        );
        setDomains([]);
        return;
      }
      setDomains((data && data.domains) || []);
    } catch (err: any) {
      console.error("[admin/domains] load failed", err);
      setError(err?.message || "Failed to load domains");
    } finally {
      inflightRef.current = false;
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (gate === "allowed" && !loadedOnceRef.current) {
      loadedOnceRef.current = true;
      load();
    }
  }, [gate, load]);

  const updateStatus = useCallback(
    async (domain: string, tlsStatus: string) => {
      if (!userPubkey || typeof signer?.sign !== "function") {
        setError("Sign in required");
        return;
      }
      setUpdating(domain);
      setError(null);
      try {
        const signedEvent = await signer.sign({
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
        console.error("[admin/domains] update failed", err);
        setError(err?.message || "Update failed");
      } finally {
        setUpdating(null);
      }
    },
    [signer, userPubkey, load]
  );

  if (gate === "checking") {
    return (
      <div className="mx-auto max-w-6xl px-4 pt-24 pb-24">
        <p className="text-sm text-gray-500">Verifying admin access…</p>
      </div>
    );
  }

  if (gate === "denied") {
    return (
      <div className="mx-auto max-w-6xl px-4 pt-24 pb-24">
        <div className="rounded-lg border border-red-200 bg-red-50 p-6">
          <h1 className="text-xl font-bold text-red-900">
            403 — Access restricted
          </h1>
          <p className="mt-2 text-sm text-red-800">
            This page is only available to Milk Market admins. Your signed-in
            pubkey is not on the admin list.
          </p>
          {userPubkey && (
            <p className="mt-2 font-mono text-xs break-all text-red-700">
              {userPubkey}
            </p>
          )}
        </div>
      </div>
    );
  }

  if (gate === "no-signer") {
    return (
      <div className="mx-auto max-w-6xl px-4 pt-24 pb-24">
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-6">
          <h1 className="text-xl font-bold text-amber-900">Signer not ready</h1>
          <p className="mt-2 text-sm text-amber-800">
            You're signed in as an admin, but your Nostr signer isn't fully
            initialized. Try refreshing the page or signing in again.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 pt-24 pb-24">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Custom Domains (Admin)
          </h1>
          <p className="mt-1 text-sm text-gray-600">
            Manually attach DNS-verified domains in the Replit Deployment
            dashboard, then mark them <code>attached</code>. Once the
            certificate is live, mark them <code>active</code>.
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>

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
