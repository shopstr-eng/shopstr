# LND wire definitions

These are deliberately limited client-side subsets of LND's protobuf API, not
replacement server definitions. Only the four invoice RPCs, two payment RPCs, and GetInfo
used by Shopstr are included. GetInfo and InvoiceHTLC fields provide the current
block height and actual accepted-payment deadline. Unknown response fields are ignored by protobuf.
Keep package names, RPC names, message names, field numbers/types and enum values
identical to LND when changing this subset.

Sources: [invoice RPCs](https://github.com/lightningnetwork/lnd/blob/v0.18.5-beta/lnrpc/invoicesrpc/invoices.proto),
[router RPCs](https://github.com/lightningnetwork/lnd/blob/v0.18.5-beta/lnrpc/routerrpc/router.proto),
[shared messages](https://github.com/lightningnetwork/lnd/blob/v0.18.5-beta/lnrpc/lightning.proto).
The original full definitions remain in this branch's git history.

Run `hodl-regtest.test.ts` against real LND when changing these definitions.
