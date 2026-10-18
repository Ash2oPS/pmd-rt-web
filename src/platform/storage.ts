import type { GameState, World } from "../domain/state.ts";
import { createState, restore } from "../domain/state.ts";
import { defaultMapping, validateMapping } from "./input/mapping.ts";
import type { Mapping } from "./input/mapping.ts";
const SAVE = "pmd-field-save-v1",
  BINDINGS = "pmd-field-bindings-v1";
export function createStorage(
  world: World,
  storage?: Pick<Storage, "getItem" | "setItem">,
) {
  let available = true,
    invalidSave = false,
    state = createState(world),
    mapping = defaultMapping();
  try {
    storage ??= localStorage;
    const raw = storage.getItem(SAVE);
    if (raw) {
      const parsed = restore(raw, world);
      if (parsed) state = parsed;
      else invalidSave = true;
    }
    const saved: unknown = JSON.parse(storage.getItem(BINDINGS) || "null");
    if (validateMapping(saved)) mapping = saved;
  } catch {
    available = false;
  }
  return {
    state,
    mapping,
    invalidSave,
    get available() {
      return available;
    },
    save(state: GameState) {
      try {
        if (!storage) return false;
        storage.setItem(SAVE, JSON.stringify(state));
        available = true;
        return true;
      } catch {
        available = false;
        return false;
      }
    },
    saveMapping(mapping: Mapping) {
      try {
        if (!storage) return false;
        storage.setItem(BINDINGS, JSON.stringify(mapping));
        return true;
      } catch {
        return false;
      }
    },
  };
}
export type GameStorage = ReturnType<typeof createStorage>;
