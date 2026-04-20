import { GetServerSideProps } from "next";
import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { Button, Card, CardBody, CardHeader, Input } from "@heroui/react";
import { BLUEBUTTONCLASSNAMES } from "@/utils/STATIC-VARIABLES";

interface AffiliateInfo {
  id: number;
  seller_pubkey: string;
  name: string;
  email: string | null;
  affiliate_pubkey: string | null;
  invite_claimed_at: string | null;
  lightning_address: string | null;
  stripe_account_id: string | null;
  has_lightning_address?: boolean;
  has_stripe_account?: boolean;
  masked?: boolean;
}

interface SelfBalance {
  currency: string;
  pending_smallest: string;
  payable_smallest: string;
  paid_smallest: string;
}

interface SelfPayout {
  id: number;
  method: "stripe" | "lightning" | "manual";
  amount_smallest: string;
  currency: string;
  status: string;
  paid_at: string;
  external_ref: string | null;
}

interface SelfStats {
  affiliateId: number;
  name: string;
  payoutsEnabled: boolean;
  lastFailureReason: string | null;
  lastFailureAt: string | null;
  balances: SelfBalance[];
  payouts: SelfPayout[];
}

interface Props {
  token: string;
  initial: AffiliateInfo | null;
}

function formatAmount(amountSmallest: string, currency: string): string {
  const n = Number(amountSmallest || 0);
  if (currency.toLowerCase() === "sats") {
    return `${n.toLocaleString()} sats`;
  }
  return `${(n / 100).toFixed(2)} ${currency.toUpperCase()}`;
}

