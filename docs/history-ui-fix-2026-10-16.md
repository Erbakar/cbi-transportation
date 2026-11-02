# VGM / Pre-alert history and UI fix — 2026-10-16

Live version: 45915c51-f086-4ba0-8373-89172dd18889.

## Changes
- Scoped VGM and Pre-alert card, form, table and spacing styles. Standalone workflows preserved.
- Cloud CMA history now uses the existing authenticated extension queue rather than calling a localhost bridge from Cloudflare. Extension 0.2.1 uses the saved company account, verifies account identity and persists complete history snapshots per owner. Failed refreshes retain prior successful data. The Chrome extension must remain running; MFA/CAPTCHA may still require user interaction.
- T-MAXX archive pages persist per owner on the server. Monthly reads progressively publish results and preserve useful results on a partial failure. New visits hydrate from the server cache.
- Migration 0025 adds history tables only; database backup saved privately before migration. Existing consignment records unchanged.

## Verified live
- CMA: company account verified in background; 70/70 source rows stored, 38 within the last 30 days. VGM list and four-field creation screen visually inspected.
- T-MAXX: 47 reads, zero failures, 489 documents including 79 Pre-alert documents. Live Pre-alert list displays all 79 with download links. Home displays archive and carrier history.
- INTTRA: live history responds successfully; home displays 28 instructions.
- Authenticated APIs and VGM/Pre-alert/bills routes return 200; anonymous APIs return 401, foreign-origin requests 403, invalid forms 422. Login/logout verified.
- T-MAXX and INTTRA connections confirmed connected. Existing two consignment records unchanged.
- 122 regression tests passed; type checking, lint and production build passed.

## Limits
No real consignment, VGM or Pre-alert submission was performed. CMA automatic submission remains disabled; background account verification and history retrieval do not establish successful submission. No forced logout of the user's CMA session was performed. Responsive CSS is implemented; this release's visual checks were on desktop. Local database migration remains to be applied before local development uses the new history tables.
