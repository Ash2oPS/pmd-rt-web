---
name: pmd-release
description: Prepare and publish a scoped PMD GitHub Pages release with production checks, safe staging and deployment verification. Use for commit/push or release requests; preparation alone grants no publication permission.
---

# PMD release

Run commands from the repository root. Actual commit/push requires user authorization.
Preserve authorization already given in the conversation; do not ask again for the same authorized action.
Without it, prepare and verify a reviewable change, then request only the missing action.
Never infer permission to send announcements, create tags or alter repository settings.

## Scope the checkpoint

Inspect `git status --short`, the branch, remote and diff before staging.
Identify this task's files and any parallel/user edits. Do not stash, reset or include unrelated work.
When a file mixes changes, stage only reviewed task-owned hunks or stop before an unsafe commit.
Use explicit paths, review `git diff --cached`, and preserve unrelated staged changes.
If existing staged changes prevent a scoped commit, resolve ownership before committing.

For runtime releases, increment the patch using `npm version patch --no-git-tag-version`.
Match `src/app/config.ts` to the resulting package version; `npm run version:check` checks all version sources.
Skills/docs-only changes do not require a gameplay patch or invented runtime validation claims.
Validate their changed instructions/scripts directly; the existing push workflow still verifies the deployed build.
Use an appropriate conventional type and a concrete user-oriented commit outcome.

## Verify before publishing runtime changes

Inspect `.github/workflows/pages.yml` and relevant npm scripts rather than assuming their behavior.
Regenerate changed content first with `npm run content:generate`.
Run `npm run build`; it includes content, asset, type, architecture and unit checks.
Start `npm run preview`, then run `npm run test:browser` against that production preview.
Use the actual preview URL in `TEST_URL` when overriding its configured port.
Review failures and affected screenshots; a build alone does not verify gameplay or visuals.
Publish only after required checks pass. Never substitute raw source files for `dist/`.
Do not request physical Thor testing or make it a deployment gate.

## Commit, push and verify delivery

Commit only the reviewed staged scope, then push the intended branch without force.
For `main`, GitHub Actions builds and publishes `dist/` through the Pages workflow.
For another branch, distinguish a successful push from a production deployment.
Verify the Actions run corresponds to the pushed commit and that deployment succeeds.
Read failure details before a targeted correction; avoid blind repeated pushes.
If deployment cannot be observed, report the unverified stage instead of claiming publication.

Open the deployed game and relevant lab/HUD flow; check the visible version and asset readiness.
For runtime/PWA changes, verify cached-version behavior and offline reload; never force worker activation or clear user saves.
Use the project's close/reopen update flow when an older worker still owns the page.
Finish with commit/version, site link and compact evidence; distinguish desktop proof from hardware behavior.
