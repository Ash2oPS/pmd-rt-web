import {
  MAP,
  CRYSTALS,
  ACTIONS,
  initialState,
  move,
  restore,
  defaultMapping,
  validateMapping,
  decodePad,
} from "./core.js";

const $ = (id) => document.getElementById(id);
const canvas = $("game"),
  ctx = canvas.getContext("2d", { alpha: false });
ctx.imageSmoothingEnabled = false;
const SAVE = "pmd-field-save-v1",
  BINDINGS = "pmd-field-bindings-v1";
let state = initialState(),
  mapping = defaultMapping(),
  storageOK = true;
try {
  const raw = localStorage.getItem(SAVE);
  if (raw) {
    state = restore(raw) || state;
    if (!restore(raw))
      setTimeout(
        () => toast("Sauvegarde illisible. Une nouvelle exploration commence."),
        500,
      );
  }
  const saved = JSON.parse(localStorage.getItem(BINDINGS) || "null");
  if (validateMapping(saved)) mapping = saved;
} catch {
  storageOK = false;
}
let mode = "play",
  submenu = false,
  menuIndex = 0,
  capture = null;
let keys = new Set(),
  touch = new Set(),
  previous = new Set(),
  held = "",
  repeat = 0;
let padIndex = null,
  padPresent = false,
  currentPad = null,
  padBaseline = new Set(),
  captureReady = false,
  padNeedsRelease = false;
let visual = { ...state.player },
  t = 0,
  toastTimer,
  lastFrame = performance.now(),
  lastInputLabel = "";
const inputDiagnostics = {
  build: "0.1.1",
  apiAvailable: typeof navigator.getGamepads === "function",
  secureContext: window.isSecureContext,
  error: null,
  devices: [],
  lastKey: null,
  wheelEvents: 0,
};
const observedDevices = new Map();
let lastDiagnosticPaint = 0;

function recordDevices(pads) {
  for (const pad of pads) {
    const key = `${pad.index}:${pad.id}`;
    const axes = [...pad.axes];
    const activeButtons = [...pad.buttons].flatMap((button, index) =>
      button.pressed || button.value > 0.1 ? [index] : [],
    );
    let device = observedDevices.get(key);
    if (!device) {
      device = {
        id: pad.id,
        index: pad.index,
        seenButtons: [],
        axisRanges: [],
      };
      observedDevices.set(key, device);
    }
    Object.assign(device, {
      connected: pad.connected !== false,
      mapping: pad.mapping,
      timestamp: pad.timestamp,
      axes,
      buttonsCount: pad.buttons.length,
      activeButtons,
      seenButtons: [...new Set([...device.seenButtons, ...activeButtons])].sort(
        (a, b) => a - b,
      ),
      axisRanges: axes.map((value, index) => ({
        min: Math.min(device.axisRanges[index]?.min ?? 0, value),
        max: Math.max(device.axisRanges[index]?.max ?? 0, value),
      })),
    });
  }
  for (const device of observedDevices.values()) {
    if (
      !pads.some((pad) => pad.index === device.index && pad.id === device.id)
    ) {
      device.connected = false;
      device.activeButtons = [];
    }
  }
  inputDiagnostics.devices = [...observedDevices.values()];
  if (
    $("input-details").open &&
    performance.now() - lastDiagnosticPaint > 150
  ) {
    $("input-report").textContent = diagnosticReport();
    lastDiagnosticPaint = performance.now();
  }
}
function diagnosticReport() {
  return JSON.stringify(
    {
      ...inputDiagnostics,
      focused: document.hasFocus(),
      browser: navigator.userAgent,
      mapping,
    },
    null,
    2,
  );
}
async function copyDiagnostics() {
  const report = diagnosticReport();
  try {
    await navigator.clipboard.writeText(report);
    toast("Diagnostic copié. Tu peux le coller dans le chat.");
    if (mode === "menu")
      $("pause-reason").textContent =
        "Diagnostic copié. Tu peux le coller dans le chat.";
  } catch {
    $("input-details").open = true;
    $("input-report").textContent = report;
    toast("Copie indisponible. Le rapport est affiché dans Connexion.");
  }
}
$("copy-diagnostics").addEventListener("click", copyDiagnostics);
$("input-details").addEventListener("toggle", () => {
  if ($("input-details").open)
    $("input-report").textContent = diagnosticReport();
});
document.addEventListener(
  "wheel",
  () => {
    inputDiagnostics.wheelEvents++;
  },
  { passive: true },
);
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const labels = {
  up: "Haut",
  down: "Bas",
  left: "Gauche",
  right: "Droite",
  confirm: "Valider",
  back: "Retour",
  menu: "Menu",
};
const keyActions = {
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
  KeyW: "up",
  KeyZ: "up",
  KeyS: "down",
  KeyA: "left",
  KeyQ: "left",
  KeyD: "right",
  Enter: "confirm",
  Space: "confirm",
  Escape: "menu",
  KeyX: "back",
};

