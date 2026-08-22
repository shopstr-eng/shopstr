/**
 * MANUAL DIAGNOSTIC TOOL — NOT PART OF THE APP.
 *
 * Throwaway script, same category as scripts/lnd-test-connection.mjs. Not
 * integrated into hodl-seller-payout.ts or any app code, not run in CI.
 * Imports nothing from utils/lightning/. Safe to delete once its question
 * stays answered, but kept around as a re-runnable check — see below.
 *
 * Answers one question: called via raw gRPC with only `payment_request` set
 * (no dest/amt/payment_hash), does `routerrpc.Router/SendPaymentV2` succeed
 * using a macaroon scoped to *only* `SendPaymentV2` + `TrackPaymentV2`, or
 * does LND's server-side implementation itself require `DecodePayReq` (and
 * the `info:read` permission that grants it), regardless of how the client
 * constructs the call?
 *
 * WHAT IT PROVED: no. `SendPaymentV2` called directly over gRPC with only
 * `payment_request` set needs neither a separate `DecodePayReq` call nor
 * `info:read`. `lncli`'s own `payinvoice`/`sendpayment` commands call
 * `DecodePayReq` themselves first, as a client-side convenience so they can
 * show a confirmation prompt — that is lncli's behavior, not a requirement
 * LND's RPC imposes. It is also why testing this macaroon through `lncli`
 * fails with `permission denied` (lncli's own DecodePayReq call gets
 * rejected) even though the exact same macaroon succeeds when
 * `SendPaymentV2` is called directly, as this script does.
 *
 * WHY IT MATTERS: per mentor direction, the payment macaroon is scoped to
 * exactly `SendPaymentV2` and `TrackPaymentV2` — not admin access, not
 * `info:read`. This result confirms that narrow scope is sufficient for the
 * real payer in hodl-seller-payout.ts (via lnd-payment-client.ts); there is
 * no need to widen it just because `lncli` alone couldn't exercise it.
 *
 * RE-RUNNING THIS (e.g. after an LND upgrade, or if the macaroon scope is
 * ever revisited): needs a fresh, unexpired, unattempted invoice created
 * beforehand — via Polar or `lncli addinvoice` — passed in as shown below.
 * Point this at a regtest/Polar node only, never at anything holding real
 * funds.
 *
 *   LND_HOST=127.0.0.1:10002 \
 *   LND_TLS_CERT_HEX=<hex> \
 *   LND_PAYMENT_MACAROON_HEX=<hex> \
 *   node scripts/lnd-payment-test.mjs <bolt11-invoice>
 *
 * Or hardcode the invoice in INVOICE below instead of passing argv[2].
 */

import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import grpc from "@grpc/grpc-js";
import protoLoader from "@grpc/proto-loader";

process.env.GRPC_SSL_CIPHER_SUITES = "HIGH+ECDSA";

const PROTO_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "utils",
  "lightning",
  "lnd-proto"
);

// Set a fresh invoice here to skip passing it on the command line.
const INVOICE = "";

const LOADER_OPTIONS = {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
};

const FEE_LIMIT_SAT = 1000;
const CONNECT_TIMEOUT_MS = 10_000;
const STREAM_TIMEOUT_MS = 30_000;

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`✗ Missing required env var ${name}`);
    process.exit(1);
  }
  return value;
}

function decodeHexEnv(name) {
  const raw = requireEnv(name).trim();
  if (!/^[0-9a-f]+$/i.test(raw) || raw.length % 2 !== 0) {
    console.error(`✗ ${name} is not valid hex (got ${raw.length} chars)`);
    process.exit(1);
  }
  return Buffer.from(raw, "hex");
}

/** Render Buffer/Uint8Array proto `bytes` fields as hex instead of byte arrays. */
function bufferToHexReplacer(_key, value) {
  if (value && value.type === "Buffer" && Array.isArray(value.data)) {
    return Buffer.from(value.data).toString("hex");
  }
  return value;
}

