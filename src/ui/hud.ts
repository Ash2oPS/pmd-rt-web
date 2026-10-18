import { element } from "./dom.ts";
import type { GameState } from "../domain/state.ts";
export function updateHUD(state: GameState, total: number, storageOK: boolean) {
  element("crystals").innerHTML =
    `${state.collected.length} <span>/ ${total}</span>`;
  element("steps").textContent = `${state.steps} pas`;
  element("coordinates").textContent =
    `${String(state.player.x).padStart(2, "0")} / ${String(state.player.y).padStart(2, "0")}`;
  element("objective-label").textContent =
    state.collected.length === total
      ? "EXPÉDITION RÉUSSIE"
      : "ÉCLATS RETROUVÉS";
  if (!storageOK) element("save-status").textContent = "Indisponible";
}
