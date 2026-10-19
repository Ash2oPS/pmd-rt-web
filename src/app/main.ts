import { field, movementSettings } from "../content/catalog.ts";
import { createStorage } from "../platform/storage.ts";
import { downloadSave, toggleFullscreen } from "../platform/files.ts";
import { bindControls } from "../platform/controls.ts";
import { bindLifecycle } from "../platform/lifecycle.ts";
import { setupOffline } from "../platform/offline.ts";
import {
  ACTIONS,
  rawSignals,
  bindingLabel,
} from "../platform/input/mapping.ts";
import type { Action } from "../platform/input/mapping.ts";
import { createRenderer } from "../rendering/renderer.ts";
import { Menu, actionLabels } from "../ui/menu.ts";
import { createToast, element } from "../ui/dom.ts";
import { updateHUD } from "../ui/hud.ts";
import { createDiagnosticsView } from "../ui/diagnostics.ts";
import { GamepadController } from "./gamepad.ts";
import { Runtime } from "./runtime.ts";
import { VERSION } from "./config.ts";
import { setupPokemon } from "./pokemon.ts";
import { setupInputPreferences } from "./input-preferences.ts";
import { selectMovement } from "../platform/input/movement.ts";
import { setupCombat } from './combat.ts';
import { bindSaveImport } from './save-import.ts';
import { resolveActionClock } from '../domain/action-clock.ts';