function toast(message) {
  $("toast").textContent = message;
  $("toast").classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $("toast").classList.remove("visible"), 2600);
}
function save(manual = false) {
  try {
    localStorage.setItem(SAVE, JSON.stringify(state));
    storageOK = true;
    $("save-status").textContent = "Enregistrée";
    if (manual) toast("Position sauvegardée.");
    return true;
  } catch {
    storageOK = false;
    $("save-status").textContent = "Indisponible";
    if (manual)
      toast("Stockage indisponible. Exporte ta sauvegarde depuis le menu.");
    return false;
  }
}
function clearInputs() {
  keys.clear();
  touch.clear();
  held = "";
  repeat = 0;
}
function menuButtons() {
  return [
    ...(submenu ? $("controls-panel") : $("menu-main")).querySelectorAll(
      "button",
    ),
  ];
}
function highlight() {
  const buttons = menuButtons();
  menuIndex = Math.max(0, Math.min(menuIndex, buttons.length - 1));
  document
    .querySelectorAll(".menu-list button,.secondary-button")
    .forEach((b) => b.classList.remove("selected"));
  buttons[menuIndex]?.classList.add("selected");
}
function pause(reason = "L’aventure t’attend.", focus = true) {
  if (mode === "play") save();
  mode = "menu";
  submenu = false;
  capture = null;
  menuIndex = 0;
  clearInputs();
  $("overlay").hidden = false;
  $("menu-main").hidden = false;
  $("controls-panel").hidden = true;
  $("menu-title").textContent = "Une petite pause.";
  $("pause-reason").textContent = reason;
  $("scene-status").textContent = "En pause";
  highlight();
  if (focus) menuButtons()[0]?.focus({ preventScroll: true });
}
function resume() {
  mode = "play";
  capture = null;
  clearInputs();
  previous = new Set(["confirm", "menu", "back"]);
  $("overlay").hidden = true;
  $("scene-status").textContent = "Exploration";
  canvas.focus({ preventScroll: true });
  lastFrame = performance.now();
}
function bindingLabel(binding) {
  return binding.type === "button"
    ? `Bouton ${binding.index}`
    : `Axe ${binding.index} ${binding.sign > 0 ? "+" : "−"}`;
}
function renderBindings() {
  $("bindings").replaceChildren(
    ...ACTIONS.map((action) => {
      const button = document.createElement("button");
      button.dataset.binding = action;
      const name = document.createElement("span"),
        binding = document.createElement("span");
      name.textContent = labels[action];
      binding.textContent = bindingLabel(mapping[action]);
      button.append(name, binding);
      button.addEventListener("click", () => startCapture(action));
      return button;
    }),
  );
}
function controls() {
  submenu = true;
  menuIndex = 0;
  renderBindings();
  $("menu-main").hidden = true;
  $("controls-panel").hidden = false;
  $("menu-title").textContent = "À ta façon.";
  $("pause-reason").textContent =
    "Croix ou stick · A valider · B retour · Start menu";
  highlight();
  menuButtons()[0]?.focus({ preventScroll: true });
}
function rawSignals(pad) {
  const signals = [];
  pad?.buttons.forEach((button, index) => {
    if (button.pressed || button.value > 0.5)
      signals.push({ type: "button", index });
  });
  pad?.axes.forEach((axis, index) => {
    if (Math.abs(axis) > 0.6)
      signals.push({ type: "axis", index, sign: Math.sign(axis) });
  });
  return signals;
}
function startCapture(action) {
  if (!currentPad) {
    toast("Connecte une manette et appuie sur un bouton.");
    return;
  }
  capture = action;
  captureReady = false;
  padBaseline = new Set(rawSignals(currentPad).map((s) => JSON.stringify(s)));
  $("pause-reason").textContent =
    `${labels[action]} : relâche, puis appuie sur une commande. Échap pour annuler.`;
}
async function fullscreen() {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  } catch {
    toast(
      "Plein écran indisponible ici. Essaie le bouton tactile ou installe le jeu.",
    );
  }
}
function exportSave() {
  const link = document.createElement("a"),
    url = URL.createObjectURL(
      new Blob([JSON.stringify(state, null, 2)], { type: "application/json" }),
    );
  link.href = url;
  link.download = "pmd-sauvegarde.json";
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast("Sauvegarde exportée.");
}
const commands = {
  resume,
  save: () => save(true),
  controls,
  fullscreen,
  export: exportSave,
  import: () => $("import-file").click(),
  diagnostic: copyDiagnostics,
};
document
  .querySelectorAll("[data-menu]")
  .forEach((button) =>
    button.addEventListener("click", () => commands[button.dataset.menu]()),
  );
