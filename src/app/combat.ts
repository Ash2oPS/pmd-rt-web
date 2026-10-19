import { content, movementSettings } from '../content/catalog.ts';
import type { Dungeon } from '../content/schemas.ts';
import { Encounter } from '../domain/combat/encounter.ts';
import type { CombatEvent, EncounterSnapshot } from '../domain/combat/types.ts';
import { drawCombatGround, drawCombatOverlay } from '../rendering/combat.ts';
import { createCombatHUD } from '../ui/combat.ts';
import { element } from '../ui/dom.ts';
import type { Runtime } from './runtime.ts';
import type { Action } from '../platform/input/mapping.ts';

/** App-owned training session: transient combat never writes exploration save fields. */
export function setupCombat(field: Dungeon, runtime: Runtime, ready: () => boolean,
  callbacks: { canAct(): boolean; clear(): void; toast(message: string): void; bindingLabel(slot: number): string }) {
  let encounter: Encounter | null = null;
  let view: EncounterSnapshot | null = null;
  let events: CombatEvent[] = [];
  let presentationTime = 0;
  const playerSpecies = content.species.find(species => species.id === field.playerSpeciesId)!;
  const moves = playerSpecies.learnset.map(entry => content.moves.find(move => move.id === entry.moveId)!)
    .filter(move => move.combat).slice(0, 2);
  function snapshot() { return view; }
  function refresh() { view = encounter?.snapshot() ?? null; hud.update(view, moves, [callbacks.bindingLabel(0), callbacks.bindingLabel(1)]); }
  function start() {
    if (!ready()) { callbacks.toast('Les animations de combat se chargent encore.'); return false; }
    callbacks.clear();
    encounter = new Encounter({ field, species: content.species, moves: content.moves, movementSettings, state: runtime.state });
    events = [];
    presentationTime = 0;
    refresh();
    callbacks.toast('Entraînement : esquive la zone annoncée. J / X pour attaquer.');
    return true;
  }
  function leave() {
    encounter?.cancelAll(); encounter = null; events = [];
    callbacks.clear(); refresh();
    element('scene-status').textContent = 'Exploration';
  }
  function attack(slot: number) {
    if (!callbacks.canAct() || !ready()) return;
    const move = moves[slot];
    if (move && encounter) { encounter.requestAttack(move.id); refresh(); }
  }
  const hud = createCombatHUD(playerSpecies.label, attack, start, leave);
  return {
    start, leave, attack, snapshot,
    presentation() { return { time: presentationTime, recentEvents: events.length }; },
    get finished() { return !!view && view.result !== 'playing'; },
    resultAction(action: Action) {
      if (!view || view.result === 'playing') return false;
      if (action === 'confirm') hud.confirmResult();
      else if (action === 'up' || action === 'down') hud.navigateResult(action === 'up' ? -1 : 1);
      else if (action === 'back') leave();
      else return false;
      return true;
    },
    get movementMultiplier() { return encounter?.playerMovementMultiplier ?? 1; },
    update(dt: number) {
      if (!encounter) return;
      presentationTime += dt;
      encounter.update(dt);
      const next = encounter.takeEvents();
      events = [...events, ...next].filter(event => presentationTime - event.time < .8).slice(-80);
      refresh();
    },
    ground(context: CanvasRenderingContext2D) { if (view) drawCombatGround(context, view, field); },
    overlay(context: CanvasRenderingContext2D) { if (view) drawCombatOverlay(context, view, events, field, presentationTime); },
  };
}
