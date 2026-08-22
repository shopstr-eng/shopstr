/**
 * MANUAL DIAGNOSTIC TOOL — NOT PART OF THE APP.
 *
 * Throwaway script that proves a raw gRPC connection to a local Polar LND node
 * works end to end: TLS + macaroon auth, `AddHoldInvoice`, `LookupInvoiceV2`.
 * It exists only to de-risk writing the real `LndHodlInvoiceProvider`, imports
 * nothing from `utils/lightning/`, and is safe to delete once real integration
 * testing exists. Never import this from application code.
 *
 * Run it by hand:
 *
 *   LND_HOST=127.0.0.1:10002 \
 *   LND_TLS_CERT_HEX=<hex> \
 *   LND_INVOICE_MACAROON_HEX=<hex> \
 *   node scripts/lnd-test-connection.mjs
 *
 * (Plain `node` — no ts-node/tsx needed. The repo is `"type": "module"`, so
 * this is ESM, same as scripts/run-staged-checks.mjs.)
 *
 * It writes a real hold invoice to whatever node you point it at. Point it at
 * a regtest/Polar node, never at anything holding real funds.
 *
 * Expect one benign warning when LND_HOST is an IP: Node's DEP0123 about
 * setting the TLS ServerName to an IP address. Verification still succeeds
 * because LND's cert carries 127.0.0.1 as an IP SAN. Use `localhost:PORT` to
 * avoid it.
 *
 * Troubleshooting: `Error: self-signed certificate` means the cert you pinned
 * is not byte-identical to the one the node presents (stale, regenerated, or
 * corrupted in transit) — not that self-signed certs are unsupported. Compare
 * fingerprints:
 *   openssl s_client -connect $LND_HOST </dev/null 2>/dev/null \
 *     | openssl x509 -noout -fingerprint -sha256
 */

import { createHash, randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import grpc from "@grpc/grpc-js";
import protoLoader from "@grpc/proto-loader";

// LND's tls.cert is ECDSA; the LND docs require announcing this cipher suite
// or the TLS handshake against the rpc server fails.
process.env.GRPC_SSL_CIPHER_SUITES = "HIGH+ECDSA";

const PROTO_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "utils",
  "lightning",
  "lnd-proto"
);

/**
 * Standard LND client loader options, verbatim from LND's own
 * docs/grpc/javascript.md. These are not stylistic: `keepCase` keeps the proto
 * field names (`payment_request`, not `paymentRequest`), and `longs: String`
 * keeps 64-bit values like `add_index` from silently losing precision through
 * a JS number. Getting these wrong surfaces later as baffling "field is
 * undefined" errors rather than as a loader failure.
 */
const LOADER_OPTIONS = {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
};

const INVOICE_VALUE_SATS = 5000;
const INVOICE_EXPIRY_SECONDS = 300;
const CONNECT_TIMEOUT_MS = 10_000;
const CALL_TIMEOUT_MS = 15_000;

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`✗ Missing required env var ${name}`);
    process.exit(1);
  }
  return value;
}

/** Decode a hex env var, failing loudly rather than yielding a truncated buffer. */
function decodeHexEnv(name) {
  const raw = requireEnv(name).trim();
  if (!/^[0-9a-f]+$/i.test(raw) || raw.length % 2 !== 0) {
    console.error(`✗ ${name} is not valid hex (got ${raw.length} chars)`);
    process.exit(1);
  }
  return Buffer.from(raw, "hex");
}

/** Promisify a unary gRPC stub call and give it an explicit deadline. */
function callUnary(client, method, request) {
  return new Promise((resolve, reject) => {
    client[method](
      request,
      { deadline: Date.now() + CALL_TIMEOUT_MS },
      (error, response) => (error ? reject(error) : resolve(response))
    );
  });
}

