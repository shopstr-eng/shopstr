import { useContext, useEffect, useRef, useState } from "react";
import { Button } from "@heroui/react";
import { SignerContext } from "@/components/utility-components/nostr-context-provider";
import {
  quoteHodlCheckout,
  registerHodlOrder,
  startNewHodlCheckout,
  getHodlOrder,
  type HodlOrderPricingInputs,
} from "@/utils/lightning/hodl-order-client";
import HodlOrderDetails from "./hodl-order-details";
export type HodlCartItem = {
  title: string;
  params: { productId: string } & HodlOrderPricingInputs;
};
type Row = HodlCartItem & {
  amount?: number;
  hash?: string;
  status?: string;
  error?: string;
};
/** Each line is its own escrow, so partial payments remain independent and resumable. */
export default function HodlCartCheckout({
  items,
  onClose,
  onFunded,
}: {
  items: HodlCartItem[];
  onClose: () => void;
  onFunded: (productId: string) => void;
}) {
  const { signer } = useContext(SignerContext);
  const [rows, setRows] = useState<Row[]>(items);
  const [busy, setBusy] = useState(false);
  const [quoted, setQuoted] = useState(false);
  const notifiedPayments = useRef(new Set<string>());
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const refresh = async () => {
      if (!signer) return;
      for (const row of rows) {
        if (!row.hash) continue;
        try {
          const o = await getHodlOrder(signer, row.hash);
          if (
            !stopped &&
            (o.status === "accepted" || o.status === "settled") &&
            !notifiedPayments.current.has(row.hash)
          ) {
            notifiedPayments.current.add(row.hash);
            onFunded(row.params.productId);
          }
          if (!stopped)
            setRows((prev) =>
              prev.map((p) =>
                p.params.productId === row.params.productId
                  ? { ...p, status: o.status }
                  : p
              )
            );
        } catch {
          /* Details panel explains refresh failures. */
        }
      }
      if (!stopped) timer = setTimeout(refresh, 15000);
    };
    void refresh();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [signer, rows.map((r) => r.hash ?? "").join(",")]);
  const run = async (create: boolean) => {
    if (!signer) return;
    setBusy(true);
    let success = true;
    for (const row of rows) {
      if (row.hash) continue;
      try {
        const amount = create
          ? row.amount!
          : await quoteHodlCheckout(signer, row.params);
        if (!Number.isSafeInteger(amount) || amount < 1)
          throw new Error("Invalid escrow amount");
        const registered = create
          ? await registerHodlOrder(signer, {
              ...row.params,
              amountSats: amount,
            })
          : null;
        setRows((prev) =>
          prev.map((p) =>
            p.params.productId === row.params.productId
              ? {
                  ...p,
                  amount,
                  hash: registered?.paymentHash,
                  error: undefined,
                }
              : p
          )
        );
      } catch (error) {
        success = false;
        setRows((prev) =>
          prev.map((p) =>
            p.params.productId === row.params.productId
              ? {
                  ...p,
                  error:
                    error instanceof Error ? error.message : "Checkout failed",
                }
              : p
          )
        );
      }
    }
    if (!create) setQuoted(success);
    setBusy(false);
  };
  const funded = rows.filter(
    (r) => r.status === "accepted" || r.status === "settled"
  ).length;
  return (
    <section
      className="flex flex-col gap-4 rounded-lg border p-4"
      aria-label="Cart Lightning escrow"
    >
      <h2 className="text-xl font-semibold">Lightning escrow checkout</h2>
      <p>
        Each product has a separate invoice and seller payout. Complete delivery
        and resolve any dispute within the Lightning hold window; it is measured
        in blocks and is not a guaranteed number of hours.
      </p>
      <p>
        These are separate orders. Shipping thresholds apply to each order
        individually; review the escrow total below.
      </p>
      {quoted && (
        <p className="font-semibold">
          Escrow total: {rows.reduce((sum, r) => sum + (r.amount ?? 0), 0)} sats
        </p>
      )}
      {rows.map((row) => (
        <article
          key={row.params.productId}
          className="flex flex-col gap-2 border-t pt-3"
        >
          <h3 className="font-semibold">
            {row.title} × {row.params.quantity ?? 1}
            {row.amount !== undefined ? ` — ${row.amount} sats` : ""}
          </h3>
          {row.error && (
            <p role="alert" className="text-red-500">
              {row.error}
            </p>
          )}
          {row.hash && (
            <>
              <p>Order saved. Resume it here or in Orders.</p>
              <HodlOrderDetails
                key={`${row.hash}:${row.status ?? "open"}`}
                paymentHash={row.hash}
              />
              {row.status === "cancelled" && (
                <Button
                  size="sm"
                  onPress={async () => {
                    if (!signer) return;
                    await startNewHodlCheckout(signer, row.params);
                    setRows((prev) =>
                      prev.map((p) =>
                        p.params.productId === row.params.productId
                          ? {
                              ...p,
                              hash: undefined,
                              status: undefined,
                              amount: undefined,
                            }
                          : p
                      )
                    );
                    setQuoted(false);
                  }}
                >
                  Start a new order for this item
                </Button>
              )}
            </>
          )}
        </article>
      ))}
      {rows.some((r) => !r.hash) && (
        <Button isLoading={busy} onPress={() => run(quoted)}>
          {quoted ? "Create / retry escrow invoices" : "Review escrow prices"}
        </Button>
      )}
      {funded > 0 && (
        <p>
          {funded} of {rows.length} escrow payments funded. Each funded order is
          saved in Orders; do not pay for it again.
        </p>
      )}
      {rows.some((r) => r.hash) && (
        <a href="/orders" className="underline">
          Open saved orders
        </a>
      )}
      <Button variant="bordered" isDisabled={busy} onPress={onClose}>
        Back to cart checkout
      </Button>
    </section>
  );
}
