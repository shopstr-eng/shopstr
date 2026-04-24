import { useContext, useEffect, useState } from "react";
import {
  Button,
  Input,
  Card,
  CardBody,
  CardHeader,
  Chip,
  Select,
  SelectItem,
  Tabs,
  Tab,
} from "@heroui/react";
import { TrashIcon, ClipboardDocumentIcon } from "@heroicons/react/24/outline";
import { BLUEBUTTONCLASSNAMES } from "@/utils/STATIC-VARIABLES";
import { SignerContext } from "@/components/utility-components/nostr-context-provider";
import {
  buildAffiliateCodeCreateProof,
  buildAffiliateCodeDeleteProof,
  buildAffiliateCodesListProof,
  buildAffiliateCreateProof,
  buildAffiliateDeleteProof,
  buildAffiliateClickStatsProof,
  buildAffiliateMarkPaidProof,
  buildAffiliatePayoutsListProof,
  buildAffiliateReverseReferralProof,
  buildAffiliatesListProof,
  buildAffiliateUpdateProof,
  buildSignedHttpRequestProofTemplate,
  SIGNED_EVENT_HEADER,
} from "@/utils/nostr/request-auth";
import ConfirmActionDropdown from "../utility-components/dropdowns/confirm-action-dropdown";

interface Affiliate {
  id: number;
  name: string;
  email: string | null;
  affiliate_pubkey: string | null;
  invite_token: string;
  invite_claimed_at: string | null;
  lightning_address: string | null;
  stripe_account_id: string | null;
  notes: string | null;
  payouts_enabled: boolean;
  payout_failure_count: number;
  last_payout_failure_at: string | null;
  last_payout_failure_reason: string | null;
}

interface AffiliateCode {
  id: number;
  affiliate_id: number;
  affiliate_name?: string;
  code: string;
  rebate_type: "percent" | "fixed";
  rebate_value: number;
  buyer_discount_type: "percent" | "fixed";
  buyer_discount_value: number;
  currency: string | null;
  payout_schedule: "weekly" | "biweekly" | "monthly";
  expiration: number | null;
  max_uses: number | null;
  times_used: number;
  is_active: boolean;
}

interface Balance {
  affiliate_id: number;
  affiliate_name: string;
  currency: string;
  pending_smallest: string;
  payable_smallest: string;
  paid_smallest: string;
  referral_count: number;
}

interface ClickStat {
  affiliate_id: number | null;
  affiliate_name: string | null;
  code: string;
  clicks: number;
  conversions: number;
  conversion_rate: number;
}

interface YtdRow {
  affiliate_id: number;
  affiliate_name: string;
  currency: string;
  paid_smallest: string;
  payout_count: number;
}

interface Payout {
  id: number;
  affiliate_id: number;
  affiliate_name: string;
  method: string;
  amount_smallest: string;
  currency: string;
  external_ref: string | null;
  note: string | null;
  status: string;
  paid_at: string;
}

function formatAmount(smallest: string | number, currency: string) {
  const n = typeof smallest === "string" ? Number(smallest) : smallest;
  if (currency.toLowerCase() === "sats") return `${n} sats`;
  return `${(n / 100).toFixed(2)} ${currency.toUpperCase()}`;
}

