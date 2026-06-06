"use client";

import { useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Input, Button } from "@heroui/react";
import { SignerContext } from "@/components/utility-components/nostr-context-provider";
import { createNip98AuthorizationHeader } from "@/utils/nostr/nip98-auth";
import { copyToClipboard } from "@/utils/clipboard";
import MilkMarketSpinner from "@/components/utility-components/mm-spinner";

interface PopupContact {
  email: string;
  phone: string | null;
  discountCode: string;
  discountPercentage: number;
  timesUsed: number;
  createdAt: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function formatDate(value: string): string {
  try {
    return new Date(value).toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return value;
  }
}

function toCsv(contacts: PopupContact[]): string {
  const header = [
    "email",
    "phone",
    "discount_code",
    "discount_percentage",
    "times_used",
    "captured_at",
  ];
  const escape = (val: string | number | null) => {
    if (val === null || val === undefined) return "";
    const s = String(val);
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const rows = contacts.map((c) =>
    [
      c.email,
      c.phone,
      c.discountCode,
      c.discountPercentage,
      c.timesUsed,
      c.createdAt,
    ]
      .map(escape)
      .join(",")
  );
  return [header.join(","), ...rows].join("\n");
}

export default function ContactsDashboard() {
  const { signer, isLoggedIn } = useContext(SignerContext);
  const [contacts, setContacts] = useState<PopupContact[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [copiedEmail, setCopiedEmail] = useState<string | null>(null);

  const loadContacts = useCallback(async () => {
    if (!signer) return;
    setLoading(true);
    setError(null);
    try {
      const url = `${window.location.origin}/api/storefront/popup-contacts`;
      const authHeader = await createNip98AuthorizationHeader(
        signer,
        url,
        "GET"
      );
      const res = await fetch("/api/storefront/popup-contacts", {
        method: "GET",
        headers: { Authorization: authHeader },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Request failed (${res.status})`);
      }
      const data = await res.json();
      setContacts(data.contacts || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load contacts");
      setContacts([]);
    } finally {
      setLoading(false);
    }
  }, [signer]);

  useEffect(() => {
    if (isLoggedIn && signer) {
      void loadContacts();
    }
  }, [isLoggedIn, signer, loadContacts]);

  const filtered = useMemo(() => {
    if (!contacts) return [];
    const q = search.trim().toLowerCase();
    if (!q) return contacts;
    return contacts.filter(
      (c) =>
        c.email.toLowerCase().includes(q) ||
        (c.phone || "").toLowerCase().includes(q) ||
        c.discountCode.toLowerCase().includes(q)
    );
  }, [contacts, search]);

  const stats = useMemo(() => {
    if (!contacts) return { total: 0, recent: 0, used: 0 };
    const cutoff = Date.now() - 7 * DAY_MS;
    return {
      total: contacts.length,
      recent: contacts.filter((c) => {
        const t = new Date(c.createdAt).getTime();
        return Number.isFinite(t) && t >= cutoff;
      }).length,
      used: contacts.filter((c) => c.timesUsed > 0).length,
    };
  }, [contacts]);

  const handleExport = () => {
    if (!filtered.length) return;
    const csv = toCsv(filtered);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const stamp = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `contacts-${stamp}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleCopyEmail = async (email: string) => {
    const ok = await copyToClipboard(email);
    if (ok !== false) {
      setCopiedEmail(email);
      setTimeout(() => setCopiedEmail(null), 1500);
    }
  };

  const handleCopyAllEmails = async () => {
    if (!filtered.length) return;
    const ok = await copyToClipboard(filtered.map((c) => c.email).join(", "));
    if (ok !== false) {
      setCopiedEmail("__ALL__");
      setTimeout(() => setCopiedEmail(null), 1500);
    }
  };

  if (!isLoggedIn) {
    return (
      <div className="px-4 py-8 text-center text-sm text-gray-500">
        Sign in to view your captured contacts.
      </div>
    );
  }

  return (
    <div className="max-w-[98vw] min-w-0 bg-white px-4 pb-12 sm:py-2">
      <div className="mx-auto w-full max-w-6xl min-w-0">
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-black">Captured Contacts</h2>
          <p className="mt-1 text-sm text-gray-500">
            Visitors who signed up through your email capture popup. Each
            contact receives a unique discount code by email.
          </p>
        </div>

        <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <StatCard label="Total Contacts" value={stats.total} />
          <StatCard label="New in last 7 days" value={stats.recent} />
          <StatCard label="Codes Redeemed" value={stats.used} />
        </div>

        <div className="mb-4 flex w-full min-w-0 flex-col items-stretch gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <Input
            aria-label="Search contacts"
            placeholder="Search by email, phone, or code"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            startContent={
              <span aria-hidden="true" className="text-sm leading-none">
                🔍
              </span>
            }
            classNames={{
              inputWrapper:
                "border-2 border-gray-300 rounded-lg bg-white shadow-none hover:bg-white data-[hover=true]:bg-white",
              input: "!text-black",
            }}
            variant="bordered"
            className="w-full min-w-0 sm:flex-1"
          />
          <div className="grid w-full min-w-0 grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-row sm:flex-nowrap">
            <Button
              onPress={() => void loadContacts()}
              isDisabled={loading}
              variant="bordered"
              className="rounded-lg border-2 border-black bg-white text-black"
              startContent={
                <span aria-hidden="true" className="text-sm leading-none">
                  🔄
                </span>
              }
            >
              Refresh
            </Button>
            <Button
              onPress={() => void handleCopyAllEmails()}
              isDisabled={!filtered.length}
              variant="bordered"
              className="rounded-lg border-2 border-black bg-white text-black"
              startContent={
                <span aria-hidden="true" className="text-sm leading-none">
                  ✉️
                </span>
              }
            >
              {copiedEmail === "__ALL__" ? "✓ Copied" : "Copy Emails"}
            </Button>
            <Button
              onPress={handleExport}
              isDisabled={!filtered.length}
              className="col-span-2 rounded-lg bg-black text-white sm:col-span-1"
              startContent={
                <span aria-hidden="true" className="text-sm leading-none">
                  📥
                </span>
              }
            >
              Export CSV
            </Button>
          </div>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border-2 border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {loading && contacts === null ? (
          <div className="flex justify-center py-16">
            <MilkMarketSpinner />
          </div>
        ) : !filtered.length ? (
          <EmptyState hasFilter={search.trim().length > 0} />
        ) : (
          <div className="w-full max-w-full min-w-0 overflow-x-auto rounded-lg border-2 border-gray-200">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="bg-gray-50 text-xs tracking-wide text-gray-500 uppercase">
                <tr>
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3">Phone</th>
                  <th className="px-4 py-3">Discount Code</th>
                  <th className="px-4 py-3">Used</th>
                  <th className="px-4 py-3">Captured</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => (
                  <tr
                    key={`${c.email}-${c.createdAt}`}
                    className="border-t border-gray-100 hover:bg-gray-50"
                  >
                    <td className="px-4 py-3 text-black">
                      <button
                        type="button"
                        onClick={() => void handleCopyEmail(c.email)}
                        title="Click to copy email"
                        className="text-left hover:underline"
                      >
                        {c.email}
                      </button>
                      {copiedEmail === c.email && (
                        <span className="ml-2 text-xs text-green-600">
                          ✓ copied
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      {c.phone || "—"}
                    </td>
                    <td className="px-4 py-3">
                      <span className="rounded bg-gray-100 px-2 py-1 font-mono text-xs text-black">
                        {c.discountCode}
                      </span>
                      <span className="ml-2 text-xs text-gray-500">
                        {c.discountPercentage}% off
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      {c.timesUsed > 0 ? (
                        <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                          {c.timesUsed}×
                        </span>
                      ) : (
                        <span className="text-xs text-gray-400">Not yet</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">
                      {formatDate(c.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border-2 border-gray-200 bg-white px-4 py-3">
      <p className="text-xs tracking-wide text-gray-500 uppercase">{label}</p>
      <p className="mt-1 text-2xl font-bold text-black">{value}</p>
    </div>
  );
}

function EmptyState({ hasFilter }: { hasFilter: boolean }) {
  if (hasFilter) {
    return (
      <div className="rounded-lg border-2 border-dashed border-gray-200 py-12 text-center text-sm text-gray-500">
        No contacts match your search.
      </div>
    );
  }
  return (
    <div className="rounded-lg border-2 border-dashed border-gray-200 py-12 text-center">
      <p className="text-sm font-semibold text-gray-700">No contacts yet</p>
      <p className="mt-1 text-xs text-gray-500">
        Enable the Email Capture Popup in your stall settings to start
        collecting buyer emails.
      </p>
    </div>
  );
}
