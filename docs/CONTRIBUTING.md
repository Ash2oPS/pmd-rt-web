# Contributing with humans and AI

Read `AGENTS.md`, the relevant module and its tests. State the intended change. Keep one concern per patch and preserve unrelated work. Reuse the current subsystem before adding abstractions.

## Content

Follow [CONTENT.md](CONTENT.md): copy a record, preserve stable IDs, regenerate derived files and run `npm run check`. Fix references instead of suppressing validation. Never edit generated manifests or JSON schemas manually.

## Code

1. Reproduce a bug or express a mechanic with a focused behavioral test.
2. Make the smallest change in the responsible layer.
3. Run `npm run check`.
4. For runtime/UI/platform changes, build, run production preview, run `npm run test:browser` and inspect screenshots.
5. Report behavior changed, verification and device-specific limits.

Never disable strict typing, raise line limits, add unchecked `any` or suppress errors to pass checks. If a real requirement changes the architecture, explain it and update the rules/tests. Avoid speculative engines for systems not yet implemented.

## Deployment

- `npm run dev` serves sources; `npm run build` produces `dist/`.
- Before publishing this migration, select **GitHub Actions** in repository **Settings → Pages**.
- Push to `main` after validation. `.github/workflows/pages.yml` validates/builds, runs the production browser suite and deploys the built artifact.
- Pull requests verify without deploying. Failed checks block deployment.
- Relative URLs support `https://ash2ops.github.io/pmd-rt-web/`. Verify a built preview under that subpath after asset or service-worker changes.
- The build hashes emitted files to name the offline cache; no manual cache bump is needed.
- Never commit `dist/`, test artifacts or `node_modules/`.

For an old published version: load once to download the update, close every game tab/PWA window, then reopen. Development deliberately retires persistent offline caches.
