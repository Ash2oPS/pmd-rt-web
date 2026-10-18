import { element } from "./dom.ts";
import type { GameState } from "../domain/state.ts";
export function updateHUD(state: GameState, total: number, storageOK: boolean) {
  element("crystals").innerHTML =
    `${state.collected.length} <span>/ ${total}</span>`;
  element("steps").textContent = `${state.steps} pas`;
  element("coordinates").textContent =
    `${state.player.x.toFixed(1)} / ${state.player.y.toFixed(1)}`;
  element("objective-label").textContent =
    state.collected.length === total
      ? "EXPÉDITION RÉUSSIE"
      : "ÉCLATS RETROUVÉS";
  if (!storageOK) element("save-status").textContent = "Indisponible";
}