$("menu-toggle").addEventListener("click", () =>
  mode === "play" ? pause() : resume(),
);
$("controls-back").addEventListener("click", () => pause());
$("reset-mapping").addEventListener("click", () => {
  mapping = defaultMapping();
  persistMapping();
  renderBindings();
  highlight();
  toast("Commandes réinitialisées.");
});
function persistMapping() {
  try {
    localStorage.setItem(BINDINGS, JSON.stringify(mapping));
  } catch {
    toast(
      "Commandes actives pour cette session seulement : stockage indisponible.",
    );
  }
}
$("import-file").addEventListener("change", async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  try {
    if (file.size > 65536) throw new Error("size");
    const restored = restore(await file.text());
    if (!restored) throw new Error("format");
    state = restored;
    visual = { ...state.player };
    const stored = save();
    updateHUD();
    toast(
      stored
        ? "Sauvegarde importée."
        : "Importée pour cette session. Stockage indisponible.",
    );
  } catch {
    toast("Fichier invalide. Ta progression est conservée.");
  }
  event.target.value = "";
});

document.addEventListener("keydown", (event) => {
  inputDiagnostics.lastKey = { key: event.key, code: event.code };
  if (
    event.ctrlKey ||
    event.metaKey ||
    event.altKey ||
    event.target.matches("input")
  )
    return;
  if (event.code === "KeyF" && !event.repeat) {
    event.preventDefault();
    fullscreen();
    return;
  }
  const action = keyActions[event.code];
  if (!action) return;
  // A native focused button handles Enter/Space; this preserves browser user activation.
  if (
    mode === "menu" &&
    action === "confirm" &&
    event.target.tagName === "BUTTON" &&
    !capture
  )
    return;
  event.preventDefault();
  keys.add(action);
  if (capture && action === "menu") {
    capture = null;
    $("pause-reason").textContent = "Modification annulée.";
  }
});
document.addEventListener("keyup", (event) => {
  const action = keyActions[event.code];
  if (action) keys.delete(action);
});
document.querySelectorAll("[data-action]").forEach((button) => {
  const action = button.dataset.action;
  button.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    button.setPointerCapture(event.pointerId);
    // A quick tap can start and end between two animation frames.
    act(action);
    touch.add(action);
    previous.add(action);
    if (["up", "down", "left", "right"].includes(action)) {
      held = action;
      repeat = 0.25;
    }
  });
  for (const name of ["pointerup", "pointercancel", "lostpointercapture"])
    button.addEventListener(name, () => touch.delete(action));
});
document.querySelector(".menu-panel").addEventListener("focusin", (event) => {
  const index = menuButtons().indexOf(event.target);
  if (index >= 0) {
    menuIndex = index;
    highlight();
  }
});
document.addEventListener("keydown", (event) => {
  if (mode !== "menu" || event.key !== "Tab") return;
  const buttons = menuButtons();
  const index = buttons.indexOf(document.activeElement);
  event.preventDefault();
  menuIndex =
    (index + (event.shiftKey ? -1 : 1) + buttons.length) % buttons.length;
  buttons[menuIndex].focus({ preventScroll: true });
  highlight();
});
function suspend(reason) {
  clearInputs();
  pause(reason, false);
  save();
}
document.addEventListener("visibilitychange", () => {
  if (document.hidden)
    suspend("Reprise après veille. Ta position a été sauvegardée.");
  else {
    clearInputs();
    lastFrame = performance.now();
  }
});
window.addEventListener("blur", () =>
  suspend("Jeu mis en pause. Reprends quand tu es prêt."),
);
window.addEventListener("pagehide", () => {
  clearInputs();
  save();
});
document.addEventListener("freeze", () =>
  suspend("Reprise après veille. Ta position a été sauvegardée."),
);
window.addEventListener("gamepaddisconnected", (event) => {
  if (event.gamepad?.index === padIndex) {
    padIndex = null;
    padPresent = false;
    currentPad = null;
    suspend("Manette déconnectée. Reconnecte-la pour reprendre.");
  }
});

