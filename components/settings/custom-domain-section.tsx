"use client";

import { useCallback, useContext, useEffect, useMemo, useState } from "react";
import { SignerContext } from "@/components/utility-components/nostr-context-provider";
import { createSellerActionAuthEventTemplate } from "@milk-market/nostr";

type DnsInstruction = {
  type: string;
  host: string;
  value: string;
  note: string;
};

type Instructions = {
  domainType: "subdomain" | "apex";
  txt: DnsInstruction;
  subdomain: DnsInstruction;
  apex: DnsInstruction & { ips?: string[] };
  replitVerify: DnsInstruction | null;
  recommended: "subdomain" | "apex";
};

type StoredDomain = {
  domain: string;
  verified: boolean;
  domainType: "subdomain" | "apex";
  verificationToken: string | null;
  tlsStatus: "pending_dns" | "dns_verified" | "attached" | "active" | "failed";
  attachedAt: string | null;
  createdAt: string;
  instructions: Instructions | null;
};

type VerifyResult = {
  domain: string;
  verified: boolean;
  tlsStatus: string;
  observed: {
    cname: string[] | null;
    a: string[] | null;
    txt: string[] | null;
  };
  expected: {
    cnameAnyOf: string[];
    txt: { host: string; value: string } | null;
  };
  message: string;
};

const STATUS_COPY: Record<
  StoredDomain["tlsStatus"],
  { label: string; tone: string }
> = {
  pending_dns: {
    label: "Waiting for DNS",
    tone: "bg-amber-100 text-amber-800",
  },
  dns_verified: {
    label: "DNS verified — provisioning",
    tone: "bg-blue-100 text-blue-800",
  },
  attached: { label: "Issuing certificate", tone: "bg-blue-100 text-blue-800" },
  active: { label: "Active", tone: "bg-green-100 text-green-800" },
  failed: { label: "Failed", tone: "bg-red-100 text-red-800" },
};

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-semibold tracking-wide text-gray-500 uppercase">
        {label}
      </span>
      <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
        <code className="flex-1 font-mono text-sm break-all text-gray-800">
          {value}
        </code>
        <button
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(value);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            } catch {
              /* ignore */
            }
          }}
          className="rounded-md border border-gray-300 bg-white px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-100"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </div>
  );
}

function DnsRow({ instruction }: { instruction: DnsInstruction }) {
  return (
    <div className="space-y-2 rounded-lg border border-gray-200 p-4">
      <p className="text-sm text-gray-600">{instruction.note}</p>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <CopyField label="Type" value={instruction.type} />
        <CopyField label="Host / Name" value={instruction.host} />
        <CopyField label="Value" value={instruction.value} />
      </div>
    </div>
  );
}

