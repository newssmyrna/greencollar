# Visual definition of done

This acceptance gate applies to every GreenCollar task whose success depends on what the owner sees or does in the interface: visual design, layout, copy, routes, interactions, or other visible behavior.

## Non-negotiable acceptance

A UI task is **not complete** until the owner can open the approved hosted URL and visually see the exact requested change in the intended screen/state. An implementer’s local build, successful test run, local server, source diff, or screenshot by itself is not hosted delivery and does not satisfy owner acceptance.

Until the owner has verified the hosted result, report the task as **INCOMPLETE — OWNER VISUAL ACCEPTANCE PENDING**. Do not claim “done,” “delivered,” or equivalent, and do not invent a completion percentage.

## Required delivery evidence

For each UI task, leave a concise, repository-visible record with:

1. The exact requested change and the screen/state where it should appear.
2. The source branch and exact pushed commit SHA.
3. Relevant automated checks actually run, with pass/fail and any checks not run.
4. The exact build or published artifact and its source-commit mapping.
5. The hosted Site version/deployment identifier and deployment result, mapped to that same source/build.
6. The approved hosted URL and confirmation that the owner can open it.
7. Visual verification on the hosted page at the relevant screen/state. Record what was checked; attach a screenshot only as supporting evidence, never as a substitute for the hosted page.
8. The owner’s explicit visual acceptance, or the exact remaining blocker and next action.
9. The previous working version and the available rollback path.

Update the relevant documentation when the source, publishing steps, URL, deployed revision, or verified behavior changes. A source commit, build artifact, deployment, visual QA, and owner acceptance are separate evidence.

## Approved GreenCollar destination and current work

The existing owner-only Site is now published at [the GreenCollar actual-app preview](https://greencollar-actual-app-preview.nobleloach1.chatgpt.site). Its current version and deployment succeeded; the [hosted-preview handoff](HOSTED-PREVIEW-HANDOFF.md) records the immutable app-artifact/source/Site mapping, tested publish and repeat-preparation steps, fixture limitations, and rollback path. The Site access policy is owner-only.

A successful deployment is not owner visual acceptance. No hosted browser/phone visual QA or explicit owner acceptance is recorded yet, so UI work remains **INCOMPLETE — OWNER VISUAL ACCEPTANCE PENDING** until the owner opens the URL and checks the intended screen/state. PR #85 documents the earlier pre-deployment work; recheck this handoff and the actual Site state rather than relying on the PR’s historical “not deployed” description.

Before substantial feature or design work, verify the existing approved publish path and confirm that the owner can reach the intended destination. Use only the existing owner-approved private Site and workflow; do not create another Site, alternate preview, or host to work around a blocked publish. If the approved URL, deployment capability, or owner access is unavailable, mark the task **INCOMPLETE**, stop further feature/design work, and report the exact failing step, observed error, source revision, and smallest unblock needed.

## Visual and behavior checks

- Verify the requested change on the approved hosted URL after deployment, not only in a local browser or build.
- Check the intended page/state and a relevant phone-sized viewport. Confirm the change is visible, legible, and not obscured or broken by layout; also check relevant interruptions or repeated actions for interaction changes.
- Run the applicable automated checks for the changed behavior. Clearly separate passed, failed, and not-run checks.
- Distinguish the connected GreenCollar product from a sample, static, or read-only preview. Label any sample workspace and fixtures as preview-only; state plainly when authentication, Cloudflare API actions, real data, or integrations are unavailable. A visual demo does not prove those connected behaviors work.
- Do not use fake production data or make unsupported backend, authentication, billing, or production-readiness claims.

## When delivery is blocked

A failed or unavailable deployment means **INCOMPLETE**, even if the code and local checks are ready. Stop further feature/design work and report the exact blocker, what was tried, the affected source revision, and the next owner action. Do not switch to another host, create a new preview, make the app public, broaden access, or make production claims without owner approval.

Preserve the previous working version before publishing. Record its identifier and how to restore it; never overwrite or discard the rollback path.