function pollPad() {
  let pads = [];
  try {
    pads = navigator.getGamepads
      ? [...navigator.getGamepads()].filter((p) => p && p.connected !== false)
      : [];
    inputDiagnostics.error = null;
  } catch (error) {
    inputDiagnostics.error = `${error.name}: ${error.message}`;
  }
  recordDevices(pads);
  const pad = pads.find((p) => p.index === padIndex) || pads[0] || null;
  if (!pad && padPresent)
    suspend("Manette déconnectée. Reconnecte-la pour reprendre.");
  padPresent = !!pad;
  currentPad = pad;
  padIndex = pad?.index ?? null;
  $("pad-status").textContent = inputDiagnostics.error
    ? "Erreur d’accès"
    : pad
      ? "Connectée"
      : "À connecter";
  $("pad-name").textContent = pad
    ? pad.id
    : inputDiagnostics.error || "Appuie sur un bouton pour la détecter.";
  const signals = rawSignals(pad);
  const signalText = signals.length
    ? signals.map(bindingLabel).join(" · ")
    : pad
      ? "Au repos · zone morte 25 %"
      : "Aucun signal";
  if (signalText !== lastInputLabel) {
    $("raw-input").textContent = signalText;
    lastInputLabel = signalText;
  }
  const buttonCount = Math.min(64, pad?.buttons.length || 17);
  if ($("input-meter").children.length !== buttonCount) {
    $("input-meter").replaceChildren(
      ...Array.from({ length: buttonCount }, (_, i) => {
        const bar = document.createElement("i");
        bar.title = `Bouton ${i}`;
        return bar;
      }),
    );
  }
  [...$("input-meter").children].forEach((bar, i) =>
    bar.classList.toggle(
      "on",
      !!pad?.buttons[i]?.pressed || (pad?.buttons[i]?.value || 0) > 0.5,
    ),
  );
  if (capture && pad) {
    const fresh = signals.filter((s) => !padBaseline.has(JSON.stringify(s)));
    if (signals.length === 0) captureReady = true;
    if (captureReady && fresh.length) {
      mapping[capture] = fresh[0];
      persistMapping();
      toast(`${labels[capture]} : ${bindingLabel(fresh[0])}`);
      capture = null;
      renderBindings();
      highlight();
      $("pause-reason").textContent =
        "Commande enregistrée. Relâche avant de continuer.";
      padNeedsRelease = true;
      previous = new Set(ACTIONS);
      clearInputs();
      return [];
    }
    return [];
  }
  if (padNeedsRelease) {
    if (!signals.length) padNeedsRelease = false;
    return [];
  }
  return decodePad(pad, mapping);
}
function act(action) {
  if (capture) return;
  if (action === "menu" || action === "back") {
    if (mode === "play") pause();
    else if (submenu) pause();
    else resume();
    return;
  }
  if (mode === "menu") {
    if (action === "up" || action === "down") {
      const buttons = menuButtons();
      menuIndex =
        (menuIndex + (action === "down" ? 1 : -1) + buttons.length) %
        buttons.length;
      highlight();
      buttons[menuIndex]?.focus({ preventScroll: true });
      buttons[menuIndex]?.scrollIntoView({ block: "nearest" });
    } else if (action === "confirm") menuButtons()[menuIndex]?.click();
    return;
  }
  const direction = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[
    action
  ];
  if (!direction) return;
  const before = state.collected.length;
  if (move(state, ...direction)) {
    save();
    updateHUD();
    if (state.collected.length > before)
      toast(
        state.collected.length === 3
          ? "Les trois éclats sont réunis. Belle première expédition !"
          : "Un éclat de lumière retrouvé !",
      );
  }
}
function updateHUD() {
  $("crystals").innerHTML = `${state.collected.length} <span>/ 3</span>`;
  $("steps").textContent = `${state.steps} pas`;
  $("coordinates").textContent =
    `${String(state.player.x).padStart(2, "0")} / ${String(state.player.y).padStart(2, "0")}`;
  $("objective-label").textContent =
    state.collected.length === 3 ? "EXPÉDITION RÉUSSIE" : "ÉCLATS RETROUVÉS";
  if (!storageOK) $("save-status").textContent = "Indisponible";
}
function update(dt) {
  const padActions = pollPad();
  if (document.hidden) {
    clearInputs();
    previous = new Set(padActions);
    return;
  }
  const actions = new Set([...keys, ...touch, ...padActions]);
  for (const a of ["menu", "back", "confirm"])
    if (actions.has(a) && !previous.has(a)) act(a);
  const direction = ["up", "down", "left", "right"].find((a) => actions.has(a));
  if (direction) {
    repeat -= dt;
    if (direction !== held || repeat <= 0) {
      act(direction);
      repeat = direction !== held ? 0.25 : 0.14;
    }
    held = direction;
  } else {
    held = "";
    repeat = 0;
  }
  previous = actions;
  if (mode === "play") {
    t += dt;
    const speed = reducedMotion ? 1 : Math.min(1, dt * 20);
    visual.x += (state.player.x - visual.x) * speed;
    visual.y += (state.player.y - visual.y) * speed;
  }
}

