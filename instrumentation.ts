/**
 * Next.js server-process startup hook. `register()` runs once per server
 * instance, before the first request, in the same Node process that serves
 * the API routes.
 *
 * Today its only job is starting the hold-invoice watcher
 * ({@link file://./utils/lightning/hodl-invoice-watcher.ts}).
 *
 * ## Why here, and not a standalone worker script
 *
 * The watcher needs a long-lived process, which a request/response API route
 * cannot give it. The obvious alternative — a `scripts/*.mjs` runner started
 * separately, following `scripts/lnd-test-connection.mjs` — does not actually
 * work for this repo, for two independent reasons:
 *
 *  1. Nothing would start it. Deployment is a single process: the Dockerfile
 *     ends in `CMD ["node", "server.js"]` and `.replit` runs `npm start`.
 *     There is no process manager, no second service in `docker-compose.yml`
 *     (which defines only Postgres), and adding one is deployment
 *     configuration rather than code.
 *  2. It could not load this code. `lnd-test-connection.mjs` runs under plain
 *     `node` only because it imports nothing from `utils/`. The watcher must
 *     import `utils/db/db-service.ts`, whose module graph uses `@/` path
 *     aliases and type-only imports written as value imports (for example
 *     `import { NostrEvent } from "../types/types"`). Node's type stripping
 *     resolves neither, and the repo has no `tsx`/`ts-node` and no build step
 *     that emits a standalone worker bundle.
 *
 * `instrumentation.ts` is compiled by Next like the rest of the app and runs
 * in the process that already exists, so it needs no new dependency, no new
 * build output, and no deployment change.
 *
 * ## Keep `process.*` out of this file
 *
 * Next compiles the instrumentation hook for both the Node.js and the Edge
 * runtime, and gives the edge copy the middleware webpack layer — where the
 * bundler warns on every `process.*` member access except `process.env`, even
 * on a branch the `NEXT_RUNTIME` guard below makes unreachable. Those
 * warnings are cosmetic (the Node copy is what runs, and the watcher starts
 * normally with them present), but they are also noisy and they read like a
 * failure. Anything here that needs a Node API therefore goes behind the
 * dynamic import, which the edge compile does not follow — the same reason
 * `pg` and `@grpc/grpc-js` raise nothing from this file.
 *
 * `process.env` is exempt from the check and is fine to read directly.
 *
 * ## What that costs, honestly
 *
 * The watcher's lifetime is the server's. On a platform that runs several
 * instances, each opens its own set of subscriptions to the same orders —
 * wasteful but not harmful, since every update goes through
 * `updateHodlEscrowOrderStatusIfAdvancing`, which is row-locked and refuses
 * anything that is not a forward move. On a platform that scales to zero
 * (Replit's `autoscale` target, which `.replit` selects) there may be no
 * watcher at all for stretches of time.
 *
 * Neither case loses a transition: `POST /api/lightning/sync-hodl-orders`
 * sweeps every pending order against the provider and is unaffected by any of
 * this. The watcher makes status updates prompt; the sweep makes them
 * certain. A deployment that wants the watcher to be reliably present should
 * run it on an always-on instance.
 *
 * Off unless `HODL_INVOICE_WATCHER=1`. Opt-in rather than automatic because
 * it holds one gRPC stream per pending order for as long as the process
 * lives, which is not something a deployment should acquire by upgrading.
 */
export async function register() {
  // Also invoked for the edge runtime, which has no gRPC and no pg.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.HODL_INVOICE_WATCHER !== "1") return;

  // Imported dynamically, inside the runtime guard, so the edge bundle never
  // pulls in the database and Lightning modules.
  const { startHodlInvoiceWatcher, installHodlWatcherShutdownHandlers } =
    await import("@/utils/lightning/hodl-invoice-watcher");

  try {
    const result = await startHodlInvoiceWatcher();
    if (result.started) {
      // console.warn rather than console.log: this repo's lint allows only
      // warn/error, and a watcher that came up watching nothing is worth
      // seeing anyway.
      console.warn(
        `Hodl invoice watcher started: watching ${result.watching} pending ` +
          `order(s), ${result.failed} could not be subscribed`
      );
    } else {
      // `subscriptions-unsupported` has already logged its own explanation.
      console.warn(`Hodl invoice watcher not started: ${result.reason}`);
    }
  } catch (error) {
    // Never fatal. A server that cannot open subscriptions must still serve
    // requests; the sweep keeps order status correct meanwhile.
    console.error(
      `Hodl invoice watcher failed to start: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    return;
  }

  // Closes the open streams on shutdown. Deliberately called rather than
  // written here — see the note in installHodlWatcherShutdownHandlers, and
  // the "Edge runtime" section above.
  installHodlWatcherShutdownHandlers();
}
