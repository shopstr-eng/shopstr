import Stripe from "stripe";

const REQUIRED_CAPABILITIES: Array<"card_payments" | "transfers"> = [
  "card_payments",
  "transfers",
];

export type EnsureCapabilitiesResult =
  | { ok: true; requested: string[]; alreadySatisfied: boolean }
  | { ok: false; error: string };

export async function ensureConnectAccountCapabilities(
  stripe: Stripe,
  accountId: string
): Promise<EnsureCapabilitiesResult> {
  try {
    const account = await stripe.accounts.retrieve(accountId);
    if (account.type !== "express" && account.type !== "standard") {
      return { ok: true, requested: [], alreadySatisfied: true };
    }

    const current = (account.capabilities || {}) as Record<string, string>;
    const missing = REQUIRED_CAPABILITIES.filter(
      (cap) => current[cap] !== "active" && current[cap] !== "pending"
    );

    if (missing.length === 0) {
      return { ok: true, requested: [], alreadySatisfied: true };
    }

    const capabilitiesUpdate: Stripe.AccountUpdateParams.Capabilities = {};
    for (const cap of missing) {
      capabilitiesUpdate[cap] = { requested: true };
    }

    await stripe.accounts.update(accountId, {
      capabilities: capabilitiesUpdate,
    });

    return { ok: true, requested: missing, alreadySatisfied: false };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error(
      `Failed to ensure Stripe capabilities for ${accountId}:`,
      error
    );
    return { ok: false, error };
  }
}