function logPaymentUpdate(payment) {
  console.log(`      status         : ${payment.status}`);
  if (payment.payment_hash) {
    console.log(`      payment_hash   : ${payment.payment_hash}`);
  }
  if (payment.payment_preimage) {
    console.log(`      payment_preimage: ${payment.payment_preimage}`);
  }
  if (
    payment.failure_reason &&
    payment.failure_reason !== "FAILURE_REASON_NONE"
  ) {
    console.log(`      failure_reason : ${payment.failure_reason}`);
  }
}

const TERMINAL_STATUSES = new Set(["SUCCEEDED", "FAILED"]);

/**
 * Consume a server-streaming Payment call until a terminal status, the
 * stream ends, or it errors. Resolves with the last Payment update seen (or
 * null if the stream ended without one), rejects on stream error.
 */
function consumePaymentStream(call, { timeoutMs = STREAM_TIMEOUT_MS } = {}) {
  return new Promise((resolve, reject) => {
    let lastPayment = null;
    const timer = setTimeout(() => {
      call.cancel();
      reject(new Error(`stream timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    call.on("data", (payment) => {
      lastPayment = payment;
      logPaymentUpdate(payment);
      if (TERMINAL_STATUSES.has(payment.status)) {
        clearTimeout(timer);
        call.cancel();
        resolve(lastPayment);
      }
    });
    call.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    call.on("end", () => {
      clearTimeout(timer);
      resolve(lastPayment);
    });
  });
}

async function main() {
  const invoice = (process.argv[2] || INVOICE).trim();
  if (!invoice) {
    console.error(
      "✗ No invoice given. Pass one as argv[1] or set INVOICE at the top of this script."
    );
    process.exit(1);
  }

  const host = requireEnv("LND_HOST");
  const tlsCert = decodeHexEnv("LND_TLS_CERT_HEX");
  const macaroonHex = decodeHexEnv("LND_PAYMENT_MACAROON_HEX").toString("hex");

  console.log("─".repeat(72));
  console.log("LND SendPaymentV2 / DecodePayReq permission diagnostic");
  console.log("─".repeat(72));
  console.log(`[1/5] Loading protos from ${PROTO_DIR}`);

  // router.proto does `import "lightning.proto"` (for the streamed
  // lnrpc.Payment type), so proto-loader needs includeDirs to resolve it.
  const packageDefinition = protoLoader.loadSync(
    ["lightning.proto", "router.proto"],
    { ...LOADER_OPTIONS, includeDirs: [PROTO_DIR] }
  );
  const proto = grpc.loadPackageDefinition(packageDefinition);
  console.log("      ✓ lightning.proto + router.proto loaded");

  console.log(
    "[2/5] Building credentials (TLS + payment macaroon call credential)"
  );
  const sslCreds = grpc.credentials.createSsl(tlsCert);
  const macaroonCreds = grpc.credentials.createFromMetadataGenerator(
    (_args, callback) => {
      const metadata = new grpc.Metadata();
      metadata.add("macaroon", macaroonHex);
      callback(null, metadata);
    }
  );
  const credentials = grpc.credentials.combineChannelCredentials(
    sslCreds,
    macaroonCreds
  );
  console.log(
    `      ✓ TLS cert ${tlsCert.length} bytes, macaroon ${macaroonHex.length / 2} bytes`
  );

  console.log(`[3/5] Connecting to ${host} (Router service)`);
  const routerClient = new proto.routerrpc.Router(host, credentials);

  await new Promise((resolve, reject) => {
    routerClient.waitForReady(Date.now() + CONNECT_TIMEOUT_MS, (error) =>
      error ? reject(error) : resolve()
    );
  });
  console.log("      ✓ channel ready");

  console.log(
    `[4/5] Calling SendPaymentV2 with ONLY payment_request set (fee_limit_sat=${FEE_LIMIT_SAT})`
  );
  console.log("      dest/amt/payment_hash deliberately left unset");

  let finalPayment = null;
  let sendPaymentError = null;
  try {
    const call = routerClient.SendPaymentV2({
      payment_request: invoice,
      fee_limit_sat: FEE_LIMIT_SAT,
    });
    finalPayment = await consumePaymentStream(call);
  } catch (error) {
    sendPaymentError = error;
  }

  console.log("─".repeat(72));
  if (sendPaymentError) {
    const mentionsDecodePayReq = /DecodePayReq/i.test(
      `${sendPaymentError.message} ${sendPaymentError.details || ""}`
    );
    const isPermissionDenied =
      sendPaymentError.code === grpc.status.PERMISSION_DENIED ||
      /permission denied/i.test(sendPaymentError.message);

    if (isPermissionDenied) {
      console.log("✗ SendPaymentV2 FAILED — permission denied");
      console.log(`  message: ${sendPaymentError.message}`);
      if (sendPaymentError.details)
        console.log(`  details: ${sendPaymentError.details}`);
      if (mentionsDecodePayReq) {
        console.log(
          "  → ANSWER: the denial mentions DecodePayReq — LND's server-side call\n" +
            "    chain for SendPaymentV2 itself requires that permission, independent\n" +
            "    of client behavior. The two granted permissions are NOT sufficient."
        );
      } else {
        console.log(
          "  → permission denied, but NOT on DecodePayReq — some OTHER method is\n" +
            "    required server-side. Check the message/details above for which one."
        );
      }
    } else {
      console.log("✗ SendPaymentV2 FAILED — unexpected (non-permission) error");
      console.log(`  message: ${sendPaymentError.message}`);
      if (sendPaymentError.code !== undefined)
        console.log(`  grpc code: ${sendPaymentError.code}`);
      if (sendPaymentError.details)
        console.log(`  details: ${sendPaymentError.details}`);
    }
    console.log("─".repeat(72));
    process.exit(1);
  }

  if (!finalPayment) {
    console.log("✗ UNEXPECTED — stream ended with no Payment update at all");
    console.log("─".repeat(72));
    process.exit(1);
  }

  console.log(
    `→ ANSWER: no DecodePayReq/permission error. payment_request alone reached a\n` +
      `  terminal state (${finalPayment.status}) using only the two granted\n` +
      `  permissions. Full response:`
  );
  console.log(JSON.stringify(finalPayment, bufferToHexReplacer, 2));
  console.log("─".repeat(72));

  if (finalPayment.status !== "SUCCEEDED") {
    console.log(
      `Note: terminal status was ${finalPayment.status}, not SUCCEEDED — the\n` +
        `permission question is answered (no DecodePayReq needed), but the\n` +
        `payment itself did not settle. See failure_reason above if present.`
    );
    console.log("─".repeat(72));
  }

  const paymentHashHex = finalPayment.payment_hash;
  if (!paymentHashHex) {
    console.log(
      "✗ Cannot run TrackPaymentV2 — SendPaymentV2 stream never surfaced a payment_hash."
    );
    routerClient.close();
    return;
  }

  console.log(
    `[5/5] Calling TrackPaymentV2 with payment_hash=${paymentHashHex}`
  );
  console.log(
    "      (hash taken from SendPaymentV2's own stream, no DecodePayReq call)"
  );
  try {
    const trackCall = routerClient.TrackPaymentV2({
      payment_hash: Buffer.from(paymentHashHex, "hex"),
    });
    const trackedPayment = await consumePaymentStream(trackCall);
    console.log("─".repeat(72));
    if (trackedPayment) {
      console.log(
        `✓ TrackPaymentV2 succeeded using only the granted macaroon permissions.\n` +
          `  final status: ${trackedPayment.status}`
      );
    } else {
      console.log(
        "✗ TrackPaymentV2 stream ended with no Payment update at all."
      );
    }
    console.log("─".repeat(72));
  } catch (error) {
    console.log("─".repeat(72));
    console.log("✗ TrackPaymentV2 FAILED");
    console.log(`  message: ${error.message}`);
    if (error.code !== undefined) console.log(`  grpc code: ${error.code}`);
    if (error.details) console.log(`  details: ${error.details}`);
    console.log("─".repeat(72));
  }

  routerClient.close();
}

main().catch((error) => {
  console.error("─".repeat(72));
  console.error("✗ FAILED (unhandled)");
  console.error(`  message: ${error.message}`);
  if (error.code !== undefined) console.error(`  grpc code: ${error.code}`);
  if (error.details) console.error(`  details: ${error.details}`);
  console.error("─".repeat(72));
  process.exit(1);
});
