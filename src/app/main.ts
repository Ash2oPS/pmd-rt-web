import { field } from "../content/catalog.ts";
import { restore } from "../domain/state.ts";
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

const toast = createToast(),
  storage = createStorage(field),
  runtime = new Runtime(field, storage.state);
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const pokemon = setupPokemon(field);
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
);
let lastFrame = performance.now();
function clear() {
  controls.clear();
  runtime.clear();
}
function hud() {
  updateHUD(runtime.state, field.collectibles.length, storage.available);
}
function save(manual = false) {
  const saved = storage.save(runtime.state);
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
    pad.cancel();
    clear();
  },
  resume() {
    pad.cancel();
    clear();
    runtime.previous = new Set(["confirm", "menu", "back"]);
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
    act(action);
    runtime.touch(action);
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
element<HTMLInputElement>("import-file").addEventListener(
  "change",
  async (event) => {
    const input = event.currentTarget as HTMLInputElement,
      file = input.files?.[0];
    if (!file) return;
    try {
      if (file.size > 65536) throw new Error("size");
      const state = restore(await file.text(), field);
      if (!state) throw new Error("format");
      runtime.replace(state);
      const saved = save();
      hud();
      toast(
        saved
          ? "Sauvegarde importée."
          : "Importée pour cette session. Stockage indisponible.",
      );
    } catch {
      toast("Fichier invalide. Ta progression est conservée.");
    }
    input.value = "";
  },
);
bindLifecycle({
  clear,
  save,
  visible() {
    lastFrame = performance.now();
  },
  suspend(reason) {
    clear();
    menu.open(reason, false);
  },
});
function act(action: Action) {
  if (pad.capture) return;
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
  const before = runtime.state.collected.length;
  if (runtime.direction(action)) {
    save();
    hud();
    if (runtime.state.collected.length > before)
      toast(
        runtime.state.collected.length === field.collectibles.length
          ? "Les trois éclats sont réunis. Belle première expédition !"
          : "Un éclat de lumière retrouvé !",
      );
  }
}
function update(dt: number) {
  const actions = pad.poll();
  diagnosticsView.update(pad.current);
  if (document.hidden) {
    clear();
    runtime.previous = new Set(actions);
    return;
  }
  runtime.updateInput(new Set([...controls.actions(), ...actions]), dt, act);
  if (!menu.paused) runtime.animate(dt, reducedMotion);
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
    coordinates: "Tile grid; origin top-left, x right, y down",
    mode: menu.paused ? "menu" : "play",
    player: runtime.state.player,
    steps: runtime.state.steps,
    collected: runtime.state.collected,
    crystals: field.collectibles.filter(
      (_, i) => !runtime.state.collected.includes(i),
    ),
    map: field.map,
    submenu: menu.submenu,
    journalOpen: menu.screen === "journal",
    camera: renderer.camera,
    pokemon: pokemon.snapshot(runtime.time, runtime.state, runtime.visual),
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
    () => toast("Sauvegarde illisible. Une nouvelle exploration commence."),
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