export default function CustomDomainSection() {
  const { signer, pubkey: userPubkey } = useContext(SignerContext);

  const [loaded, setLoaded] = useState(false);
  const [domain, setDomain] = useState<StoredDomain | null>(null);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verifyResult, setVerifyResult] = useState<VerifyResult | null>(null);

  const reload = useCallback(async () => {
    if (!userPubkey) return;
    try {
      const r = await fetch(
        `/api/storefront/custom-domain?pubkey=${encodeURIComponent(userPubkey)}`
      );
      const data = await r.json();
      setDomain(data);
    } catch {
      setDomain(null);
    } finally {
      setLoaded(true);
    }
  }, [userPubkey]);

  useEffect(() => {
    reload();
  }, [reload]);

  const status = domain?.tlsStatus ? STATUS_COPY[domain.tlsStatus] : null;

  const onSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError(null);
      setVerifyResult(null);
      if (!signer?.sign || !userPubkey) {
        setError("Please sign in first");
        return;
      }
      const cleanDomain = input.trim().toLowerCase();
      if (!cleanDomain) {
        setError("Enter a domain");
        return;
      }
      setBusy(true);
      try {
        const signedEvent = await signer.sign(
          createSellerActionAuthEventTemplate(
            userPubkey,
            "custom-domain-write",
            {
              method: "POST",
              path: "/api/storefront/custom-domain",
              fields: { domain: cleanDomain },
            }
          )
        );
        const r = await fetch("/api/storefront/custom-domain", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            pubkey: userPubkey,
            domain: cleanDomain,
            signedEvent,
          }),
        });
        const data = await r.json();
        if (!r.ok) {
          setError(data.error || "Failed to submit domain");
          return;
        }
        setInput("");
        await reload();
      } catch (err: any) {
        setError(err?.message || "Failed to submit domain");
      } finally {
        setBusy(false);
      }
    },
    [input, userPubkey, signer, reload]
  );

  const onVerify = useCallback(async () => {
    if (!userPubkey) return;
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/storefront/verify-domain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pubkey: userPubkey }),
      });
      const data = await r.json();
      if (!r.ok) {
        setError(data.error || "Verification failed");
        return;
      }
      setVerifyResult(data);
      await reload();
    } catch (err: any) {
      setError(err?.message || "Verification failed");
    } finally {
      setBusy(false);
    }
  }, [userPubkey, reload]);

  const onDisconnect = useCallback(async () => {
    if (!signer?.sign || !userPubkey) return;
    if (!confirm("Disconnect this custom domain?")) return;
    setBusy(true);
    setError(null);
    try {
      const signedEvent = await signer.sign(
        createSellerActionAuthEventTemplate(userPubkey, "custom-domain-write", {
          method: "DELETE",
          path: "/api/storefront/custom-domain",
        })
      );
      const r = await fetch("/api/storefront/custom-domain", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pubkey: userPubkey, signedEvent }),
      });
      const data = await r.json();
      if (!r.ok) {
        setError(data.error || "Failed to disconnect");
        return;
      }
      setDomain(null);
      setVerifyResult(null);
    } catch (err: any) {
      setError(err?.message || "Failed to disconnect");
    } finally {
      setBusy(false);
    }
  }, [signer, userPubkey]);

  const showInstructions = useMemo(() => {
    if (!domain?.instructions) return null;
    const ins = domain.instructions;
    return (
      <div className="space-y-4">
        <div>
          <h4 className="mb-2 text-sm font-semibold text-gray-900">
            Step 1 — Verify ownership (TXT record)
          </h4>
          <DnsRow instruction={ins.txt} />
        </div>
        <div>
          <h4 className="mb-2 text-sm font-semibold text-gray-900">
            Step 2 — Point your domain (
            {ins.recommended === "apex"
              ? "A record for root domain"
              : "CNAME for subdomain"}
            )
          </h4>
          {ins.recommended === "apex" ? (
            <DnsRow instruction={ins.apex} />
          ) : (
            <DnsRow instruction={ins.subdomain} />
          )}
          <details className="mt-2 text-sm text-gray-600">
            <summary className="cursor-pointer font-medium">
              Using a {ins.recommended === "apex" ? "subdomain" : "root domain"}{" "}
              instead?
            </summary>
            <div className="mt-2">
              {ins.recommended === "apex" ? (
                <DnsRow instruction={ins.subdomain} />
              ) : (
                <DnsRow instruction={ins.apex} />
              )}
            </div>
          </details>
        </div>
        {ins.replitVerify && (
          <div>
            <h4 className="mb-2 text-sm font-semibold text-gray-900">
              Step 3 — Replit deployment verification (TXT record)
            </h4>
            <DnsRow instruction={ins.replitVerify} />
          </div>
        )}
        {ins.apex.ips && ins.apex.ips.length > 0 && (
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs text-gray-600">
            <p className="font-semibold text-gray-700">
              Deployment IP{ins.apex.ips.length > 1 ? "s" : ""} (for A records)
            </p>
            <p className="mt-1 font-mono break-all text-gray-800">
              {ins.apex.ips.join(", ")}
            </p>
            <p className="mt-1">
              Useful if you&apos;re configuring records ahead of time or your
              DNS provider needs the value separately from the rest of the
              instructions.
            </p>
          </div>
        )}
      </div>
    );
  }, [domain]);

  if (!loaded) {
    return (
      <div className="rounded-xl border border-gray-200 p-6 text-sm text-gray-500">
        Loading custom domain settings…
      </div>
    );
  }

  return (
    <div className="space-y-6 rounded-xl border border-gray-200 bg-white p-6">
      <div>
        <h3 className="text-lg font-bold text-gray-900">Custom Domain</h3>
        <p className="mt-1 text-sm text-gray-600">
          Connect your own domain to your storefront. URLs like{" "}
          <code className="rounded bg-gray-100 px-1 py-0.5 text-xs">
            yourdomain.com/listing/...
          </code>{" "}
          will resolve to your stall pages.
        </p>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {!domain && (
        <form onSubmit={onSubmit} className="space-y-3">
          <label className="text-sm font-medium text-gray-700">
            Domain (e.g. <code className="text-xs">creamerydairy.com</code> or{" "}
            <code className="text-xs">shop.creamerydairy.com</code>)
          </label>
          <div className="flex flex-wrap gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="yourdomain.com"
              className="min-w-[240px] flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-black focus:outline-none"
              disabled={busy}
            />
            <button
              type="submit"
              disabled={busy || !input.trim()}
              className="rounded-lg bg-black px-4 py-2 text-sm font-semibold text-white hover:bg-gray-900 disabled:opacity-50"
            >
              {busy ? "Submitting…" : "Connect Domain"}
            </button>
          </div>
        </form>
      )}

      {domain && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-mono text-base font-semibold text-gray-900">
                {domain.domain}
              </p>
              <p className="text-xs text-gray-500">
                Submitted {new Date(domain.createdAt).toLocaleString()}
              </p>
            </div>
            {status && (
              <span
                className={`rounded-full px-3 py-1 text-xs font-semibold ${status.tone}`}
              >
                {status.label}
              </span>
            )}
          </div>

          {domain.tlsStatus !== "active" && showInstructions}

          {verifyResult && !verifyResult.verified && (
            <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
              <p className="font-semibold">{verifyResult.message}</p>
              <div className="mt-2 space-y-1 text-xs">
                {verifyResult.observed.cname && (
                  <p>
                    Observed CNAME: {verifyResult.observed.cname.join(", ")}
                  </p>
                )}
                {verifyResult.observed.a && (
                  <p>Observed A: {verifyResult.observed.a.join(", ")}</p>
                )}
                {verifyResult.observed.txt && (
                  <p>
                    Observed TXT (_milkmarket.{verifyResult.domain}):{" "}
                    {verifyResult.observed.txt.length
                      ? verifyResult.observed.txt.join(", ")
                      : "(none)"}
                  </p>
                )}
              </div>
            </div>
          )}

          {domain.tlsStatus === "dns_verified" && (
            <div className="rounded-lg bg-blue-50 p-3 text-sm text-blue-900">
              DNS verified! A Milk Market admin will attach your domain to the
              deployment shortly to provision a TLS certificate. This is usually
              done within 24 hours.
            </div>
          )}

          {domain.tlsStatus === "active" && (
            <div className="rounded-lg bg-green-50 p-3 text-sm text-green-900">
              Your custom domain is live.{" "}
              <a
                href={`https://${domain.domain}`}
                target="_blank"
                rel="noreferrer"
                className="underline"
              >
                Visit your storefront →
              </a>
            </div>
          )}

          <div className="flex flex-wrap gap-2 pt-2">
            {domain.tlsStatus !== "active" && (
              <button
                type="button"
                onClick={onVerify}
                disabled={busy}
                className="rounded-lg bg-black px-4 py-2 text-sm font-semibold text-white hover:bg-gray-900 disabled:opacity-50"
              >
                {busy ? "Checking…" : "Check DNS"}
              </button>
            )}
            <button
              type="button"
              onClick={onDisconnect}
              disabled={busy}
              className="rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
            >
              Disconnect
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