async function main() {
  const host = requireEnv("LND_HOST");
  const tlsCert = decodeHexEnv("LND_TLS_CERT_HEX");
  // The macaroon travels as *hex text* in the metadata header. The env var is
  // already hex, so this round-trip through a Buffer is really an assertion
  // that it decodes cleanly before we blame the node for a 401.
  const macaroonHex = decodeHexEnv("LND_INVOICE_MACAROON_HEX").toString("hex");

  console.log("─".repeat(72));
  console.log("LND gRPC connection diagnostic");
  console.log("─".repeat(72));
  console.log(`[1/6] Loading protos from ${PROTO_DIR}`);

  // invoices.proto does `import "lightning.proto"`, so proto-loader needs
  // includeDirs to resolve it; filenames are therefore relative to that dir.
  const packageDefinition = protoLoader.loadSync(
    ["lightning.proto", "invoices.proto"],
    { ...LOADER_OPTIONS, includeDirs: [PROTO_DIR] }
  );
  const proto = grpc.loadPackageDefinition(packageDefinition);
  console.log("      ✓ lightning.proto + invoices.proto loaded");

  console.log("[2/6] Building credentials (TLS + macaroon call credential)");
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

  console.log(`[3/6] Connecting to ${host} (Invoices service)`);
  const invoicesClient = new proto.invoicesrpc.Invoices(host, credentials);

  await new Promise((resolve, reject) => {
    invoicesClient.waitForReady(Date.now() + CONNECT_TIMEOUT_MS, (error) =>
      error ? reject(error) : resolve()
    );
  });
  console.log("      ✓ channel ready");

  // Fresh CSPRNG preimage. The payment hash is sha256 over the raw 32 bytes —
  // hashing the hex *text* instead yields a digest no node will ever match
  // (the same trap payment-hash.ts calls out).
  const preimage = randomBytes(32);
  const paymentHash = createHash("sha256").update(preimage).digest();
  console.log("[4/6] Generated preimage");
  console.log(`      preimage    : ${preimage.toString("hex")}`);
  console.log(`      payment_hash: ${paymentHash.toString("hex")}`);

  console.log(
    `[5/6] Calling AddHoldInvoice (value=${INVOICE_VALUE_SATS} sats, expiry=${INVOICE_EXPIRY_SECONDS}s)`
  );
  const addResponse = await callUnary(invoicesClient, "AddHoldInvoice", {
    memo: "shopstr hodl escrow connection test",
    hash: paymentHash,
    value: INVOICE_VALUE_SATS,
    expiry: INVOICE_EXPIRY_SECONDS,
  });
  console.log("      ✓ AddHoldInvoice response received");
  console.log(`      payment_request: ${addResponse.payment_request}`);
  console.log(`      add_index      : ${addResponse.add_index}`);
  console.log(
    `      payment_addr   : ${Buffer.from(addResponse.payment_addr).toString("hex")}`
  );
  console.log("      full response:");
  console.log(JSON.stringify(addResponse, bufferToHexReplacer, 2));

  console.log("[6/6] Calling LookupInvoiceV2 with the same payment hash");
  const invoice = await callUnary(invoicesClient, "LookupInvoiceV2", {
    payment_hash: paymentHash,
  });
  console.log("      ✓ LookupInvoiceV2 response received");
  console.log(`      state       : ${invoice.state}`);
  console.log(`      value       : ${invoice.value}`);
  console.log(`      expiry      : ${invoice.expiry}`);
  console.log(
    `      r_hash      : ${Buffer.from(invoice.r_hash).toString("hex")}`
  );
  console.log(`      settled     : ${invoice.settled}`);

  console.log("─".repeat(72));
  const hashMatches =
    Buffer.from(invoice.r_hash).toString("hex") === paymentHash.toString("hex");
  if (invoice.state === "OPEN" && hashMatches) {
    console.log("✓ PASS — hold invoice created and looked up, state=OPEN");
  } else {
    console.log(
      `✗ UNEXPECTED — state=${invoice.state} (wanted OPEN), r_hash matches=${hashMatches}`
    );
    process.exitCode = 1;
  }
  console.log("─".repeat(72));

  invoicesClient.close();
}

/** Render Buffer/Uint8Array proto `bytes` fields as hex instead of byte arrays. */
function bufferToHexReplacer(_key, value) {
  if (value && value.type === "Buffer" && Array.isArray(value.data)) {
    return Buffer.from(value.data).toString("hex");
  }
  return value;
}

main().catch((error) => {
  console.error("─".repeat(72));
  console.error("✗ FAILED");
  console.error(`  message: ${error.message}`);
  if (error.code !== undefined) console.error(`  grpc code: ${error.code}`);
  if (error.details) console.error(`  details: ${error.details}`);
  console.error("─".repeat(72));
  process.exit(1);
});
