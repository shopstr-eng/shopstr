import { serializeHodlCheckout } from "@/utils/lightning/hodl-order-details";
import type { PoolClient } from "pg";
import { createHash } from "crypto";
import { getInitializedDbPool } from "./db-service";
type Result = { statusCode: number; body: Record<string, unknown> };
// Leave connections for invoice registration and recovery in the ten-connection pool.
let active = 0;
/** The lock and durable response make concurrent requests and lost HTTP replies safe to retry. */
export async function withHodlCheckout(
  buyer: string,
  id: string,
  request: unknown,
  create: (client: PoolClient) => Promise<Result>
): Promise<Result> {
  if (active >= 4)
    return {
      statusCode: 503,
      body: { error: "Checkout is busy. Retry the same checkout shortly." },
    };
  active++;
  let client;
  try {
    client = await (await getInitializedDbPool()).connect();
  } catch (error) {
    active--;
    throw error;
  }
  const digest = createHash("sha256")
    .update(serializeHodlCheckout(request))
    .digest("hex");
  let lost = false;
  const onError = () => {
    lost = true;
  };
  client.on("error", onError);
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1),607)", [
      buyer + ":" + id,
    ]);
    const { rows } = await client.query(
      "SELECT request_digest,response FROM hodl_checkout_requests WHERE buyer_pubkey=$1 AND checkout_id=$2",
      [buyer, id]
    );
    let result: Result;
    if (rows[0])
      result =
        rows[0].request_digest === digest
          ? {
              ...rows[0].response,
              body: { ...rows[0].response.body, reused: true },
            }
          : {
              statusCode: 409,
              body: {
                error:
                  "This checkout already has different details. Resume it from Orders or start a new checkout.",
              },
            };
    else {
      result = await create(client);
      if (lost) throw new Error("Checkout lock lost");
      if (result.statusCode >= 200 && result.statusCode < 300)
        await client.query(
          "INSERT INTO hodl_checkout_requests(buyer_pubkey,checkout_id,request_digest,response) VALUES($1,$2,$3,$4)",
          [buyer, id, digest, JSON.stringify(result)]
        );
    }
    await client.query("COMMIT");
    return result;
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      lost = true;
    }
    throw error;
  } finally {
    client.removeListener("error", onError);
    client.release(lost);
    active--;
  }
}