const toast = createToast(),
  storage = createStorage(field),
  runtime = new Runtime(field, storage.state, movementSettings.playerMaxSpeed);
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
let combat: ReturnType<typeof setupCombat>;
const pokemon = setupPokemon(field, () => runtime.velocity, () => combat?.snapshot() ?? null);
combat = setupCombat(field, runtime, () => pokemon.isReady, {
  canAct: () => !menu.paused,
  clear: () => clear(), toast,
  bindingLabel: slot => bindingLabel(pad.mapping[(['attack1', 'attack2', 'attack3', 'attack4'] as const)[slot]!]),
  controlLabel: action => bindingLabel(pad.mapping[action]),
});
const renderer = createRenderer(
  element<HTMLCanvasElement>("game"),
  {
    map: field.map,
    collectibles: field.collectibles,
    tileSize: field.tileSize,
  },
  reducedMotion,
  pokemon.draw,
  pokemon.drawPlayer,
  combat,
);
let lastFrame = performance.now();
function clear() {
  controls.clear();
  runtime.clear();
  pad.suppress();
}
function hud() {
  updateHUD(runtime.state, field.collectibles.length, storage.available);
}
function save(manual = false, replaceInvalid = false) {
  const saved = storage.save(runtime.state, { replaceInvalid });
  element("save-status").textContent = saved ? "Enregistrée" : "Indisponible";
  if (manual)
    toast(
      saved
        ? "Position sauvegardée."
        : "Stockage indisponible. Exporte ta sauvegarde depuis le menu.",
    );
  return saved;
}
function fullscreen() {
  void toggleFullscreen().catch(() =>
    toast(
      "Plein écran indisponible ici. Essaie le bouton tactile ou installe le jeu.",
    ),
  );
}
const menu = new Menu({
  pause() {
    save();
    combat.suspendAudio();
    pad.cancel();
    clear();
  },
  resume() {
    pad.cancel();
    clear();
    runtime.previous = new Set(ACTIONS);
    lastFrame = performance.now();
  },
  capture(action) {
    if (!pad.start(action)) {
      toast("Connecte une manette et appuie sur un bouton.");
      return;
    }
    menu.message(
      `${actionLabels[action]} : relâche, puis appuie sur une commande. Échap pour annuler.`,
    );
  },
  commands: {
    resume: () => menu.resume(),
    save: () => save(true),
    controls: () => menu.controls(pad.mapping),
    journal: () => menu.journal(),
    fullscreen,
    export: () => {
      downloadSave(runtime.state);
      toast("Sauvegarde exportée.");
    },
    import: () => element<HTMLInputElement>("import-file").click(),
    diagnostic: () => {
      void diagnosticsView.copy();
    },
    combat: () => { if (combat.startDefault()) menu.resume(); },
    ...combat.partnerCommands(() => menu.resume()),
    ...combat.equipCommands(),
    lab: () => { location.href = new URL('lab.html', location.href).href; },
    sound: () => combat.toggleSound(),
  },
});
const pad = new GamepadController(VERSION, storage.mapping, {
  disconnect: () =>
    menu.open("Manette déconnectée. Reconnecte-la pour reprendre.", false),
  persist(mapping) {
    if (!storage.saveMapping(mapping))
      toast(
        "Commandes actives pour cette session seulement : stockage indisponible.",
      );
  },
  captured(action, binding) {
    toast(`${actionLabels[action]} : ${bindingLabel(binding)}`);
    menu.renderBindings(pad.mapping);
    menu.highlight();
    menu.message("Commande enregistrée. Relâche avant de continuer.");
    runtime.previous = new Set(ACTIONS);
    clear();
  },
});
setupInputPreferences(pad);
const diagnosticsView = createDiagnosticsView(
  pad.diagnostics,
  () => pad.mapping,
  (message) => {
    toast(message);
    if (menu.paused) menu.message(message);
  },
);
const controls = bindControls({
  paused: () => menu.paused,
  capturing: () => !!pad.capture,
  cancelCapture() {
    pad.cancel();
    menu.message("Modification annulée.");
  },
  fullscreen,
  touch(action) {
    if (!["up", "down", "left", "right"].includes(action)) {
      act(action);
      runtime.previous.add(action);
    }
  },
  recordKey(event) {
    pad.diagnostics.snapshot.lastKey = { key: event.key, code: event.code };
  },
});
element("reset-mapping").addEventListener("click", () => {
  pad.reset();
  menu.renderBindings(pad.mapping);
  menu.highlight();
  toast("Commandes réinitialisées.");
});
bindSaveImport(field, runtime, { save: () => save(false, true), imported: () => combat.leave(), hud, toast });
bindLifecycle({
  clear,
  save,
  visible() {
    lastFrame = performance.now();
  },
  suspend(reason) {
    clear();
    combat.suspendAudio();
    menu.open(reason, false);
  },
});
function act(action: Action) {
  if (pad.capture) return;
  if (!menu.paused && combat.resultAction(action)) return;
  if (action === "menu" || action === "back") {
    if (!menu.paused) menu.open();
    else if (menu.submenu) menu.open();
    else menu.resume();
    return;
  }
  if (menu.paused) {
    if (action === "up" || action === "down")
      menu.navigate(action === "down" ? 1 : -1);
    else if (action === "confirm") menu.confirm();
    return;
  }
  const slot = (['attack1', 'attack2', 'attack3', 'attack4'] as const).findIndex(candidate => candidate === action);
  if (slot >= 0) combat.attack(slot);
}
let saveElapsed = 0, hudElapsed = 0, wasMoving = false;
let worldAdvancing = false;
function update(dt: number) {
  const actions = pad.poll(menu.paused || combat.finished ? 'menu' : 'play');
  diagnosticsView.update(pad.current);
  if (document.hidden) {
    clear();
    runtime.previous = new Set(actions);
    return;
  }
  const local = controls.actions();
  runtime.updateInput(new Set([...local, ...actions]), dt, act, menu.paused || combat.finished);
  if (menu.paused) return;
  const movement = selectMovement(local, pad.movementSelection());
  const held = new Set([...local, ...actions]);
  const clock = resolveActionClock({ movement: movement.vector, aimOnly: held.has('aim'), wait: held.has('wait'),
    playerBusy: combat.playerBusy, paused: false }, dt);
  worldAdvancing = clock.worldDt > 0;
  if (clock.facing && !combat.facingLocked) runtime.state.facing = clock.facing;
  const multiplier = combat.movementMultiplier;
  const result = runtime.advance({ x: clock.movement.x * multiplier, y: clock.movement.y * multiplier }, clock.worldDt);
  pad.diagnostics.snapshot.movement = { ...movement, maxSpeed: runtime.maxSpeed,
    resolvedSpeed: Math.hypot(runtime.velocity.x, runtime.velocity.y) };
  pokemon.update(clock.worldDt);
  const wasFinished = combat.finished;
  combat.update(clock.worldDt, dt);
  if (!wasFinished && combat.finished) { clear(); runtime.previous = new Set(ACTIONS); }
  saveElapsed += dt;
  hudElapsed += dt;
  if (result.collected.length) toast(runtime.state.collected.length === field.collectibles.length
    ? "Les trois éclats sont réunis. Belle première expédition !" : "Un éclat de lumière retrouvé !");
  if ((result.moved && saveElapsed >= .5) || (wasMoving && !result.moved) || result.collected.length) {
    save(); saveElapsed = 0;
  }
  if (hudElapsed >= .1 || result.collected.length) { hud(); hudElapsed = 0; }
  wasMoving = result.moved;
}
function draw() {
  renderer.draw(runtime.state, runtime.visual, runtime.time);
}
function frame(now: number) {
  const dt = Math.min(0.05, Math.max(0, (now - lastFrame) / 1000));
  lastFrame = now;
  update(dt);
  draw();
  requestAnimationFrame(frame);
}
window.render_game_to_text = () =>
  JSON.stringify({
    coordinates: "Continuous tile units; integer coordinates are tile centers, x right, y down",
    mode: menu.paused ? "menu" : "play",
    player: runtime.state.player,
    steps: runtime.state.steps,
    movement: { ...runtime.velocity, deadzone: pad.deadzone, ...pad.diagnostics.snapshot.movement },
    collected: runtime.state.collected,
    crystals: field.collectibles.filter(
      (_, i) => !runtime.state.collected.includes(i),
    ),
    map: field.map,
    submenu: menu.submenu,
    journalOpen: menu.screen === "journal",
    camera: renderer.camera,
    pokemon: pokemon.snapshot(runtime.time, runtime.state, runtime.visual),
    combat: combat.snapshot(),
    combatPresentation: combat.presentation(),
    equippedMoves: combat.equippedMoves().map(move => move?.id ?? null),
    worldClock: { advancing: worldAdvancing, time: runtime.time },
    capture: pad.capture,
    mapping: pad.mapping,
    gamepad: pad.current
      ? {
          id: pad.current.id,
          index: pad.current.index,
          mapping: pad.current.mapping,
          signals: rawSignals(pad.current),
        }
      : null,
    storage: storage.available,
    inputDiagnostics: pad.diagnostics.snapshot,
    offline: element("offline-status").textContent,
  });
window.advanceTime = (ms) => {
  const steps = Math.max(1, Math.ceil(ms / (1000 / 60)));
  for (let i = 0; i < steps; i++) update(ms / steps / 1000);
  draw();
};
document
  .querySelectorAll(".build")
  .forEach((node) => (node.textContent = `BUILD ${VERSION}`));
if (storage.invalidSave)
  setTimeout(
    () => toast("Sauvegarde illisible conservée. Partie temporaire : exporte ta progression ou importe une sauvegarde valide."),
    500,
  );
setupOffline(
  element("offline-status"),
  element<HTMLButtonElement>("install"),
  toast,
);
hud();
draw();
requestAnimationFrame(frame);
