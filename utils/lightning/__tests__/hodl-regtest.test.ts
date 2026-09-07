/** @jest-environment node */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { randomBytes } from "node:crypto";
import { Invoice } from "@getalby/lightning-tools";
import { LndHodlInvoiceProvider } from "../lnd-hodl-invoice-provider";
import { getLndPaymentClient } from "../lnd-payment-client";
import { paymentHashFromPreimage } from "../payment-hash";
import { payoutToSeller } from "../hodl-seller-payout";
import {
  registerHodlEscrowOrder,
  updateHodlEscrowOrderStatusIfAdvancing,
  getInitializedDbPool,
  closeDbPool,
} from "@/utils/db/db-service";

const execute = promisify(execFile);
const enabled = process.env.RUN_LND_REGTEST === "1";
const regtest = enabled ? describe : describe.skip;
regtest("real LND escrow and payout (regtest only)", () => {
  const provider = new LndHodlInvoiceProvider();
  const peer =
    process.env.LND_REGTEST_PEER_CONTAINER ?? "shopstr-hodl-regtest-peer-1";
  async function ln(...args: string[]) {
    const { stdout } = await execute(
      "docker",
      ["exec", peer, "lncli", "--network=regtest", ...args],
      { timeout: 90_000 }
    );
    return JSON.parse(stdout);
  }
  beforeAll(async () => {
    const info = await ln("getinfo");
    expect(info.chains).toContainEqual({
      chain: "bitcoin",
      network: "regtest",
    });
    expect(process.env.LND_HOST).toMatch(/^127\.0\.0\.1:/);
    expect(process.env.DATABASE_URL).toMatch(/@127\.0\.0\.1:/);
  });
  afterAll(async () => {
    await provider.close();
    await getLndPaymentClient().close();
    await closeDbPool();
  });
  it("accepts and settles a held HTLC, pays the seller once, and reconciles a lost database acknowledgment", async () => {
    const preimage = randomBytes(32).toString("hex");
    const paymentHash = paymentHashFromPreimage(preimage);
    const { invoice } = await provider.createHoldInvoice({
      amountSats: 1000,
      paymentHash,
    });
    expect(invoice).toMatch(/^lnbcrt/);
    await registerHodlEscrowOrder({
      paymentHash,
      preimage,
      buyerNostrPubkey: "1".repeat(64),
      sellerNostrPubkey: "2".repeat(64),
      invoice,
      amountSats: 1000,
      expiresAt: new Date(Date.now() + 3600000),
    });
    const payment = ln("payinvoice", "--force", "--json", invoice);
    // Attach a handler immediately so a failed payer cannot create an unhandled rejection.
    void payment.catch(() => {});
    for (
      let i = 0;
      i < 50 &&
      (await provider.lookupInvoice(paymentHash)).status !== "accepted";
      i++
    )
      await new Promise((resolve) => setTimeout(resolve, 200));
    expect((await provider.lookupInvoice(paymentHash)).status).toBe("accepted");
    await provider.settleInvoice(preimage);
    expect((await payment).status).toBe("SUCCEEDED");
    expect((await provider.lookupInvoice(paymentHash)).status).toBe("settled");
    await updateHodlEscrowOrderStatusIfAdvancing(paymentHash, "settled");
    const requestInvoice = jest.fn(
      async () =>
        new Invoice({
          pr: (await ln("addinvoice", "--amt=1000")).payment_request,
        })
    );
    expect(
      (
        await payoutToSeller(paymentHash, {
          resolveAddress: async () => "seller@regtest.invalid",
          requestInvoice,
        })
      ).status
    ).toBe("paid");
    const pool = await getInitializedDbPool();
    const before = (await ln("listchannels")).channels[0]
      .total_satoshis_received;
    // Simulate crash after the Lightning payment, before recording its successful outcome.
    await pool.query(
      "UPDATE hodl_escrow_payouts SET status='pending' WHERE payment_hash=$1",
      [paymentHash]
    );
    expect((await payoutToSeller(paymentHash, { requestInvoice })).status).toBe(
      "already_paid"
    );
    expect(requestInvoice).toHaveBeenCalledTimes(1);
    expect((await ln("listchannels")).channels[0].total_satoshis_received).toBe(
      before
    );
    expect(
      (
        await pool.query(
          "SELECT status FROM hodl_escrow_payouts WHERE payment_hash=$1",
          [paymentHash]
        )
      ).rows[0].status
    ).toBe("paid");
  }, 120_000);
  it("cancels an accepted hold and returns the locked HTLC to the payer", async () => {
    const paymentHash = paymentHashFromPreimage(
      randomBytes(32).toString("hex")
    );
    const { invoice } = await provider.createHoldInvoice({
      amountSats: 1000,
      paymentHash,
    });
    const payment = ln("payinvoice", "--force", "--json", invoice).catch(
      () => null
    );
    for (
      let i = 0;
      i < 50 &&
      (await provider.lookupInvoice(paymentHash)).status !== "accepted";
      i++
    )
      await new Promise((resolve) => setTimeout(resolve, 200));
    expect((await provider.lookupInvoice(paymentHash)).status).toBe("accepted");
    await provider.cancelInvoice(paymentHash);
    await payment;
    expect((await provider.lookupInvoice(paymentHash)).status).toBe(
      "cancelled"
    );
  }, 120_000);
});
