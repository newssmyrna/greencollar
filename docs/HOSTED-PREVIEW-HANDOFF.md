# GreenCollar hosted preview handoff

## Current release status

The existing owner-only private Site has a successful deployment of the worker travel/arrival and visit-evidence preview described in [PR #88](https://github.com/newssmyrna/greencollar/pull/88).

This is a public repository. It intentionally omits the private Site URL, project/version/deployment IDs, private Site source commit, and credentials. Keep those details only in the owner-authorized Sites record and private release receipt; do not add them here.

## App source and tested export

- App source branch: `codex/worker-travel-arrive-photo`
- App source/export commit: `a61320658edaa550a041581ded25da4ea5a6f5a4`
- PR evidence/artifact head: `4ad58d68cdeba70aa652fb4f2beac0c3f12a78a1`
- The PR README, checksum, archive and screenshots were added after the app source commit; no app source files changed between the export source and evidence/artifact head.
- Export archive: [`greencollar-worker-travel-arrive-photo-export.tar.gz`](https://github.com/newssmyrna/greencollar/blob/4ad58d68cdeba70aa652fb4f2beac0c3f12a78a1/docs/ui-preview/worker-travel-arrive-photo/greencollar-worker-travel-arrive-photo-export.tar.gz)
- Archive size: 314,577 bytes. SHA-256: `e19d014738e21ac593838356413e7d60cfe8beadb577f7eaadaf4cf32ae61a9b`
- The archive contains the tested Expo static `dist/` export; its HTML references the expected hashed app bundle.

## Included behavior and limits

The sample worker flow separates beginning travel, confirming arrival, and starting the visit timer. It shows assigned sample-drive duration and estimated arrival, preserves the existing route/lunch/delay/conflict/return-estimate UI, saves notes locally while typing, and supports previewing/removing up to two compressed local sample photos per visit. Local sample state survives reloads and replanning; photos remain visible after completion.

Travel, arrival, timer, notes, photos, route, and invoice examples are fictional browser-local preview data. The preview does not use device GPS, live navigation, customer messaging, real authentication, backend writes, real billing, or payment processing. Browser photo picking is local only; native Expo photo picking is not implemented. Do not represent the preview as a connected or production workflow.

## Recorded checks

The PR handoff records:

- `npm run typecheck` — passed.
- `npm test` — 338 passed, 0 failed.
- Expo web export — passed.
- Local browser smoke — passed the start-day → travel → reload → arrival → timer → note/photo add, cap and remove → reload → pause/resume → completion → next-stop → travel flow, with zero JavaScript errors and zero external requests.

These are local-source/export checks, not hosted visual QA. After publication, check the intended hosted screen/state and a phone-sized viewport, then record the actual visual verification and owner acceptance separately. A successful Site deployment alone does not complete that gate.

## Preflight before future UI edits

Before substantial UI or design work, confirm the supported release path is available:

1. Read the existing Site and its current access policy. Confirm it is the same owner-only destination, the intended private URL is available to the owner, and the prior known-good version remains available for rollback. Keep the private URL and all Site identifiers out of this public repository.
2. Confirm the app source revision and downloadable artifact, verify the SHA-256, and inspect the export before making UI edits.
3. Confirm the installed official Sites source helper and native Sites publish operations are available in the permitted environment. If source access or publication is blocked, stop before UI edits and report the exact failed check and smallest unblock. Do not use denied paths, network escalation, alternate hosts, or broader sharing.
4. In the existing Site source checkout, preserve its existing Site project identity and ensure the static manifest points to `dist`. Never create another Site for this preview.
5. Use only a short-lived source-write credential when specifically authorized for the publish. Pass it through hidden stdin, never log or save it, and clear it after source push/package preparation.

## Repeatable private publish procedure

1. Fetch the approved Expo artifact from the public PR and verify the recorded checksum before extraction.
2. In the existing Site source checkout, replace `dist/` with the verified export unchanged; preserve the Site manifest and existing project identity.
3. Use the installed official Sites source workflow to commit, push and package the exact source state. Verify its returned full source commit and archive before publication.
4. Use the native private save-and-deploy operation once for the existing owner-only Site, supplying that exact source commit and archive. Do not create a new Site, change its access policy, or separately save and deploy the same operation.
5. Read back the deployment until terminal and confirm it remains on the intended private Site. Keep the URL, Site project/version/deployment IDs, private package commit, and credential details only in the private receipt/Sites record; never write them into this public repository.
6. Complete hosted browser checks and owner review separately. Record what was actually checked; do not claim hosted visual QA based on source tests or a deployment response.

## Rollback

Before any later publish, confirm the current known-good version remains saved and record its private identifier in the owner-only receipt. If a later release must be rolled back, use the native private-version deployment operation to restore that saved version after reconfirming owner-only access. Keep release identifiers and URLs out of this public document; never change the audience as a rollback workaround.
