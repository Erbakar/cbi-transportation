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

Each newly extracted cargo line retains its full goods description followed by its own REF/VES.NO/PO in editable Cargo Description, as confirmed by the operator. Marks & Numbers contains only separate explicit shipping marks. Existing submitted records are immutable; saved extractions are not silently rewritten. Both fields remain editable before submission. HS/HTS, NCM and CUS remain distinct; absent NCM/CUS codes are not populated. New unsaved forms default payment method to Other (D), with six editable individual charge rows: origin haulage/port Prepaid–Forwarder, basic freight/destination port/destination haulage/additional Collect–Consignee. This operator-approved template must be saved and validated; existing saved choices and submitted records are preserved. Payment locations remain empty for operator selection. Payment locations are verified against INTTRA geography before the record becomes ready.

Gemini's wire schema uses keyed field and party arrays to stay within schema complexity limits. The server validates every required key, rejects duplicates/missing roles, then normalizes the response into the application's field maps. Source extraction and user overrides remain separate.

## Pausing a platform

Production (`wrangler.production.json`) and local preview (`vite.config.ts`) currently set `PAUSED_PLATFORMS=tmaxx` while a dedicated account is pending. The guard blocks session acquisition, reference lookup, preflight and transfer to T-MAXX. INTTRA may finish independently; the overall record remains partial and T-MAXX's previous journal is retained. Remove the pause only after configuring the new account and reconciling any earlier ambiguous T-MAXX writes.

## Recovery

`platform_steps` records each request fingerprint before it is attempted. A completed step returns its persisted result without replaying it. An ambiguous result blocks resubmission, document replacement and deletion. Known review rejection can be corrected and retried. Partial platform success remains visible. Business keys prevent two application records submitting the same booking/container set.

Production INTTRA submission succeeded on 2026-09-17. Existing submitted instructions are immutable in this application and must not be resubmitted to apply mapping fixes. Their submitted information and SI number are shown in the detail panel. The authenticated JSON receipt endpoint is retained for technical diagnostics and is not offered in the operator interface. The INTTRA relay remains on the operator's computer through a temporary Cloudflare tunnel; a permanent hosted relay is still needed for unattended availability.

## Platform gateway on the VDS — since 2026-11-19

INTTRA traffic no longer depends on the Mac. The relay (`scripts/inttra-relay.mjs` and its modules) runs unchanged on a dedicated Ubuntu server and is reached through a named Cloudflare Tunnel on a fixed hostname. This server is meant to become the gateway for every platform integration (T-MAXX, INTTRA, MSC, CMA CGM and later ones); for now only INTTRA goes through it.

