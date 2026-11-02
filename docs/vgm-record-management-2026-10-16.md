# VGM record management — 2026-10-16

Live version: 342288e6-2610-4450-b4d2-0a9a55c3d1ff.

- Standalone VGM records now expose deletion for unsent queued/blocked/prepared jobs. Server requires matching owner, null booking, send_authorized=0 and allowed state; one atomic update hides the row and sets blocked. Original payload and diagnostics remain recoverable in storage.
- Migration 0026 adds nullable deleted_at. Backup taken privately before schema change. Legacy migration runner tried already-applied 0024 and rolled back on existing-table error; 0026 was then applied directly. Both prior VGM jobs remain. Do not blindly rerun older migrations: migration history needs reconciling against the actual schema first.
- Changed payloads for the same booking/container are rejected even when the earlier job is blocked. Identical blocked payloads reuse the existing job. A dedicated retry endpoint rechecks an unsent blocked job without adding a record or authorizing submission.
- Extension 0.2.2 waits for the declaration URL and complete navigation before preparing the form; previously it could send a prepare message to the old account page and stop on wrong_page. Same host permissions; installed extension reloaded and live heartbeat confirms 0.2.2.
- 13 job tests and TypeScript checks pass. Live auth/route smoke check confirmed T-MAXX and INTTRA connected and existing consignment records unchanged. Real carrier submission remains disabled pending end-to-end verification.

Live verification after release: clicked Retry on the existing 7950 kg / ISB2086617 / TRHU3971713 job. It transitioned queued → preparing → prepared and returned “CMA hesabı ve VGM alanları doğrulandı. Gönderim yapılmadı.” No new job created. Both original rows remain; deletion controls are visible. No real carrier submission was made. Existing consignment/auth/platform smoke checks passed after final deployment.

## Authorized real submission attempt
User explicitly authorized enabling and submitting ISB2086617 / TRHU3971713 / 7950 kg / Ozan Kaman. Enabled CMA_SUBMISSION_ENABLED, submitted the existing prepared job once through the platform UI. Job entered submitting then unknown because no confirmed success was read. CMA's own dashboard, All page 3, still showed MISSING / No VGM for this container after the attempt. Did not retry, clear its unknown state, or claim carrier acceptance. Re-disabled CMA_SUBMISSION_ENABLED pending diagnosis of the final submit/result step. Authentication and T-MAXX/INTTRA read smoke checks passed and existing consignment records remained unchanged. Login and form preparation are proven; successful real submission is NOT proven. Preserve the unknown job and reconcile it against the carrier before any resend.
