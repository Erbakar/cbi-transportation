# Platform transfer workflow

`POST /api/records/:id/process` reads the source set, applies separately stored operator corrections, validates it, then invokes the specialized T-MAXX and INTTRA adapters. Generic unverified contract bodies are no longer used for these two destinations.

## T-MAXX

Requires exactly one existing load matching the complete container set and no conflicting booking. Reads current containers, cargo packs and HBL. Updates containers, matching packs and load totals; creates missing cargo packs and initializes an HBL with the platform's observed `newSeaGoodWaybill` operation when needed. PUT requests refresh the entity version and preserve unrelated fields. Returned identities, versions and written fields are checked before success is recorded.

No matching load, multiple matches, multiple cargo lines for a single T-MAXX container, locks and unresolved container types stop preflight. Creating an entire new position/load is not implemented. This is distinct from creating an HBL on an existing load.

## INTTRA

Uses live authenticated carrier/container/package dictionaries and geography search. The blank schema comes from the platform's `createFormModel` dated 20260727; no shipment/customer data is reused. Document roles keep HBL and MBL parties separate. Operators select carrier, locations, document counts, seal owner and operational/customs choices. The supported builder is standard FCL with carrier-supplied dry containers and zero or one house bill. Special equipment and To Order consignments stop preparation.

Requests use percent-encoded JSON with the platform's observed content type. `/siact/review` may create a draft; its response is persisted, and only warning type 001 can be approved through the UI. A changed payload loses approval. `/siact/submit` uses the reviewed shipment. A validated returned SI number is required for success; submission does not mean carrier approval.

## Recovery

`platform_steps` records each request fingerprint before it is attempted. A completed step returns its persisted result without replaying it. An ambiguous result blocks resubmission, document replacement and deletion. Known review rejection can be corrected and retried. Partial platform success remains visible. Business keys prevent two application records submitting the same booking/container set.

Production transmission has not yet been exercised with a new, unused shipment. The previously captured example must not be resubmitted. The INTTRA relay remains on the operator's computer through a temporary Cloudflare tunnel; a permanent hosted relay is still needed for unattended availability.

## Local relay supervision

The Mac uses launchd jobs `com.cbi.inttra.relay` and `com.cbi.inttra.tunnel`. They start at login and restart if stopped unexpectedly. `scripts/inttra-tunnel-service.mjs` updates only the Worker's INTTRA_RELAY_URL when Cloudflare assigns a new temporary address; it does not build or deploy application code. The updater uses existing Wrangler authorization and retries an unsuccessful update after 60 seconds without logging secrets. The computer must remain awake and online. This is not a replacement for a hosted relay.
