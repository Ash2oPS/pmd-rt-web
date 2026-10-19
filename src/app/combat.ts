import { content, movementSettings } from '../content/catalog.ts';
import type { Dungeon, Move } from '../content/schemas.ts';
import { Encounter } from '../domain/combat/encounter.ts';
import type { CombatEvent, EncounterSnapshot } from '../domain/combat/types.ts';
import { drawCombatGround, drawCombatOverlay } from '../rendering/combat.ts';
import { addEquipmentSlots, createCombatHUD } from '../ui/combat.ts';
import { element } from '../ui/dom.ts';
import type { Runtime } from './runtime.ts';
import type { Action } from '../platform/input/mapping.ts';
import { setupAttackPresentation } from './attack-presentation.ts';

/** One field encounter owns every NPC position for the whole exploration session. */
export function setupCombat(field: Dungeon, runtime: Runtime, ready: () => boolean,
  callbacks: { canAct(): boolean; clear(): void; toast(message: string): void; bindingLabel(slot: number): string;
    controlLabel?(action: 'aim' | 'wait'): string }) {
  const effects = setupAttackPresentation({ audio: true });
  element('attack-sound').textContent = `Son des capacités · ${effects.snapshot().muted ? 'désactivé' : 'activé'}`;
  const playerSpecies = content.species.find(species => species.id === field.playerSpeciesId)!;
  const knownMoves = playerSpecies.learnset.map(entry => content.moves.find(move => move.id === entry.moveId)!)
    .filter(move => move.combat);
  // Equipment is deliberately session-only: exploration save formats remain unchanged.
  const moves: (Move | null)[] = Array.from({ length: 4 }, (_, slot) => knownMoves[slot] ?? null);
  const equipment = addEquipmentSlots();
  equipment.update(moves);
  function cycleSlot(slot: number) {
    const choices = [...knownMoves.filter(move => !moves.some((equipped, index) => index !== slot && equipped?.id === move.id)), null];
    const current = choices.findIndex(move => move?.id === moves[slot]?.id);
    moves[slot] = choices[(current + 1) % choices.length] ?? null;
    equipment.update(moves); refresh();
    callbacks.toast(`Capacité ${slot + 1} : ${moves[slot]?.label ?? 'vide'} · équipement de cette session`);
  }
  let encounter: Encounter;
  let view: EncounterSnapshot;
  let events: CombatEvent[] = [];
  let presentationTime = 0;
  const hud = createCombatHUD(playerSpecies.label, attack, reset, Encounter.playerMaxHp);
  encounter = new Encounter({ field, species: content.species, moves: content.moves, movementSettings, state: runtime.state,
    continueAfterVictory: true, aiEnabled: false });
  view = encounter.snapshot();

  function snapshot() { return view; }
  function refresh() {
    if (!encounter) return;
    view = encounter.snapshot();
    hud.update(view, moves, moves.map((_, slot) => callbacks.bindingLabel(slot)),
      [callbacks.controlLabel?.('aim') ?? 'L', callbacks.controlLabel?.('wait') ?? 'R']);
  }
  function reset() {
    encounter.reset(runtime.state);
    events = [];
    presentationTime = 0;
    effects.reset();
    callbacks.clear();
    refresh();
  }
  function attack(slot: number) {
    if (!callbacks.canAct() || !ready()) return;
    const move = moves[slot];
    if (move && encounter.requestAttack(move.id)) refresh();
  }
  return {
    reset, attack, snapshot,
    equippedMoves() { return [...moves]; },
    equipCommands() { return Object.fromEntries(moves.map((_, slot) => [`combat-equip-${slot}`, () => cycleSlot(slot)])); },
    get playerBusy() { return view.casts.some(cast => cast.casterId === 'player'); },
    get facingLocked() { return view.casts.some(cast => cast.casterId === 'player' && cast.phase !== 'tracking')
      || view.statuses.some(status => status.entityId === 'player' && status.kind === 'sleep'); },
    presentation() { return { time: presentationTime, recentEvents: events.length, ...effects.snapshot() }; },
    suspendAudio() { effects.suspend(); },
    toggleSound() { const muted = effects.toggleSound(); element('attack-sound').textContent = `Son des capacités · ${muted ? 'désactivé' : 'activé'}`; },
    get finished() { return view.result === 'lost'; },
    resultAction(action: Action) {
      if (view.result !== 'lost') return false;
      if (action === 'confirm') hud.confirmResult();
      else if (action === 'up' || action === 'down') hud.navigateResult(action === 'up' ? -1 : 1);
      else return false;
      return true;
    },
    get movementMultiplier() { return encounter.playerMovementMultiplier; },
    update(dt: number, resultUiDt = dt) {
      presentationTime += view.result === 'playing' ? dt : resultUiDt;
      encounter.update(dt);
      const next = encounter.takeEvents();
      effects.consume(next);
      events = [...events, ...next].filter(event => presentationTime - event.time < effects.retention(event)).slice(-256);
      refresh();
    },
    ground(context: CanvasRenderingContext2D) { drawCombatGround(context, view, field); effects.draw(context, view, events, presentationTime, 'ground'); },
    overlay(context: CanvasRenderingContext2D) { drawCombatOverlay(context, view, events, field, presentationTime); effects.draw(context, view, events, presentationTime, 'overlay'); },
  };
}