export default function Affiliates() {
  const { pubkey, signer } = useContext(SignerContext);
  const [affiliates, setAffiliates] = useState<Affiliate[]>([]);
  const [codes, setCodes] = useState<AffiliateCode[]>([]);
  const [balances, setBalances] = useState<Balance[]>([]);
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [clickStats, setClickStats] = useState<ClickStat[]>([]);
  const [ytdRows, setYtdRows] = useState<YtdRow[]>([]);
  const [reverseOrderId, setReverseOrderId] = useState("");
  const [loading, setLoading] = useState(false);

  // New affiliate form
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newLightning, setNewLightning] = useState("");
  const [newStripeAcct, setNewStripeAcct] = useState("");

  // New code form
  const [codeAffiliateId, setCodeAffiliateId] = useState<string>("");
  const [codeText, setCodeText] = useState("");
  const [rebateType, setRebateType] = useState<"percent" | "fixed">("percent");
  const [rebateValue, setRebateValue] = useState("");
  const [buyerDiscountType, setBuyerDiscountType] = useState<
    "percent" | "fixed"
  >("percent");
  const [buyerDiscountValue, setBuyerDiscountValue] = useState("0");
  const [codeCurrency, setCodeCurrency] = useState("usd");
  const [payoutSchedule, setPayoutSchedule] = useState<
    "weekly" | "biweekly" | "monthly"
  >("monthly");

  useEffect(() => {
    if (pubkey && signer) refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pubkey, signer]);

  async function refresh() {
    if (!pubkey || !signer) return;
    setLoading(true);
    try {
      const [aSigned, cSigned, pSigned] = await Promise.all([
        signer.sign(
          buildSignedHttpRequestProofTemplate(buildAffiliatesListProof(pubkey))
        ),
        signer.sign(
          buildSignedHttpRequestProofTemplate(
            buildAffiliateCodesListProof(pubkey)
          )
        ),
        signer.sign(
          buildSignedHttpRequestProofTemplate(
            buildAffiliatePayoutsListProof(pubkey)
          )
        ),
      ]);
      const [aRes, cRes, pRes] = await Promise.all([
        fetch(`/api/affiliates/manage?pubkey=${pubkey}`, {
          headers: { [SIGNED_EVENT_HEADER]: JSON.stringify(aSigned) },
        }),
        fetch(`/api/affiliates/codes?pubkey=${pubkey}`, {
          headers: { [SIGNED_EVENT_HEADER]: JSON.stringify(cSigned) },
        }),
        fetch(`/api/affiliates/payouts?pubkey=${pubkey}`, {
          headers: { [SIGNED_EVENT_HEADER]: JSON.stringify(pSigned) },
        }),
      ]);
      if (aRes.ok) setAffiliates(await aRes.json());
      if (cRes.ok) setCodes(await cRes.json());
      if (pRes.ok) {
        const data = await pRes.json();
        setBalances(data.balances || []);
        setPayouts(data.payouts || []);
        // YTD totals are derived locally from the same payouts feed so we
        // don't need a separate endpoint round-trip for the dashboard.
        setYtdRows(deriveYtdRows(data.payouts || []));
      }

      // Click analytics — separate endpoint, OK to fail soft.
      try {
        const csSigned = await signer.sign(
          buildSignedHttpRequestProofTemplate(
            buildAffiliateClickStatsProof(pubkey)
          )
        );
        const csRes = await fetch(
          `/api/affiliates/click-stats?pubkey=${pubkey}&sinceDays=30`,
          { headers: { [SIGNED_EVENT_HEADER]: JSON.stringify(csSigned) } }
        );
        if (csRes.ok) {
          const data = await csRes.json();
          setClickStats(data.stats || []);
        }
      } catch (e) {
        console.warn("click-stats fetch failed:", e);
      }
    } catch (e) {
      console.error("Affiliate refresh failed:", e);
    } finally {
      setLoading(false);
    }
  }

  function deriveYtdRows(allPayouts: Payout[]): YtdRow[] {
    const startOfYear = new Date(new Date().getFullYear(), 0, 1).getTime();
    const acc = new Map<string, YtdRow>();
    for (const p of allPayouts) {
      if (p.status !== "paid") continue;
      if (new Date(p.paid_at).getTime() < startOfYear) continue;
      const key = `${p.affiliate_id}:${p.currency}`;
      const prev = acc.get(key);
      const amt = Number(p.amount_smallest);
      if (prev) {
        prev.paid_smallest = String(Number(prev.paid_smallest) + amt);
        prev.payout_count += 1;
      } else {
        acc.set(key, {
          affiliate_id: p.affiliate_id,
          affiliate_name: p.affiliate_name,
          currency: p.currency,
          paid_smallest: String(amt),
          payout_count: 1,
        });
      }
    }
    return Array.from(acc.values()).sort(
      (a, b) => Number(b.paid_smallest) - Number(a.paid_smallest)
    );
  }

  async function reverseReferralByOrder() {
    if (!pubkey || !signer) return;
    const orderId = reverseOrderId.trim();
    if (!orderId) return;
    if (
      !window.confirm(
        `Reverse all affiliate referrals for order "${orderId}"? Pending rebates will be cancelled and already-paid rebates flagged for clawback.`
      )
    ) {
      return;
    }
    const signedEvent = await signer.sign(
      buildSignedHttpRequestProofTemplate(
        buildAffiliateReverseReferralProof({
          pubkey,
          orderId,
          sellerPubkey: pubkey,
        })
      )
    );
    const res = await fetch("/api/affiliates/reverse-referral", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        [SIGNED_EVENT_HEADER]: JSON.stringify(signedEvent),
      },
      body: JSON.stringify({
        pubkey,
        orderId,
        sellerPubkey: pubkey,
      }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      alert(`Reverse failed: ${j.error || res.status}`);
      return;
    }
    setReverseOrderId("");
    await refresh();
  }

  async function createAffiliate() {
    if (!pubkey || !signer || !newName) return;
    const signedEvent = await signer.sign(
      buildSignedHttpRequestProofTemplate(
        buildAffiliateCreateProof({ pubkey, name: newName })
      )
    );
    const res = await fetch("/api/affiliates/manage", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        [SIGNED_EVENT_HEADER]: JSON.stringify(signedEvent),
      },
      body: JSON.stringify({
        pubkey,
        name: newName,
        email: newEmail || null,
        lightningAddress: newLightning || null,
        stripeAccountId: newStripeAcct || null,
      }),
    });
    if (res.ok) {
      setNewName("");
      setNewEmail("");
      setNewLightning("");
      setNewStripeAcct("");
      await refresh();
    } else {
      alert("Failed to create affiliate");
    }
  }

  async function deleteAffiliate(id: number, force = false) {
    if (!pubkey || !signer) return;
    const signedEvent = await signer.sign(
      buildSignedHttpRequestProofTemplate(
        buildAffiliateDeleteProof({ pubkey, affiliateId: id })
      )
    );
    const res = await fetch("/api/affiliates/manage", {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        [SIGNED_EVENT_HEADER]: JSON.stringify(signedEvent),
      },
      body: JSON.stringify({ pubkey, affiliateId: id, force }),
    });
    if (res.status === 409) {
      const j = await res.json().catch(() => ({}));
      const ok = window.confirm(
        `${j.error || "Affiliate has unsettled balance."}\n\nForce delete and cancel pending referrals?`
      );
      if (ok) await deleteAffiliate(id, true);
      return;
    }
    await refresh();
  }

  async function regenerateInviteToken(id: number) {
    if (!pubkey || !signer) return;
    if (
      !window.confirm(
        "Generate a new invite link? The old link will stop working immediately."
      )
    ) {
      return;
    }
    const signedEvent = await signer.sign(
      buildSignedHttpRequestProofTemplate(
        buildAffiliateUpdateProof({ pubkey, affiliateId: id })
      )
    );
    const res = await fetch("/api/affiliates/manage", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        [SIGNED_EVENT_HEADER]: JSON.stringify(signedEvent),
      },
      body: JSON.stringify({
        pubkey,
        affiliateId: id,
        action: "regenerate-invite-token",
      }),
    });
    if (!res.ok) {
      alert("Failed to regenerate invite link");
      return;
    }
    await refresh();
  }

  async function setPayoutsEnabled(id: number, enabled: boolean) {
    if (!pubkey || !signer) return;
    const signedEvent = await signer.sign(
      buildSignedHttpRequestProofTemplate(
        buildAffiliateUpdateProof({ pubkey, affiliateId: id })
      )
    );
    const res = await fetch("/api/affiliates/manage", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        [SIGNED_EVENT_HEADER]: JSON.stringify(signedEvent),
      },
      body: JSON.stringify({
        pubkey,
        affiliateId: id,
        action: "set-payouts-enabled",
        enabled,
      }),
    });
    if (!res.ok) {
      alert("Failed to toggle payouts");
      return;
    }
    await refresh();
  }

  async function createCode() {
    if (!pubkey || !signer || !codeAffiliateId || !codeText || !rebateValue)
      return;
    const normalized = codeText.trim().toUpperCase();
    const signedEvent = await signer.sign(
      buildSignedHttpRequestProofTemplate(
        buildAffiliateCodeCreateProof({
          pubkey,
          affiliateId: Number(codeAffiliateId),
          code: normalized,
        })
      )
    );
    const res = await fetch("/api/affiliates/codes", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        [SIGNED_EVENT_HEADER]: JSON.stringify(signedEvent),
      },
      body: JSON.stringify({
        pubkey,
        affiliateId: Number(codeAffiliateId),
        code: normalized,
        rebateType,
        rebateValue: Number(rebateValue),
        buyerDiscountType,
        buyerDiscountValue: Number(buyerDiscountValue || 0),
        currency: codeCurrency,
        payoutSchedule,
      }),
    });
    if (res.ok) {
      setCodeText("");
      setRebateValue("");
      setBuyerDiscountValue("0");
      await refresh();
    } else {
      alert("Failed to create code");
    }
  }

  async function deleteCode(id: number) {
    if (!pubkey || !signer) return;
    const signedEvent = await signer.sign(
      buildSignedHttpRequestProofTemplate(
        buildAffiliateCodeDeleteProof({ pubkey, codeId: id })
      )
    );
    await fetch("/api/affiliates/codes", {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        [SIGNED_EVENT_HEADER]: JSON.stringify(signedEvent),
      },
      body: JSON.stringify({ pubkey, codeId: id }),
    });
    await refresh();
  }

  async function markPaid(b: Balance) {
    if (!pubkey || !signer) return;
    const amount = Number(b.payable_smallest);
    if (amount <= 0) {
      alert("No payable balance");
      return;
    }
    const signedEvent = await signer.sign(
      buildSignedHttpRequestProofTemplate(
        buildAffiliateMarkPaidProof({
          pubkey,
          affiliateId: b.affiliate_id,
          amountSmallest: amount,
          currency: b.currency,
        })
      )
    );
    const res = await fetch("/api/affiliates/mark-paid", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        [SIGNED_EVENT_HEADER]: JSON.stringify(signedEvent),
      },
      body: JSON.stringify({
        pubkey,
        affiliateId: b.affiliate_id,
        amountSmallest: amount,
        currency: b.currency,
        note: "Manual settlement",
      }),
    });
    if (res.ok) {
      await refresh();
    } else {
      const j = await res.json().catch(() => ({}));
      alert(j.error || "Failed to mark paid");
    }
  }

  function copy(text: string) {
    navigator.clipboard.writeText(text).catch(() => {});
  }

  return (
    <div className="w-full space-y-6 p-4">
      <div className="mb-2">
        <h2 className="mb-2 text-2xl font-bold text-black">Affiliates</h2>
        <p className="text-sm text-gray-600">
          Invite affiliates, give them codes, and track rebates. Codes work for
          both Stripe and Bitcoin orders. Shoppers can apply a code via the
          checkout field or the link <code>?ref=CODE</code>.
        </p>
      </div>

      <Tabs aria-label="Affiliate tabs" className="text-black">
        <Tab key="affiliates" title="Affiliates">
          <div className="space-y-4">
            <Card className="bg-white">
              <CardHeader>
                <h3 className="text-lg font-semibold text-black">
                  Add affiliate
                </h3>
              </CardHeader>
              <CardBody className="space-y-3">
                <Input
                  label="Name"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                />
                <Input
                  label="Email (optional)"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                />
                <Input
                  label="Lightning address (optional)"
                  placeholder="alice@getalby.com"
                  value={newLightning}
                  onChange={(e) => setNewLightning(e.target.value)}
                />
                <Input
                  label="Stripe Connect account id (optional)"
                  placeholder="acct_..."
                  value={newStripeAcct}
                  onChange={(e) => setNewStripeAcct(e.target.value)}
                />
                <Button
                  className={BLUEBUTTONCLASSNAMES}
                  onClick={createAffiliate}
                  isDisabled={!newName}
                >
                  Add affiliate
                </Button>
              </CardBody>
            </Card>

            {loading ? (
              <p className="text-black">Loading...</p>
            ) : (
              affiliates.map((a) => {
                const inviteUrl =
                  typeof window !== "undefined"
                    ? `${window.location.origin}/affiliate/${a.invite_token}`
                    : `/affiliate/${a.invite_token}`;
                return (
                  <Card key={a.id} className="bg-white">
                    <CardBody>
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-lg font-semibold text-black">
                              {a.name}
                            </span>
                            {a.invite_claimed_at ? (
                              <Chip color="success" size="sm">
                                Claimed
                              </Chip>
                            ) : (
                              <Chip color="warning" size="sm">
                                Invite pending
                              </Chip>
                            )}
                            {a.payouts_enabled === false && (
                              <Chip color="danger" size="sm">
                                Payouts disabled
                              </Chip>
                            )}
                          </div>
                          {a.last_payout_failure_reason && (
                            <p className="text-xs text-red-600">
                              Last payout error: {a.last_payout_failure_reason}
                            </p>
                          )}
                          {a.email && (
                            <p className="text-xs text-gray-500">{a.email}</p>
                          )}
                          {a.lightning_address && (
                            <p className="text-xs text-gray-500">
                              ⚡ {a.lightning_address}
                            </p>
                          )}
                          {a.stripe_account_id && (
                            <p className="text-xs text-gray-500">
                              Stripe: {a.stripe_account_id}
                            </p>
                          )}
                          <div className="mt-2 flex items-center gap-2">
                            <Input
                              size="sm"
                              value={inviteUrl}
                              readOnly
                              className="text-black"
                            />
                            <Button
                              isIconOnly
                              size="sm"
                              variant="light"
                              onClick={() => copy(inviteUrl)}
                            >
                              <ClipboardDocumentIcon className="h-4 w-4" />
                            </Button>
                          </div>
                          <div className="mt-2 flex flex-wrap gap-2">
                            <Button
                              size="sm"
                              variant="bordered"
                              className="text-black"
                              onClick={() => regenerateInviteToken(a.id)}
                            >
                              Regenerate invite link
                            </Button>
                            {a.payouts_enabled === false ? (
                              <Button
                                size="sm"
                                color="primary"
                                onClick={() => setPayoutsEnabled(a.id, true)}
                              >
                                Re-enable payouts
                              </Button>
                            ) : (
                              <Button
                                size="sm"
                                variant="bordered"
                                className="text-black"
                                onClick={() => setPayoutsEnabled(a.id, false)}
                              >
                                Pause payouts
                              </Button>
                            )}
                          </div>
                        </div>
                        <ConfirmActionDropdown
                          helpText="Delete this affiliate? Their codes and referral history will also be removed."
                          buttonLabel="Delete"
                          onConfirm={() => deleteAffiliate(a.id)}
                        >
                          <Button
                            isIconOnly
                            color="danger"
                            variant="light"
                            size="sm"
                          >
                            <TrashIcon className="h-5 w-5" />
                          </Button>
                        </ConfirmActionDropdown>
                      </div>
                    </CardBody>
                  </Card>
                );
              })
            )}
          </div>
        </Tab>

        <Tab key="codes" title="Codes">
          <div className="space-y-4">
            <Card className="bg-white">
              <CardHeader>
                <h3 className="text-lg font-semibold text-black">Add code</h3>
              </CardHeader>
              <CardBody className="space-y-3">
                <Select
                  label="Affiliate"
                  selectedKeys={codeAffiliateId ? [codeAffiliateId] : []}
                  onChange={(e) => setCodeAffiliateId(e.target.value)}
                >
                  {affiliates.map((a) => (
                    <SelectItem key={String(a.id)}>{a.name}</SelectItem>
                  ))}
                </Select>
                <Input
                  label="Code"
                  placeholder="ALICE10"
                  value={codeText}
                  onChange={(e) => setCodeText(e.target.value.toUpperCase())}
                />
                <div className="grid grid-cols-2 gap-3">
                  <Select
                    label="Rebate type"
                    selectedKeys={[rebateType]}
                    onChange={(e) =>
                      setRebateType(e.target.value as "percent" | "fixed")
                    }
                  >
                    <SelectItem key="percent">Percent</SelectItem>
                    <SelectItem key="fixed">Fixed</SelectItem>
                  </Select>
                  <Input
                    label={`Rebate value (${
                      rebateType === "percent" ? "%" : "amount"
                    })`}
                    type="number"
                    value={rebateValue}
                    onChange={(e) => setRebateValue(e.target.value)}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Select
                    label="Shopper discount type"
                    selectedKeys={[buyerDiscountType]}
                    onChange={(e) =>
                      setBuyerDiscountType(
                        e.target.value as "percent" | "fixed"
                      )
                    }
                  >
                    <SelectItem key="percent">Percent</SelectItem>
                    <SelectItem key="fixed">Fixed</SelectItem>
                  </Select>
                  <Input
                    label={`Shopper discount (${
                      buyerDiscountType === "percent" ? "%" : "amount"
                    })`}
                    type="number"
                    value={buyerDiscountValue}
                    onChange={(e) => setBuyerDiscountValue(e.target.value)}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Input
                    label="Currency"
                    value={codeCurrency}
                    onChange={(e) =>
                      setCodeCurrency(e.target.value.toLowerCase())
                    }
                  />
                  <Select
                    label="Payout schedule"
                    selectedKeys={[payoutSchedule]}
                    onChange={(e) =>
                      setPayoutSchedule(
                        e.target.value as "weekly" | "biweekly" | "monthly"
                      )
                    }
                  >
                    <SelectItem key="weekly">Weekly</SelectItem>
                    <SelectItem key="biweekly">Biweekly</SelectItem>
                    <SelectItem key="monthly">Monthly (default)</SelectItem>
                  </Select>
                </div>
                <Button
                  className={BLUEBUTTONCLASSNAMES}
                  onClick={createCode}
                  isDisabled={!codeAffiliateId || !codeText || !rebateValue}
                >
                  Add code
                </Button>
              </CardBody>
            </Card>

            {codes.map((c) => (
              <Card key={c.id} className="bg-white">
                <CardBody>
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-lg font-bold text-black">
                          {c.code}
                        </span>
                        <Chip size="sm" color="primary">
                          {c.affiliate_name}
                        </Chip>
                        {!c.is_active && (
                          <Chip size="sm" color="default">
                            Inactive
                          </Chip>
                        )}
                      </div>
                      <p className="text-sm text-black">
                        Rebate:{" "}
                        {c.rebate_type === "percent"
                          ? `${c.rebate_value}%`
                          : `${c.rebate_value} ${(c.currency || "").toUpperCase()}`}{" "}
                        · Shopper discount:{" "}
                        {c.buyer_discount_type === "percent"
                          ? `${c.buyer_discount_value}%`
                          : `${c.buyer_discount_value} ${(
                              c.currency || ""
                            ).toUpperCase()}`}
                      </p>
                      <p className="text-xs text-gray-500">
                        Schedule: {c.payout_schedule.replace("_", " ")} · Used:{" "}
                        {c.times_used}
                        {c.max_uses ? ` / ${c.max_uses}` : ""}
                      </p>
                    </div>
                    <ConfirmActionDropdown
                      helpText="Delete this code? Existing referral history is preserved but new orders cannot use it."
                      buttonLabel="Delete"
                      onConfirm={() => deleteCode(c.id)}
                    >
                      <Button
                        isIconOnly
                        color="danger"
                        variant="light"
                        size="sm"
                      >
                        <TrashIcon className="h-5 w-5" />
                      </Button>
                    </ConfirmActionDropdown>
                  </div>
                </CardBody>
              </Card>
            ))}
          </div>
        </Tab>

        <Tab key="balances" title="Balances">
          <div className="space-y-3">
            {balances.length === 0 ? (
              <p className="text-gray-500">No referrals yet.</p>
            ) : (
              balances.map((b) => (
                <Card
                  key={`${b.affiliate_id}-${b.currency}`}
                  className="bg-white"
                >
                  <CardBody>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-lg font-semibold text-black">
                          {b.affiliate_name}{" "}
                          <span className="text-sm text-gray-500">
                            ({b.currency.toUpperCase()})
                          </span>
                        </p>
                        <p className="text-sm text-black">
                          Pending:{" "}
                          {formatAmount(b.pending_smallest, b.currency)} ·
                          Payable now:{" "}
                          {formatAmount(b.payable_smallest, b.currency)} ·
                          Lifetime paid:{" "}
                          {formatAmount(b.paid_smallest, b.currency)}
                        </p>
                        <p className="text-xs text-gray-500">
                          {b.referral_count} referrals
                        </p>
                      </div>
                      <Button
                        className={BLUEBUTTONCLASSNAMES}
                        size="sm"
                        onClick={() => markPaid(b)}
                        isDisabled={Number(b.payable_smallest) <= 0}
                      >
                        Mark paid
                      </Button>
                    </div>
                  </CardBody>
                </Card>
              ))
            )}
          </div>
        </Tab>

        <Tab key="payouts" title="Payouts">
          <div className="space-y-3">
            {payouts.length === 0 ? (
              <p className="text-gray-500">No payouts recorded yet.</p>
            ) : (
              payouts.map((p) => (
                <Card key={p.id} className="bg-white">
                  <CardBody>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-semibold text-black">
                          {p.affiliate_name} ·{" "}
                          {formatAmount(p.amount_smallest, p.currency)}
                        </p>
                        <p className="text-xs text-gray-500">
                          {p.method} · {new Date(p.paid_at).toLocaleString()}
                          {p.external_ref ? ` · ${p.external_ref}` : ""}
                        </p>
                        {p.note && (
                          <p className="text-xs text-gray-500">{p.note}</p>
                        )}
                      </div>
                      <Chip
                        size="sm"
                        color={p.status === "paid" ? "success" : "danger"}
                      >
                        {p.status}
                      </Chip>
                    </div>
                  </CardBody>
                </Card>
              ))
            )}
          </div>
        </Tab>

        <Tab key="analytics" title="Analytics">
          <div className="space-y-4">
            <Card className="bg-white">
              <CardHeader className="font-semibold text-black">
                Clicks &amp; conversions (last 30 days)
              </CardHeader>
              <CardBody>
                {clickStats.length === 0 ? (
                  <p className="text-sm text-gray-500">
                    No tracked clicks yet. Once buyers visit a{" "}
                    <code>?ref=CODE</code> link the data will appear here.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="text-left text-gray-500">
                        <tr>
                          <th className="py-1 pr-3">Code</th>
                          <th className="py-1 pr-3">Affiliate</th>
                          <th className="py-1 pr-3 text-right">Clicks</th>
                          <th className="py-1 pr-3 text-right">Conversions</th>
                          <th className="py-1 pr-3 text-right">Rate</th>
                        </tr>
                      </thead>
                      <tbody className="text-black">
                        {clickStats.map((s) => (
                          <tr key={`${s.code}-${s.affiliate_id ?? "x"}`}>
                            <td className="py-1 pr-3 font-mono">{s.code}</td>
                            <td className="py-1 pr-3">
                              {s.affiliate_name ?? (
                                <span className="text-gray-400">
                                  (no matching code)
                                </span>
                              )}
                            </td>
                            <td className="py-1 pr-3 text-right">{s.clicks}</td>
                            <td className="py-1 pr-3 text-right">
                              {s.conversions}
                            </td>
                            <td className="py-1 pr-3 text-right">
                              {(s.conversion_rate * 100).toFixed(1)}%
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardBody>
            </Card>

            <Card className="bg-white">
              <CardHeader className="font-semibold text-black">
                Year-to-date paid out
              </CardHeader>
              <CardBody>
                {ytdRows.length === 0 ? (
                  <p className="text-sm text-gray-500">
                    No payouts so far this year.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="text-left text-gray-500">
                        <tr>
                          <th className="py-1 pr-3">Affiliate</th>
                          <th className="py-1 pr-3">Currency</th>
                          <th className="py-1 pr-3 text-right">Paid</th>
                          <th className="py-1 pr-3 text-right">Payouts</th>
                        </tr>
                      </thead>
                      <tbody className="text-black">
                        {ytdRows.map((r) => (
                          <tr key={`${r.affiliate_id}-${r.currency}`}>
                            <td className="py-1 pr-3">{r.affiliate_name}</td>
                            <td className="py-1 pr-3 uppercase">
                              {r.currency}
                            </td>
                            <td className="py-1 pr-3 text-right">
                              {formatAmount(r.paid_smallest, r.currency)}
                            </td>
                            <td className="py-1 pr-3 text-right">
                              {r.payout_count}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardBody>
            </Card>

            <Card className="bg-white">
              <CardHeader className="font-semibold text-black">
                Reverse a referral (Lightning / Cashu refunds)
              </CardHeader>
              <CardBody className="space-y-2">
                <p className="text-xs text-gray-500">
                  Stripe refunds reverse referrals automatically. For Lightning
                  or Cashu refunds, paste the order ID here to cancel pending
                  rebates and flag any already-paid rebates for clawback.
                </p>
                <div className="flex gap-2">
                  <Input
                    aria-label="Order ID"
                    placeholder="order_… or invoice ID"
                    value={reverseOrderId}
                    onValueChange={setReverseOrderId}
                  />
                  <Button
                    className={BLUEBUTTONCLASSNAMES}
                    isDisabled={!reverseOrderId.trim()}
                    onClick={reverseReferralByOrder}
                  >
                    Reverse
                  </Button>
                </div>
              </CardBody>
            </Card>
          </div>
        </Tab>
      </Tabs>
    </div>
  );
}
