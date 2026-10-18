# PMD · Bois de l'Éveil

A small, original-art browser prototype for validating an eventual Mystery Dungeon inspired game on an AYN Thor. This milestone is an exploration room, not a complete fangame.

**Play:** https://ash2ops.github.io/pmd-rt-web/

## Run locally

```sh
npm install
npm run dev
```

Open http://localhost:5173. The game has no runtime dependencies or build step. For PWA installation/offline support, use HTTPS or localhost (an HTTP LAN address is insufficient).

## Controls

| Action | Keyboard | Standard gamepad |
| --- | --- | --- |
| Move | Arrow keys, WASD or ZQSD | D-pad or left stick |
| Menu / resume | Escape | Start (button 9) |
| Confirm | Enter / Space | Thor A / east (button 1) |
| Back | X / Escape | Thor B / south (button 0) |
| Fullscreen | F / menu button | Menu entry (browser permission dependent) |

Touch controls appear on touch devices. All menus support keyboard and gamepad navigation. In **Menu → Commandes**, select an action, release controls, then press a button or move an axis. Mappings persist locally. Button numbers refer to the browser's API, not printed button labels. The sidebar displays the connected device, raw pressed buttons/axes and offline readiness. Start by pressing a physical button if Chrome has not exposed the device yet.

The default face-button layout follows the Thor's Nintendo labels (east A confirms, south B returns). Existing custom mappings are preserved; use **Réinitialiser les commandes** to restore these defaults. X/Y and L1/R1 have no gameplay actions in this milestone, but their raw signals should appear in diagnostics. The meter adapts to the browser's button count.

For device input problems, move both sticks and press the affected buttons, then choose **Copier le diagnostic** from the menu or sidebar. The report records all devices, observed button indices, axis ranges, last keyboard event, wheel event count and API errors. It stays in memory locally until copied; nothing is sent automatically. Real Android native gamepad events cannot be reproduced by desktop signal simulation.

## Saves and suspension

- Position and collectible progress save after each movement and on pause/backgrounding.
- Losing focus, backgrounding, browser freeze or gamepad disconnection pauses the scene. Resume explicitly from the menu.
- Menu provides manual save, JSON export and validated JSON import. Invalid imports preserve current progress.
- Saves belong to this browser profile and website address. Clearing browser data removes them; export a backup. Storage failure is displayed, and export remains available.

## Install and play offline

1. Open the deployed HTTPS URL in Chrome. Wait until **Hors connexion: Prêt**.
2. Use **Installer le jeu** if shown, or Chrome's **Install app / Add to home screen** entry.
3. Launch from the home screen. Once cached, this room works without a network connection.

Browsers may reclaim site storage. Installation UI and fullscreen availability vary by browser. Updates install in the background; close every game tab/window and reopen to activate a new service worker. Bump the cache name in `sw.js` when changing shipped assets.

## AYN Thor acceptance check

- Open Chrome, press a built-in control, confirm device name and raw signals.
- Test D-pad and stick movement, collision, held-input repetition and stick drift.
- Navigate the menu using only physical controls. Remap a button and verify after reload.
- Collect an item, reload and verify position/progress; export and import a backup.
- Sleep and wake the device while moving: the scene must stay paused until explicitly resumed.
- Install the PWA, wait for offline readiness, enable airplane mode and relaunch.

The desktop suite simulates gamepad signals and page suspension. Physical Thor input mapping, actual Android sleep and installation still need this device check. The prototype uses one screen; independent second-screen support is outside this milestone.

## Verification

```sh
npm test
npx playwright install chromium
npm run dev
# In a second terminal:
npm run test:browser
```

Browser artifacts are generated under `output/playwright/` (ignored by Git).

## Deployment

GitHub Pages publishes `main`, repository root `/`. The static app, manifest and service worker use relative paths and work under `/pmd-rt-web/`. No secrets or server are required. No third-party art, fonts or audio are fetched.
