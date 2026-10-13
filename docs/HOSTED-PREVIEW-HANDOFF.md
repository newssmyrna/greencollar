# GreenCollar hosted preview handoff

## Current deployment

The existing owner-only Site is live at [GreenCollar actual-app preview](https://greencollar-actual-app-preview.nobleloach1.chatgpt.site).

- Site ID: `appgprj_6ace74f5f8548191b9bdb42f82f4c663`
- Access: custom allowlist containing only the owner; no groups or external viewers. Preserve this policy.
- Saved Site version 1: `appgprj_6ace74f5f8548191b9bdb42f82f4c663~appgver_91a10ed6c384819185d4402529e72a23`
- Deployment: `appgdep_6ace87b3af188191bf319f67ac3f9c7b`, status `succeeded` (2026-10-13 UTC)
- Site source-repository commit: `3908d1aa0bbdbab8c7e025501f21350039fcdc2e`

Deployment success confirms publication only. No hosted browser/phone visual QA or owner visual acceptance is recorded yet. Keep the UI task marked **INCOMPLETE — OWNER VISUAL ACCEPTANCE PENDING** until the owner opens the URL and checks the intended screens.

## Source and artifact mapping

The Site package was produced from the successful Expo web export for app source commit `76912dfa09af6c00ab6ae2336fad6a710c9b1bce`:

- [GitHub Actions run 38445403402](https://github.com/newssmyrna/greencollar/actions/runs/38445403402)
- Workflow artifact ID: `11837809194`, artifact name `greencollar-expo-web`
- Artifact ZIP SHA-256: `818990e69fbf67f3adb56fde337f5c492a580c3788424181ad5acc4d716e6039`
- ZIP contents: `index.html` (1,181 bytes), `AppEntry.js` (1,155,874 bytes), and `metadata.json` (49 bytes)
- The artifact expires on 2026-10-20 at 18:17 UTC; check availability before relying on it.

The Expo app commit and the Site source-repository commit are different revisions: the first identifies the built application; the second identifies the static Site package. Keep both in deployment receipts. PR #85 documents the original visual-preview work: [newssmyrna/greencollar#85](https://github.com/newssmyrna/greencollar/pull/85).

## What this preview shows

This is the real Expo web export, with five tabs: Today, Customers, Planner, Invoices, and Schedule. It is a visual, read-only preview using sample fixtures, enabled by `EXPO_PUBLIC_GREENCOLLAR_APP_PREVIEW=true`. It does not connect Clerk authentication, Cloudflare API actions, production services, or real customer data. Treat interactive data as fixtures; the preview does not demonstrate authenticated or backend workflows, and it is not evidence of production readiness.

## Preflight before future UI edits

Before changing UI or beginning substantial design work, verify that the approved delivery path is still usable:

1. Read the existing Site and access policy. Confirm the exact Site ID above, active stable URL, owner-only allowlist, current live version, and the existing source repository. Never create another Site or broaden access.
2. Confirm GitHub access to the intended app revision and a downloadable web-export artifact; verify the artifact checksum and its source commit before editing or packaging.
3. Confirm the supported Sites helper and native Sites publishing tools are available in the current permitted environment. The helper used for this publish was `/home/agent/.codex/plugins/cache/openai-curated-remote/sites/1.0.1/scripts/site-workflow.mjs`. If source access or publication is blocked, stop before UI edits and report the exact failed check and smallest unblock. Do not use a denied path, network escalation, or alternate host.
4. In the Site package checkout, confirm `.openai/hosting.json` points to the existing project ID and that `static.directory` is `dist`. If the project ID is missing, use the installed official `set-project-id.mjs` helper for this existing Site before opening the source workflow; never call `create_site`.
5. Keep credentials short-lived and in memory/hidden stdin only. Pass only the exact returned credential fields required by the official helper; never print or save tokens.

## Repeatable publish procedure

1. Download the verified Expo artifact through the GitHub workflow-artifact tool and check its SHA-256 before extraction. Confirm the three expected files and source commit.
2. In the existing Site source checkout, put those files unchanged in `dist/`, preserve the Site metadata, and prepare/push/package using the supported `site-workflow.mjs` helper. The Site manifest must retain the same `project_id` and `static.directory: "dist"`.
3. Confirm that the helper's pushed source HEAD is the exact full commit SHA used for the package. Save the package archive path and its file/hash manifest.
4. For a new intended revision, call the native private save-and-deploy operation once for the existing Site, supplying that pushed source SHA and the absolute package-archive path. Do not separately save and deploy the same operation.
5. Check the returned deployment until terminal. Record the exact app source commit, artifact ID and checksum, Site source commit, Site version ID, deployment ID/status, and stable URL. Confirm the Site remains owner-only.
6. Complete browser checks on the hosted URL (including the requested tab/state and a phone-sized viewport) and record what was actually seen. Deployment success alone is not visual QA or owner acceptance.

A repeat-preparation check after version 1 reused Site source commit `3908d1aa0bbdbab8c7e025501f21350039fcdc2e` from a clean worktree. The newly built archive had the same four-path/file-hash map as the deployed archive (Site manifest plus the three `dist/` files). That check created no extra Site version or deployment; it verifies packaging repeatability only, not a second publish.

## Rollback

Version 1 above is the first saved/deployed version and is the current baseline. Before each later publish, record the then-current live version ID and deployment ID. If a later deployment fails, keep the current live version intact. If a later version succeeds but must be rolled back, redeploy the previously saved owner-private version using the native private-version deployment operation, after confirming the Site is still owner-only. Do not delete old versions or change the audience as a workaround.