// The scene is drawn locally; no external assets are needed online or offline.
const TILE = 32;
function rect(x, y, w, h, color) {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), w, h);
}
function hash(x, y) {
  return Math.abs(Math.sin(x * 127.1 + y * 311.7) * 43758.5453) % 1;
}
function tree(x, y, seed) {
  rect(x + 3, y + 21, 28, 13, "#193e2d");
  rect(x + 14, y + 8, 7, 24, "#574d2d");
  rect(x + 16, y + 12, 3, 18, "#8b7542");
  rect(x - 3, y - 8, 38, 24, "#24563b");
  rect(x + 2, y - 17, 29, 15, "#2e6741");
  rect(x + 8, y - 23, 18, 11, "#377649");
  rect(x - 5, y - 4, 12, 15, "#2c6340");
  rect(x + 22, y - 7, 15, 17, "#234f36");
  rect(x + 4, y - 11, 11, 4, "#4e8551");
  rect(x + 9, y - 19, 10, 4, "#548c51");
  rect(x - 1, y + 1, 8, 4, "#3b7547");
  rect(x + 14, y - 3, 10, 4, "#427d49");
  rect(x + 23, y + 9, 9, 4, "#1b4933");
  if (seed > 0.5) rect(x + 6, y - 9, 3, 3, "#b7a860");
}
function explorer(x, y) {
  const moving =
    Math.abs(visual.x - state.player.x) + Math.abs(visual.y - state.player.y) >
    0.05;
  const bob = moving ? Math.sin(t * 22) * 1.2 : 0;
  y += bob;
  rect(x - 9, y + 9, 21, 5, "#23432b");
  rect(x - 7, y - 19, 5, 13, "#403b29");
  rect(x + 6, y - 20, 5, 14, "#403b29");
  rect(x - 7, y - 14, 5, 13, "#efc45e");
  rect(x + 6, y - 15, 5, 13, "#efc45e");
  rect(x - 9, y - 5, 22, 16, "#edc05b");
  rect(x - 5, y + 10, 6, 4, "#c49a43");
  rect(x + 6, y + 10, 6, 4, "#c49a43");
  rect(x - 6, y - 7, 16, 4, "#f6d77c");
  if (state.facing !== "up") {
    rect(x - 5 + (state.facing === "right" ? 3 : 0), y - 1, 3, 4, "#25382a");
    rect(x + 5 + (state.facing === "left" ? -3 : 0), y - 1, 3, 4, "#25382a");
    rect(x - 8, y + 4, 4, 3, "#d78251");
    rect(x + 9, y + 4, 3, 3, "#d78251");
    rect(x + 1, y + 5, 3, 2, "#92683a");
  }
  rect(x - 9, y + 8, 22, 4, "#c86c4e");
  rect(x + 8, y + 11, 5, 8, "#db8158");
  if (state.facing === "up") {
    rect(x - 5, y + 3, 12, 10, "#8b7045");
    rect(x - 3, y + 4, 8, 3, "#b59b5e");
  } else {
    rect(x - 11, y + 2, 4, 9, "#927444");
    rect(x - 12, y + 4, 3, 5, "#b19a5c");
  }
}
function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  for (let y = 0; y < MAP.length; y++)
    for (let x = 0; x < MAP[y].length; x++) {
      const px = x * TILE,
        py = y * TILE,
        n = hash(x, y),
        tile = MAP[y][x];
      rect(
        px,
        py,
        32,
        32,
        tile === "~"
          ? "#528c7c"
          : ["#6b8750", "#718c54", "#68844c", "#759057"][Math.floor(n * 4)],
      );
      if (tile === "~") {
        rect(
          px + 3,
          py + 7 + (reducedMotion ? 0 : Math.floor(Math.sin(t * 1.4 + x) * 2)),
          12,
          2,
          "#7eaf94",
        );
        rect(px + 15, py + 22, 9, 2, "#3e7b70");
        if (MAP[y - 1]?.[x] !== "~") rect(px, py, 32, 5, "#9aaa70");
      } else {
        for (let i = 0; i < 4; i++) {
          const a = hash(x + i * 3, y + 2),
            b = hash(x + 6, y + i * 5);
          rect(
            px + Math.floor(a * 28),
            py + Math.floor(b * 28),
            2,
            2,
            n > 0.5 ? "#84995e" : "#5e7b48",
          );
        }
        if (n > 0.82) {
          rect(px + 9, py + 17, 2, 5, "#496d43");
          rect(px + 7, py + 16, 3, 2, "#a7b471");
          rect(px + 11, py + 14, 2, 2, "#d4c78b");
        }
      }
    }
  // A soft, worn path leads the eye through the clearing.
  for (let x = 1; x < 23; x++) {
    rect(x * 32, 5 * 32 + 7, 32, 21, "#8b955a");
    rect(x * 32 + 4, 5 * 32 + 10, 8, 2, "#a2a46b");
    rect(x * 32 + 20, 5 * 32 + 24, 5, 2, "#747e4c");
  }
  for (let y = 1; y < 13; y++) {
    rect(15 * 32 + 5, y * 32, 21, 32, "#8b955a");
    if (y % 2 === 0) rect(15 * 32 + 9, y * 32 + 4, 3, 7, "#a0a266");
  }
  // Fallen log and tufts are scenery; the collision grid remains authoritative.
  rect(11 * 32 + 4, 6 * 32 + 8, 82, 40, "#3c5634");
  rect(11 * 32 + 6, 6 * 32 + 6, 76, 30, "#7b6c41");
  rect(11 * 32 + 9, 6 * 32 + 10, 70, 5, "#9d8750");
  rect(11 * 32 + 12, 6 * 32 + 24, 63, 4, "#5c5435");
  rect(11 * 32 + 4, 6 * 32 + 7, 10, 30, "#b3995c");
  rect(11 * 32 + 7, 6 * 32 + 13, 4, 19, "#7a6c42");
  rect(12 * 32 + 20, 6 * 32 + 4, 18, 6, "#426b3b");
  rect(11 * 32 + 18, 6 * 32 + 5, 24, 4, "#5f8645");
  for (let i = 0; i < CRYSTALS.length; i++)
    if (!state.collected.includes(i)) {
      const c = CRYSTALS[i],
        cx = c.x * 32 + 16,
        cy = c.y * 32 + 13 + (reducedMotion ? 0 : Math.sin(t * 2.3 + i) * 2);
      rect(cx - 5, cy + 11, 12, 3, "#5a7342");
      ctx.fillStyle = "#f0d88c";
      ctx.beginPath();
      ctx.moveTo(cx, cy - 7);
      ctx.lineTo(cx + 6, cy);
      ctx.lineTo(cx, cy + 8);
      ctx.lineTo(cx - 6, cy);
      ctx.fill();
      rect(cx - 1, cy - 3, 2, 5, "#fff1bf");
      rect(cx - 11, cy - 8, 2, 2, "#d8c581");
      rect(cx + 9, cy + 5, 2, 2, "#d8c581");
    }
  // Draw entities by row so tree canopies naturally overlap the explorer.
  for (let y = 0; y < MAP.length; y++) {
    if (Math.floor(visual.y) === y)
      explorer(visual.x * 32 + 16, visual.y * 32 + 16);
    for (let x = 0; x < MAP[y].length; x++)
      if (MAP[y][x] === "#") tree(x * 32, y * 32, hash(x, y));
  }
  // Small sunlit leaves, flowers, and a trail marker.
  rect(2 * 32 + 7, 4 * 32 - 3, 5, 28, "#544c31");
  rect(2 * 32 - 1, 4 * 32 - 1, 25, 11, "#c1a66a");
  rect(2 * 32 + 5, 4 * 32 + 3, 12, 2, "#78653e");
  for (let i = 0; i < 18; i++) {
    const x = hash(i, 77) * 768,
      y = hash(i, 23) * 448;
    rect(
      x + (reducedMotion ? 0 : Math.sin(t * 0.5 + i) * 5),
      y + (reducedMotion ? 0 : Math.cos(t * 0.7 + i) * 4),
      2,
      2,
      i % 3 === 0 ? "#e1d58c" : "#a8b770",
    );
  }
  ctx.fillStyle = "#c7d5990a";
  ctx.beginPath();
  ctx.moveTo(220, 0);
  ctx.lineTo(310, 0);
  ctx.lineTo(540, 448);
  ctx.lineTo(370, 448);
  ctx.fill();
}
function frame(now) {
  const dt = Math.min(0.05, Math.max(0, (now - lastFrame) / 1000));
  lastFrame = now;
  update(dt);
  draw();
  requestAnimationFrame(frame);
}
window.render_game_to_text = () =>
  JSON.stringify({
    coordinates: "Tile grid; origin top-left, x right, y down",
    mode,
    player: state.player,
    steps: state.steps,
    collected: state.collected,
    crystals: CRYSTALS.filter((_, i) => !state.collected.includes(i)),
    map: MAP,
    submenu,
    capture,
    mapping,
    gamepad: currentPad
      ? {
          id: currentPad.id,
          index: currentPad.index,
          mapping: currentPad.mapping,
          signals: rawSignals(currentPad),
        }
      : null,
    storage: storageOK,
    inputDiagnostics,
    offline: $("offline-status").textContent,
  });
window.advanceTime = (ms) => {
  const steps = Math.max(1, Math.ceil(ms / (1000 / 60)));
  for (let i = 0; i < steps; i++) update(ms / steps / 1000);
  draw();
};
let installPrompt;
window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  installPrompt = event;
  $("install").hidden = false;
});
$("install").addEventListener("click", async () => {
  if (!installPrompt) return;
  await installPrompt.prompt();
  await installPrompt.userChoice;
  installPrompt = null;
  $("install").hidden = true;
});
window.addEventListener("appinstalled", () => {
  $("install").hidden = true;
  toast("Le jeu est installé. Bonne exploration !");
});
if ("serviceWorker" in navigator) {
  navigator.serviceWorker
    .register("./sw.js")
    .then(async () => {
      await navigator.serviceWorker.ready;
      $("offline-status").textContent = "Prêt";
    })
    .catch(() => {
      $("offline-status").textContent = "Indisponible";
    });
} else $("offline-status").textContent = "Non pris en charge";
updateHUD();
draw();
requestAnimationFrame(frame);
