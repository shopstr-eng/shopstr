jest.mock("@/utils/db/db-service", () => ({ getInitializedDbPool: jest.fn() }));
import { Invoice } from "@getalby/lightning-tools";
import { getInitializedDbPool } from "@/utils/db/db-service";
import { getHodlOrderForActor } from "../hodl-order-store";
const invoice =
  "lnbcrt10u1p4fag0ppp55nhtvav8f7ew6dskt97l0jk6cewngkt9p8xkdg5nx756zymnf03sdpq2d5x7urnw3ezqetnvdex7aeqdaexgetjcqzzsxqrrsssp5lx63h7lsfd4lsav6hu2nzf3x47ef2a0s5t9nnee666fmdcpfphxs9qxpqysgqyk5zl6j4azvvgd750lzakn3fv4sp4a49smzjeptg0euw9rjwkkgz28ty5c5ajwyrhgq94sswgjl9t5en5tx0hh3jtq2z5fusv9wee4qp75epfw";
it("uses BOLT11 timestamps instead of timezone-less database expiry values", async () => {
  const decoded = new Invoice({ pr: invoice });
  const row = {
    payment_hash: decoded.paymentHash,
    invoice,
    buyer_nostr_pubkey: "buyer",
    seller_nostr_pubkey: "seller",
    arbiter_nostr_pubkey: "arbiter",
    amount_sats: decoded.satoshi,
    status: "open",
    created_at: decoded.timestamp + 19800,
    expires_at: decoded.timestamp + 3600 + 19800,
  };
  (getInitializedDbPool as jest.Mock).mockResolvedValue({
    query: jest.fn().mockResolvedValue({ rows: [row] }),
  });
  const order = await getHodlOrderForActor(decoded.paymentHash, "buyer");
  expect(order?.createdAt).toBe(decoded.timestamp);
  expect(order?.expiresAt).toBe(decoded.timestamp + 3600);
  expect(order?.invoice).toBe(invoice);
  const seller = await getHodlOrderForActor(decoded.paymentHash, "seller");
  expect(seller?.invoice).toBeUndefined();
});
