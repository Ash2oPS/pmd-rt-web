import { content, movementSettings } from '../content/catalog.ts';
import type { Dungeon, Move } from '../content/schemas.ts';
import { Encounter } from '../domain/combat/encounter.ts';
import type { CombatEvent, EncounterSnapshot } from '../domain/combat/types.ts';
import { drawCombatGround, drawCombatOverlay } from '../rendering/combat.ts';
import { addEquipmentSlots, addTrainingPartners, createCombatHUD } from '../ui/combat.ts';
import { element } from '../ui/dom.ts';
import type { Runtime } from './runtime.ts';
import type { Action } from '../platform/input/mapping.ts';
import { setupAttackPresentation } from './attack-presentation.ts';

/** App-owned training session: transient combat never writes exploration save fields. */
export function setupCombat(field: Dungeon, runtime: Runtime, ready: () => boolean,
  callbacks: { canAct(): boolean; clear(): void; toast(message: string): void; bindingLabel(slot: number): string;
    controlLabel?(action: 'aim' | 'wait'): string }) {
  let encounter: Encounter | null = null;
  let view: EncounterSnapshot | null = null;
  let events: CombatEvent[] = [];
  let presentationTime = 0;
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
    equipment.update(moves);
    callbacks.toast(`Capacité ${slot + 1} : ${moves[slot]?.label ?? 'vide'} · équipement de cette session`);
  }
  const partners = field.actors.filter(actor => content.species.find(species => species.id === actor.speciesId)!
    .learnset.some(entry => content.moves.some(move => move.id === entry.moveId && move.combat)))
    .map(actor => ({ id: actor.id, label: content.species.find(species => species.id === actor.speciesId)!.label }));
  let selectedPartner = partners[0]?.id;
  addTrainingPartners(partners);
  function snapshot() { return view; }
  function refresh() { view = encounter?.snapshot() ?? null; hud.update(view, moves, moves.map((_, slot) => callbacks.bindingLabel(slot)),
    [callbacks.controlLabel?.('aim') ?? 'L', callbacks.controlLabel?.('wait') ?? 'R']); }
  function start(partner = selectedPartner) {
    if (!ready() || !effects.isReady) { callbacks.toast(effects.error ?? 'Les animations et effets de combat se chargent encore.'); return false; }
    callbacks.clear();
    selectedPartner = partner;
    encounter = new Encounter({ field, species: content.species, moves: content.moves, movementSettings, state: runtime.state,
      hostileIds: partner ? [partner] : [] });
    events = [];
    presentationTime = 0;
    effects.reset();
    refresh();
    callbacks.toast('Entraînement : esquive les zones. J / K / L / I : capacités · Maj : viser · Espace : attendre.');
    return true;
  }
  function leave() {
    encounter?.cancelAll(); encounter = null; events = [];
    effects.reset();
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
    equippedMoves() { return [...moves]; },
    equipCommands() { return Object.fromEntries(moves.map((_, slot) => [`combat-equip-${slot}`, () => cycleSlot(slot)])); },
    get playerBusy() { return !!view?.casts.some(cast => cast.casterId === 'player'); },
    get facingLocked() { return !!view && (view.casts.some(cast => cast.casterId === 'player' && cast.phase !== 'tracking')
      || view.statuses.some(status => status.entityId === 'player' && status.kind === 'sleep')); },
    startDefault() { return start(partners[0]?.id); },
    partnerCommands(resume: () => void) {
      return Object.fromEntries(partners.slice(1).map(partner => [`combat-${partner.id}`, () => { if (start(partner.id)) resume(); }]));
    },
    presentation() { return { time: presentationTime, recentEvents: events.length, ...effects.snapshot() }; },
    suspendAudio() { effects.suspend(); },
    toggleSound() { const muted = effects.toggleSound(); element('attack-sound').textContent = `Son des capacités · ${muted ? 'désactivé' : 'activé'}`; },
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
    update(dt: number, resultUiDt = dt) {
      if (!encounter) return;
      presentationTime += encounter.result === 'playing' ? dt : resultUiDt;
      encounter.update(dt);
      const next = encounter.takeEvents();
      effects.consume(next);
      events = [...events, ...next].filter(event => presentationTime - event.time < effects.retention(event)).slice(-256);
      refresh();
    },
    ground(context: CanvasRenderingContext2D) { if (view) { drawCombatGround(context, view, field); effects.draw(context, view, events, presentationTime, 'ground'); } },
    overlay(context: CanvasRenderingContext2D) { if (view) { drawCombatOverlay(context, view, events, field, presentationTime); effects.draw(context, view, events, presentationTime, 'overlay'); } },
  };
}
