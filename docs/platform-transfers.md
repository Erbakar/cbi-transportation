# Platform transfer workflow

`POST /api/records/:id/process` reads the source set, applies separately stored operator corrections and validates it. The default/check action performs read-only dictionary lookups and local mapping validation; only the explicit submit action invokes the specialized T-MAXX and INTTRA adapters. Generic unverified contract bodies are no longer used for these two destinations.

## T-MAXX

Requires exactly one existing load matching the complete container set and no conflicting booking. Reads current containers, cargo packs and HBL. Updates containers, matching packs and load totals; creates missing cargo packs and initializes an HBL with the platform's observed `newSeaGoodWaybill` operation when needed. PUT requests refresh the entity version and preserve unrelated fields. Returned identities, versions and written fields are checked before success is recorded.

No matching load, multiple matches, multiple cargo lines for a single T-MAXX container, locks and unresolved container types stop preflight. Creating an entire new position/load is not implemented. This is distinct from creating an HBL on an existing load.

## INTTRA

Uses live authenticated carrier/container/package dictionaries and geography search. The blank schema comes from the platform's `createFormModel` dated 20260727; no shipment/customer data is reused. Document roles keep HBL and MBL parties separate. Operators select carrier, locations, document counts, seal owner and operational/customs choices. The supported builder is standard FCL with carrier-supplied dry containers and zero or one house bill. Special equipment and To Order consignments stop preparation.

Requests use percent-encoded JSON with the platform's observed content type. `/siact/review` may create a draft; its response is persisted, and only warning type 001 can be approved through the UI. A changed payload loses approval. `/siact/submit` uses the reviewed shipment. A validated returned SI number is required for success; submission does not mean carrier approval.

## Field quality and form (2026-09-17)

Current instructions supply actual HBL parties; the old MBL source supplies only MBL parties. The model extracts street, city, country and optional address identifiers separately, retaining source quotes. Missing street/city/country for the supported single-HBL flow blocks preparation. Countries must match the INTTRA dictionary, and field lengths are validated without truncation.

Each cargo line retains its full goods description and its own REF/VES.NO/PO in editable Marks & Numbers. Final placement is awaiting the operator's business confirmation; both fields are editable. HS/HTS, NCM and CUS remain distinct; absent NCM/CUS codes are not populated. Payment method is an explicit mandatory selection, with no automatic default while policy confirmation is pending. Payment locations are verified against INTTRA geography before the record becomes ready.

Gemini's wire schema uses keyed field and party arrays to stay within schema complexity limits. The server validates every required key, rejects duplicates/missing roles, then normalizes the response into the application's field maps. Source extraction and user overrides remain separate.

## Pausing a platform

Production (`wrangler.production.json`) and local preview (`vite.config.ts`) currently set `PAUSED_PLATFORMS=tmaxx` while a dedicated account is pending. The guard blocks session acquisition, reference lookup, preflight and transfer to T-MAXX. INTTRA may finish independently; the overall record remains partial and T-MAXX's previous journal is retained. Remove the pause only after configuring the new account and reconciling any earlier ambiguous T-MAXX writes.

## Recovery

`platform_steps` records each request fingerprint before it is attempted. A completed step returns its persisted result without replaying it. An ambiguous result blocks resubmission, document replacement and deletion. Known review rejection can be corrected and retried. Partial platform success remains visible. Business keys prevent two application records submitting the same booking/container set.

Production INTTRA submission succeeded on 2026-09-17. Existing submitted instructions are immutable in this application and must not be resubmitted to apply mapping fixes. Their original submitted payload and SI number are shown in the detail panel, with an authenticated JSON download (not a carrier-issued B/L). The INTTRA relay remains on the operator's computer through a temporary Cloudflare tunnel; a permanent hosted relay is still needed for unattended availability.

## Local relay supervision

The Mac uses launchd jobs `com.cbi.inttra.relay` and `com.cbi.inttra.tunnel`. They start at login and restart if stopped unexpectedly. `scripts/inttra-tunnel-service.mjs` updates only the Worker's INTTRA_RELAY_URL when Cloudflare assigns a new temporary address; it does not build or deploy application code. The updater uses existing Wrangler authorization and retries an unsuccessful update after 60 seconds without logging secrets. The computer must remain awake and online. This is not a replacement for a hosted relay.
