# PMD · Explorations

A browser game with human-editable content, strict TypeScript, validated data and small modules. Explore the forest with a persistent field encounter: Bulbizarre is hostile, the other visitors stay neutral, and your equipped attacks work directly on the map. Recruitment and a complete Pokémon roster are future work.

## Start

Use Node.js **22.12 or newer**.

```sh
npm ci
npm run dev
```

Open http://localhost:5173. Development uses live updates and retires old offline caches. Existing local saves and controller mappings are retained.

## Add content

Copy an existing JSON record under `content/`, give it a stable ID, and run:

```sh
npm run content:generate
npm run check
```

See [the content guide](docs/CONTENT.md) for species, moves, abilities, items, maps and references. VS Code provides field completion through generated JSON schemas. The starter values are illustrative balance, not a canonical database.

## Structure

| Location | Responsibility |
| --- | --- |
| `content/` | One JSON record per species, move, ability, item or dungeon |
| `src/content/` | Types, validation and generated catalog |
| `src/domain/` | Pure game state and rules |
| `src/platform/` | Browser inputs, storage, lifecycle and installation |
| `src/rendering/` | Canvas scene, camera and pixel art |
| `src/ui/` | Menus, HUD, diagnostics and styles |
| `src/app/` | Composition and game loop |
| `scripts/`, `tests/` | Generation, architecture checks and verification |

[Architecture](docs/ARCHITECTURE.md) explains boundaries. [Contribution rules](docs/CONTRIBUTING.md) explain the human/AI workflow. [AGENTS.md](AGENTS.md) is the instruction entry point for coding agents.

## Verify and build

```sh
npm run build
npx playwright install chromium
npm run preview
# In another terminal:
npm run test:browser
```

`build` checks content, types, architecture and unit tests before generating `dist/` and its offline cache. Browser checks run against production preview on port 5173; stop development first. For a second port, use `node node_modules/vite/bin/vite.js preview --port 5174` and set `TEST_URL` for browser tests.

Checks reject forbidden dependency directions, cycles, explicit `any`, checking bypasses and TypeScript modules above 350 lines. Warnings start at 300. Generated manifests are exempt from size limits only.

## Controls and saves

- Arrows/WASD/ZQSD, touch or gamepad move the explorer.
- Escape / Start opens the menu. Thor east A confirms; south B returns. Remap under **Commandes**.
- F or **Plein écran** toggles fullscreen where supported.
- **Carnet et connexion** contains progress, device status and copyable input diagnostics.
- Four face buttons or J/K/L/I launch the equipped slots during exploration; equipment remains in the pause menu. Rondoudou initially knows Écras’Face and Berceuse, with two empty slots. In menus, east A confirms and south B returns; Start opens pause. All controller actions can be remapped.
- At rest, Pokemon keep their Idle animations while movement and combat mechanics freeze. Moving, holding R/Space to wait or preparing/executing/recovering from your attack advances world time normally. Hold L/Shift and move the stick to face a direction without moving or advancing time. Enemy amber aim becomes a locked orange zone before impact. Touch provides the same actions.
- Progress saves automatically. JSON export/import and legacy version-1 saves remain supported.
- Clicking elsewhere clears held input and saves without pausing. Hiding/freezing the page or disconnecting the controller still pauses.
- The canvas fills the viewport without stretching pixels.

The **Atelier capacités** menu opens `lab.html`: edit patterns, timings, effects and sprites with a live preview, undo/redo and separate browser drafts. Export JSON bundles, then integrate them with `npm run attack:apply`; see [attack authoring](docs/ATTACK-AUTHORING.md).

## Offline and deployment

Production installs as a PWA. Wait for **Hors connexion : Prêt** before testing airplane mode. Export save backups before clearing browser data. Updates activate after all old game tabs/windows close.

The Pages workflow verifies, builds and publishes **only `dist/`**. Pages must use **GitHub Actions** as its source. Repository-root publication cannot execute TypeScript sources. See [deployment instructions](docs/CONTRIBUTING.md#deployment).

Physical Thor controls and Android sleep/install require device testing after relevant platform changes. Desktop simulations are regression checks, not hardware proof. Independent second-screen support is outside this milestone.
