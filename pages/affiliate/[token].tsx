import { GetServerSideProps } from "next";
import { useState } from "react";
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
}

interface Props {
  token: string;
  initial: AffiliateInfo | null;
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

  return (
    <div className="mx-auto max-w-xl p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-black">
          Welcome, {affiliate.name}
        </h1>
        <p className="mt-2 text-sm text-gray-600">
          Set your payout destination so the seller&apos;s store can send you
          rebates automatically. Bookmark this page — anyone with this link can
          update your payout details.
        </p>
      </div>

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
            description="If filled, the seller's Stripe orders will pay you in real time."
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          {saved && <p className="text-sm text-green-600">Saved.</p>}
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
        </CardBody>
      </Card>
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
