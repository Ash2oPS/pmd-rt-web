import type { Move } from '../../content/schemas.ts';
import { facingFromVector, movePoint } from '../movement.ts';
import type { Point } from '../movement.ts';
import { createRoamers, updateRoamers } from '../roaming.ts';
import { relativeMovementSpeed } from '../speed.ts';
import type { GameState } from '../state.ts';
import { clearAttackPath, facingAngle, sector, touchesSector } from './geometry.ts';
import type { CastSnapshot, CombatActor, CombatEntity, CombatEvent, EncounterOptions, EncounterSnapshot } from './types.ts';

interface Cast extends CastSnapshot { move: Move; hits: Set<string>; locked: boolean; activated: boolean }
const EPSILON = 1e-9;

/** Pure encounter simulation shared by the live field and authoring previews. */
export class Encounter {
  actors: CombatActor[] = [];
  time = 0;
  private state: GameState;
  private hp = 80;
  private grace = 1;
  private casts: Cast[] = [];
  private events: CombatEvent[] = [];
  private sequence = 0;
  private cooldowns = new Map<string, number>();
  private hurtUntil = new Map<string, number>();
  private readonly hostileIds: Set<string>;
  constructor(private readonly options: EncounterOptions) {
    this.state = options.state;
    this.hostileIds = new Set(options.hostileIds ?? ['bulbasaur-visitor']);
    this.reset(options.state);
  }
  get result(): 'playing' | 'won' | 'lost' {
    if (this.hp <= 0) return 'lost';
    const hostile = this.actors.filter(actor => actor.team === 'hostile');
    return hostile.length && hostile.every(actor => actor.defeated) ? 'won' : 'playing';
  }
  get player(): CombatEntity {
    const cast = this.casts.find(entry => entry.casterId === 'player');
    return { id: 'player', speciesId: this.options.field.playerSpeciesId, team: 'player',
      x: this.state.player.x, y: this.state.player.y, facing: this.state.facing,
      hp: this.hp, maxHp: 80, defeated: this.hp <= 0,
      animation: this.hp <= 0 ? 'Idle' : (this.hurtUntil.get('player') ?? 0) > this.time ? 'Hurt'
        : cast && cast.phase !== 'recovery' ? 'Attack' : 'Idle' };
  }
  get playerMovementMultiplier(): number {
    if (this.result !== 'playing') return 0;
    const cast = this.casts.find(entry => entry.casterId === 'player');
    if (!cast || cast.phase === 'recovery') return 1;
    return cast.phase === 'tracking' ? cast.move.combat!.movementDuringPreparation : 0;
  }
  reset(state: GameState, graceSeconds = 1): void {
    this.state = state;
    this.time = 0;
    this.hp = 80;
    this.grace = Math.max(0, graceSeconds);
    this.casts = []; this.events = []; this.sequence = 0;
    this.cooldowns.clear(); this.hurtUntil.clear();
    const playerStat = this.species(this.options.field.playerSpeciesId).stats.speed;
    this.actors = createRoamers(this.options.field.actors, definition => relativeMovementSpeed(
      this.species(definition.speciesId).stats.speed, playerStat, this.options.movementSettings,
      definition.roaming?.behaviorMultiplier ?? 0,
    )).map(roaming => {
      const maxHp = this.species(roaming.speciesId).stats.hp;
      return { id: roaming.id, speciesId: roaming.speciesId, roaming,
        team: this.hostileIds.has(roaming.id) ? 'hostile' as const : 'neutral' as const,
        get x() { return roaming.x; }, set x(value: number) { roaming.x = value; },
        get y() { return roaming.y; }, set y(value: number) { roaming.y = value; },
        get facing() { return roaming.facing; }, set facing(value) { roaming.facing = value; },
        hp: maxHp, maxHp, defeated: false, animation: roaming.animation,
        behavior: 'idle' as const, resolvedSpeed: roaming.resolvedSpeed };
    });
  }
  cancelAll(): void {
    for (const cast of this.casts) this.emit('cast-cancel', cast.casterId, cast.moveId);
    this.casts = [];
    for (const actor of this.actors) actor.roaming.velocity = { x: 0, y: 0 };
  }
  requestAttack(moveId: string): boolean { return this.beginCast(this.player, moveId); }
  takeEvents(): CombatEvent[] { const events = this.events; this.events = []; return events; }
  snapshot(): EncounterSnapshot {
    return { time: this.time, result: this.result, player: { ...this.player },
      actors: this.actors.map(({ roaming: _roaming, ...actor }) => ({ ...actor })),
      casts: this.casts.map(({ move: _move, hits: _hits, locked: _locked, activated: _activated, ...cast }) => structuredClone(cast)),
      graceSeconds: this.grace,
      cooldowns: Object.fromEntries([...this.cooldowns].map(([key, until]) => [key, Math.max(0, until - this.time)])) };
  }
  update(dtSeconds: number): void {
    if (!Number.isFinite(dtSeconds) || dtSeconds <= 0 || this.result !== 'playing') return;
    const steps = Math.ceil(dtSeconds / .01), dt = dtSeconds / steps;
    for (let step = 0; step < steps && this.result === 'playing'; step++) {
      this.time += dt;
      this.grace = Math.max(0, this.grace - dt);
      this.updateActors(dt);
      for (const cast of [...this.casts]) this.updateCast(cast, dt);
      this.syncAnimations();
      if (this.result !== 'playing') this.cancelAll();
    }
  }
  private species(id: string) {
    const species = this.options.species.find(entry => entry.id === id);
    if (!species) throw new Error(`Unknown combat species: ${id}`);
    return species;
  }
  private entity(id: string): CombatEntity | undefined { return id === 'player' ? this.player : this.actors.find(actor => actor.id === id); }
  private emit(type: CombatEvent['type'], casterId: string, moveId?: string, targetId?: string, amount?: number): void {
    const origin = this.entity(targetId ?? casterId) ?? this.player;
    this.events.push({ id: ++this.sequence, time: this.time, type, casterId, moveId, targetId,
      position: { x: origin.x, y: origin.y }, amount });
    if (this.events.length > 256) this.events.shift();
  }
  private beginCast(caster: CombatEntity, moveId: string): boolean {
    const move = this.options.moves.find(entry => entry.id === moveId);
    if (this.result !== 'playing' || !move?.combat || caster.defeated || caster.team === 'neutral'
      || !this.species(caster.speciesId).learnset.some(entry => entry.moveId === moveId)
      || this.casts.some(cast => cast.casterId === caster.id)
      || (this.cooldowns.get(`${caster.id}:${moveId}`) ?? 0) > this.time + EPSILON
      || (caster.team === 'hostile' && this.grace > EPSILON)) return false;
    const angle = facingAngle(caster.facing);
    const cast: Cast = { id: ++this.sequence, casterId: caster.id, moveId, move,
      phase: move.combat.trackingSeconds ? 'tracking' : 'locked', elapsedSeconds: 0,
      aim: { x: caster.x + Math.cos(angle), y: caster.y + Math.sin(angle) },
      geometry: sector(caster, angle, move.combat.range, move.combat.angleDegrees),
      hits: new Set(), locked: !move.combat.trackingSeconds, activated: false };
    this.casts.push(cast);
    this.cooldowns.set(`${caster.id}:${moveId}`, this.time + move.combat.cooldownSeconds);
    this.emit('cast-start', caster.id, moveId);
    if (cast.locked) this.emit('aim-lock', caster.id, moveId);
    return true;
  }
  private updateActors(dt: number): void {
    const neutrals = this.actors.filter(actor => actor.team === 'neutral' && !actor.defeated);
    updateRoamers(neutrals.map(actor => actor.roaming), this.options.field, dt);
    for (const actor of this.actors) {
      if (actor.team !== 'hostile' || actor.defeated) continue;
      actor.roaming.velocity = { x: 0, y: 0 };
      const cast = this.casts.find(entry => entry.casterId === actor.id);
      if (cast) { actor.behavior = cast.phase === 'recovery' ? 'recovering' : cast.phase === 'active' ? 'active' : 'preparing'; continue; }
      const dx = this.player.x - actor.x, dy = this.player.y - actor.y, distance = Math.hypot(dx, dy);
      const move = this.options.moves.find(move => move.combat && this.species(actor.speciesId).learnset.some(entry => entry.moveId === move.id));
      if (!move?.combat) { actor.behavior = 'idle'; continue; }
      if (distance > EPSILON) actor.facing = facingFromVector({ x: dx, y: dy });
      if (distance <= move.combat.range * .85 && clearAttackPath(this.options.field, actor, this.player)) {
        actor.behavior = 'idle';
        this.beginCast(actor, move.id);
        continue;
      }
      const speed = relativeMovementSpeed(this.species(actor.speciesId).stats.speed,
        this.species(this.player.speciesId).stats.speed, this.options.movementSettings, this.options.movementSettings.pursuitMultiplier);
      actor.resolvedSpeed = speed;
      if (distance <= EPSILON) continue;
      const length = Math.min(speed * dt, Math.max(0, distance - .5));
      const point = movePoint(this.options.field, actor, { x: dx / distance * length, y: dy / distance * length });
      actor.roaming.velocity = { x: (point.x - actor.x) / dt, y: (point.y - actor.y) / dt };
      actor.x = point.x; actor.y = point.y; actor.behavior = 'approach';
    }
  }
  private updateCast(cast: Cast, dt: number): void {
    if (!this.casts.includes(cast)) return;
    const caster = this.entity(cast.casterId), rule = cast.move.combat!;
    if (!caster || caster.defeated) { this.removeCast(cast, true); return; }
    const previousElapsed = cast.elapsedSeconds;
    cast.elapsedSeconds += dt;
    if (!cast.locked) {
      const aim: Point = caster.team === 'hostile' ? this.player : {
        x: caster.x + Math.cos(facingAngle(caster.facing)), y: caster.y + Math.sin(facingAngle(caster.facing)),
      };
      cast.aim = { x: aim.x, y: aim.y };
      if (caster.team === 'hostile') caster.facing = facingFromVector({ x: aim.x - caster.x, y: aim.y - caster.y });
      cast.geometry = sector(caster, Math.atan2(aim.y - caster.y, aim.x - caster.x), rule.range, rule.angleDegrees);
      if (cast.elapsedSeconds + EPSILON >= rule.trackingSeconds) {
        cast.locked = true; cast.phase = 'locked'; this.emit('aim-lock', caster.id, cast.moveId);
      }
    }
    if (cast.elapsedSeconds + EPSILON < rule.preparationSeconds) return;
    if (!cast.activated) { cast.activated = true; this.emit('activation', caster.id, cast.moveId); }
    if (previousElapsed < rule.preparationSeconds + rule.activeSeconds - EPSILON) {
      cast.phase = cast.elapsedSeconds < rule.preparationSeconds + rule.activeSeconds - EPSILON ? 'active' : 'recovery';
      const targets = caster.team === 'player' ? this.actors.filter(actor => actor.team === 'hostile') : [this.player];
      for (const target of targets) {
        if (target.defeated || cast.hits.has(target.id) || (target.id === 'player' && this.grace > EPSILON)
          || !touchesSector(cast.geometry, target) || !clearAttackPath(this.options.field, cast.geometry.origin, target)) continue;
        cast.hits.add(target.id);
        if (target.id === 'player') this.hp = Math.max(0, this.hp - rule.damage);
        else target.hp = Math.max(0, target.hp - rule.damage);
        this.hurtUntil.set(target.id, this.time + .2);
        this.emit('hit', caster.id, cast.moveId, target.id, rule.damage);
        if ((target.id === 'player' ? this.hp : target.hp) <= 0) {
          target.defeated = true;
          this.emit('defeat', caster.id, cast.moveId, target.id);
          for (const pending of [...this.casts]) if (pending.casterId === target.id) this.removeCast(pending, true);
        }
      }
    } else cast.phase = 'recovery';
    if (cast.elapsedSeconds + EPSILON >= rule.preparationSeconds + rule.activeSeconds + rule.recoverySeconds) this.removeCast(cast, false);
  }
  private removeCast(cast: Cast, cancelled: boolean): void {
    this.casts = this.casts.filter(entry => entry !== cast);
    if (cancelled) this.emit('cast-cancel', cast.casterId, cast.moveId);
  }
  private syncAnimations(): void {
    for (const actor of this.actors) {
      const cast = this.casts.find(entry => entry.casterId === actor.id);
      if (actor.defeated) { actor.behavior = 'defeated'; actor.animation = 'Idle'; actor.roaming.velocity = { x: 0, y: 0 }; continue; }
      if (cast) actor.behavior = cast.phase === 'recovery' ? 'recovering' : cast.phase === 'active' ? 'active' : 'preparing';
      if (actor.team === 'neutral') actor.behavior = actor.roaming.behavior === 'Roaming' ? 'roaming' : 'idle';
      actor.animation = (this.hurtUntil.get(actor.id) ?? 0) > this.time ? 'Hurt'
        : cast && cast.phase !== 'recovery' ? 'Attack' : Math.hypot(actor.roaming.velocity.x, actor.roaming.velocity.y) > .001 ? 'Walk' : 'Idle';
    }
  }
}