export default function AffiliateClaimPage({ token, initial }: Props) {
  const router = useRouter();
  const [affiliate, setAffiliate] = useState<AffiliateInfo | null>(initial);
  const [pubkey, setPubkey] = useState(initial?.affiliate_pubkey ?? "");
  const [lightning, setLightning] = useState(initial?.lightning_address ?? "");
  const [stripeAcct, setStripeAcct] = useState(
    initial?.stripe_account_id ?? ""
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [stats, setStats] = useState<SelfStats | null>(null);
  const [statsErr, setStatsErr] = useState<string | null>(null);
  const [stripeBusy, setStripeBusy] = useState(false);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(
          `/api/affiliates/self-stats?token=${encodeURIComponent(token)}`
        );
        if (!r.ok) {
          if (!cancelled) setStatsErr("Couldn't load your balances right now.");
          return;
        }
        const j = (await r.json()) as SelfStats;
        if (!cancelled) setStats(j);
      } catch {
        if (!cancelled) setStatsErr("Couldn't load your balances right now.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (!affiliate) {
    return (
      <div className="mx-auto max-w-xl p-8">
        <h1 className="text-2xl font-bold text-black">Invite not found</h1>
        <p className="mt-2 text-gray-600">
          This affiliate invite link is invalid or has been removed. Please ask
          the seller for a new link.
        </p>
      </div>
    );
  }

  async function save() {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch("/api/affiliates/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          affiliatePubkey: pubkey || null,
          lightningAddress: lightning || null,
          stripeAccountId: stripeAcct || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to save");
      } else {
        setAffiliate(data);
        setSaved(true);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function startStripeOnboarding() {
    setStripeBusy(true);
    setError(null);
    try {
      // Step 1: ensure an account exists (idempotent if already created).
      const create = await fetch("/api/affiliates/stripe-onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          action: "create-account",
          affiliatePubkey: pubkey || null,
        }),
      });
      const createJson = await create.json();
      if (!create.ok) {
        setError(createJson.error || "Failed to create Stripe account");
        return;
      }
      // Step 2: get a link the affiliate can complete onboarding through.
      const link = await fetch("/api/affiliates/stripe-onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          action: "create-link",
          affiliatePubkey: pubkey || null,
        }),
      });
      const linkJson = await link.json();
      if (!link.ok || !linkJson.url) {
        setError(linkJson.error || "Failed to get onboarding link");
        return;
      }
      window.location.href = linkJson.url;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Stripe onboarding failed");
    } finally {
      setStripeBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-8">
      <div>
        <h1 className="text-2xl font-bold text-black">
          Welcome, {affiliate.name}
        </h1>
        <p className="mt-2 text-sm text-gray-600">
          Set your payout destination so the seller&apos;s store can send you
          rebates automatically. Bookmark this page — anyone with this link can
          update your payout details.
        </p>
      </div>

      {stats && !stats.payoutsEnabled && (
        <Card className="border border-amber-200 bg-amber-50">
          <CardBody>
            <p className="text-sm font-semibold text-amber-900">
              Your payouts are currently paused.
            </p>
            {stats.lastFailureReason && (
              <p className="mt-1 text-sm text-amber-800">
                Last error: {stats.lastFailureReason}
              </p>
            )}
            <p className="mt-2 text-sm text-amber-800">
              Update your payout details below and ask the seller to re-enable
              payouts from their dashboard.
            </p>
          </CardBody>
        </Card>
      )}

      <Card className="bg-white">
        <CardHeader>
          <h2 className="text-lg font-semibold text-black">Your balances</h2>
        </CardHeader>
        <CardBody className="space-y-2">
          {statsErr && <p className="text-sm text-red-600">{statsErr}</p>}
          {!stats && !statsErr && (
            <p className="text-sm text-gray-500">Loading…</p>
          )}
          {stats && stats.balances.length === 0 && (
            <p className="text-sm text-gray-500">
              No referrals yet. Share your code to start earning.
            </p>
          )}
          {stats &&
            stats.balances.map((b) => (
              <div
                key={b.currency}
                className="flex flex-wrap items-center justify-between gap-2 rounded border border-gray-200 p-3 text-sm"
              >
                <span className="font-mono text-xs text-gray-500 uppercase">
                  {b.currency}
                </span>
                <span className="text-gray-700">
                  Pending: {formatAmount(b.pending_smallest, b.currency)}
                </span>
                <span className="text-gray-700">
                  Ready: {formatAmount(b.payable_smallest, b.currency)}
                </span>
                <span className="font-semibold text-black">
                  Paid: {formatAmount(b.paid_smallest, b.currency)}
                </span>
              </div>
            ))}
        </CardBody>
      </Card>

      <Card className="bg-white">
        <CardHeader>
          <h2 className="text-lg font-semibold text-black">Payout details</h2>
        </CardHeader>
        <CardBody className="space-y-3">
          <Input
            label="Your Nostr pubkey (optional)"
            value={pubkey}
            onChange={(e) => setPubkey(e.target.value)}
            description="Lets you sign in and view your stats from your own client."
          />
          <Input
            label="Lightning address"
            placeholder="you@getalby.com"
            value={lightning}
            onChange={(e) => setLightning(e.target.value)}
          />
          <Input
            label="Stripe Connect account id"
            placeholder="acct_..."
            value={stripeAcct}
            onChange={(e) => setStripeAcct(e.target.value)}
            description="If filled, the seller's Stripe orders will pay you on schedule."
          />
          <div>
            <Button
              variant="bordered"
              className="text-black"
              onClick={startStripeOnboarding}
              isLoading={stripeBusy}
            >
              {affiliate.stripe_account_id
                ? "Continue Stripe onboarding"
                : "Set up Stripe Connect for me"}
            </Button>
            <p className="mt-1 text-xs text-gray-500">
              We&apos;ll create a Stripe Express account on your behalf and
              redirect you to finish onboarding.
            </p>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          {saved && <p className="text-sm text-green-600">Saved.</p>}
          <div className="flex gap-2">
            <Button
              className={BLUEBUTTONCLASSNAMES}
              onClick={save}
              isLoading={saving}
            >
              Save payout details
            </Button>
            <Button
              variant="light"
              className="text-black"
              onClick={() => router.back()}
            >
              Back
            </Button>
          </div>
        </CardBody>
      </Card>

      {stats && stats.payouts.length > 0 && (
        <Card className="bg-white">
          <CardHeader>
            <h2 className="text-lg font-semibold text-black">Recent payouts</h2>
          </CardHeader>
          <CardBody>
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-gray-500 uppercase">
                <tr>
                  <th className="py-1">Date</th>
                  <th className="py-1">Method</th>
                  <th className="py-1">Amount</th>
                  <th className="py-1">Status</th>
                </tr>
              </thead>
              <tbody>
                {stats.payouts.map((p) => (
                  <tr key={p.id} className="border-t border-gray-100">
                    <td className="py-1 text-gray-700">
                      {new Date(p.paid_at).toLocaleDateString()}
                    </td>
                    <td className="py-1 text-gray-700">{p.method}</td>
                    <td className="py-1 text-gray-700">
                      {formatAmount(p.amount_smallest, p.currency)}
                    </td>
                    <td className="py-1 text-gray-700">{p.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardBody>
        </Card>
      )}
    </div>
  );
}

export const getServerSideProps: GetServerSideProps<Props> = async (ctx) => {
  const token = String(ctx.params?.token ?? "");
  try {
    const proto = (ctx.req.headers["x-forwarded-proto"] as string) || "http";
    const host = ctx.req.headers.host;
    const res = await fetch(
      `${proto}://${host}/api/affiliates/claim?token=${encodeURIComponent(
        token
      )}`
    );
    if (!res.ok) return { props: { token, initial: null } };
    const initial = (await res.json()) as AffiliateInfo;
    return { props: { token, initial } };
  } catch {
    return { props: { token, initial: null } };
  }
};