- **Server**: Ubuntu 26.04 LTS, `188.132.153.246`, SSH key login as `kadir` (`ssh -i ~/.ssh/cbi_vds -o IdentitiesOnly=yes kadir@188.132.153.246`). ufw allows only SSH; nothing else listens publicly. Unattended security updates are on (also for the Google Chrome and cloudflared apt repositories).
- **Relay service** `cbi-gateway.service`: system user `cbi-gateway`, code in `/opt/cbi-gateway` (root-owned: only the relay modules plus `json5`, `pdf-lib`, `puppeteer-core` at the app's locked versions), key in `/etc/cbi-gateway/relay.key` (600, owner `cbi-gateway`), state/HOME in `/var/lib/cbi-gateway`. It listens on `127.0.0.1:18744` only, starts at boot, restarts on failure and logs to journald (`sudo journalctl -u cbi-gateway`). Environment: `RELAY_KEY_FILE`, `CHROME_EXECUTABLE_PATH=/usr/bin/google-chrome-stable`, `PDFTOPPM_BIN=/usr/bin/pdftoppm`.
- **Tunnel service** `cloudflared-cbi.service`: named tunnel `cbi-gateway` (`c78ee03c-5901-46e3-b952-8c8ba55c15d5`), hostname `relay.trade-commerce.com` → `http://127.0.0.1:18744`, config `/etc/cloudflared/config.yml`, credentials `/etc/cloudflared/credentials.json` (600, owner `cloudflared`). The address never changes, so no process rewrites `INTTRA_RELAY_URL` any more.
- **Worker secrets**: `INTTRA_RELAY_URL=https://relay.trade-commerce.com`, `INTTRA_RELAY_KEY` unchanged. Every relay request still needs the Bearer key (401 without it).
- **Checks**: `POST /health` with the Bearer key answers `{"ok":true}`; on the server `systemctl status cbi-gateway cloudflared-cbi`.
- **Updating the relay code** (after a change to a relay module): copy only the changed `scripts/inttra-*.mjs` / `scripts/pdf-pages.mjs` to the server, `sudo install -m 644 -o root -g root <files> /opt/cbi-gateway/scripts/`, then `sudo systemctl restart cbi-gateway`. If a dependency version changes, update `/opt/cbi-gateway/package.json` and run `sudo npm ci --omit=dev` there. Never copy the whole repository, `.env*` or `.private` to the server.
- **Session note**: INTTRA sessions opened from another IP are not accepted from the server. After a move, renew the session once from the connections screen.

The former Mac setup (launchd jobs `com.cbi.inttra.relay` and `com.cbi.inttra.tunnel`, quick tunnel on `*.trycloudflare.com`, `scripts/inttra-tunnel-service.mjs` rewriting the secret) is stopped. Its plists stay in `~/Library/LaunchAgents` as a fallback: `launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.cbi.inttra.{relay,tunnel}.plist` restores it, and the tunnel service then writes its temporary address into the secret again. Do not run both: the Mac tunnel service would overwrite the fixed address.

## INTTRA unavailability and sign-in back-off — 2026-11-18

INTTRA's security wall (AWS, `server: awselb/2.0`) started rejecting automated sign-ins from the Mac with HTTP 403 after repeated logins. Nothing in this application tries to get around such a rejection. Instead:

- **Back-off** (`lib/server/platform-health.ts`, table `platform_health`, migration 0034): a rejected INTTRA sign-in is not tried again until the back-off ends — 403/429: 30 min, doubling up to 6 h; 400/401: 6 h; connection server unreachable: 10 min. Failures more than a day apart start counting again. Saving new INTTRA credentials ends the back-off (a deliberate retry by a person).
- **Session reuse**: an INTTRA session is cached for up to 6 h and renewed only when INTTRA rejects it (one harmless read signs in again once). The connections screen checks INTTRA with that read instead of a forced sign-in. A reused INTTRA review (< 30 min) renews the session with one read before the submit.
- **Mail flow keeps going**: T-MAXX is still required (without it the e-mail waits). When INTTRA is unavailable the instruction is checked (INTTRA's online preflight is skipped; the same checks run in its review later), the HBL is written to T-MAXX, the record becomes `partial`, and the conversation stays `submitting`. The MBL instruction is sent automatically once INTTRA answers; nothing touches either platform while the back-off lasts. After 24 h without INTTRA the conversation goes to staff. The customer is notified once both are created, as before.

## PDF page images when the relay is down

Document reading renders every PDF page to an image before the AI reads it. `lib/server/pdf-visual-pages.ts` uses poppler on the INTTRA connection server while it answers, and otherwise `/pdf-pages` on the `cbi-carrier-browser` Worker: pdf.js (`pdfjs-dist`, pinned) in Cloudflare Browser Rendering, same contract (longer side 2600 px, JPEG q92, ≤ 60 pages, ≤ 30 MB). The page loads nothing from the network; pdf.js is bundled into the Worker as text (`rules` in `wrangler.carrier-browser.json`). A PDF the renderer itself rejects (password, size) is not sent a second time. Page code passed to `page.evaluate` must not define named helpers: the Worker bundler wraps them in `__name`, which the page does not have.

## INTTRA PDF download

Created INTTRA deliveries expose an authenticated, owner-scoped `/api/records/:id/inttra-document` endpoint. The list and detail screen offer the official Shipping Instruction print view as a PDF, not a carrier-issued MBL. The SI reference comes exclusively from the stored successful delivery. No new instruction is submitted.

The relay renders INTTRA's own print page using `puppeteer-core` and installed Chrome (`CHROME_EXECUTABLE_PATH` overrides the system default). Each download uses an isolated browser that closes afterwards, allows only INTTRA GET/HEAD and the read-only `/siact/view` POST, and verifies the returned SI identity before printing. Cookies and PDFs are not persisted by the service. One PDF is rendered at a time. The relay host (the VDS) must be online.


## Local automatic login repair — 2026-10-05

The local preview was missing migration 0002 (encrypted platform credentials) and the platform contract configuration. Those were restored locally. T-MAXX uses the KADIR account from the newer private login document, not the older OZAN credential file. INTTRA uses the existing authenticated relay. No platform documents were submitted during verification.

Root cause of the subsequent 403/401 responses: Vite's dotenv expansion changed literal `$credential:username` and `$credential:password` in PLATFORM_CONTRACTS into `:username` and `:password`. The application therefore submitted invalid literals rather than the stored credentials. Dollar signs must be escaped in local dotenv files; JSON sent directly to Worker secrets must retain ordinary dollar signs. The local configuration is now corrected. An explicit guard rejects the known corrupted placeholder values before making a network request, and regression tests cover Vite parsing and request prevention.

Verification: direct authentication succeeded for both accounts, then the actual local application showed both platforms active. Browser logout followed by login independently returned both platforms to active without clicking reconnect. Four targeted tests and TypeScript passed. This verifies authentication and automatic reconnection, not shipment submission or a production deployment. The automatic check remains attached to the authenticated Konşimentolar screen.
