import type { Move } from '../../content/schemas.ts';
import { canOccupy, facingFromVector, movePoint } from '../movement.ts';
import type { Point } from '../movement.ts';
import { updateRoamers } from '../roaming.ts';
import { relativeMovementSpeed } from '../speed.ts';
import type { GameState } from '../state.ts';
import { clearAttackPath, facingAngle, touchesGeometry } from './geometry.ts';
import { effectFor, engagementRange, patternFor, resolveGeometry } from './patterns.ts';
import { moveDamage } from './damage.ts';
import { createEncounterActors, syncActorAnimations } from './actors.ts';
import { Zones } from './zones.ts';
import { Statuses } from './statuses.ts';
import { advanceProjectile } from './projectiles.ts';
import type { Projectile } from './projectiles.ts';
import type { CastSnapshot, CombatActor, CombatEntity, CombatEvent, EncounterOptions, EncounterSnapshot } from './types.ts';

interface Cast extends CastSnapshot { move: Move; hits: Set<string>; locked: boolean; activated: boolean }
const EPSILON = 1e-9;

/** Pure encounter simulation shared by the live field and authoring previews. */
export class Encounter {
  static readonly playerMaxHp = 80;
  actors: CombatActor[] = [];
  time = 0;
  private state: GameState;
  private hp = Encounter.playerMaxHp;
  private grace = 1;
  private casts: Cast[] = [];
  private projectiles: Projectile[] = [];
  private readonly statuses = new Statuses();
  private events: CombatEvent[] = [];
  private sequence = 0;
  private castSequence = 0;
  private lastFailure: string | null = null;
  private readonly zones: Zones;
  private cooldowns = new Map<string, number>();
  private hurtUntil = new Map<string, number>();
  constructor(private readonly options: EncounterOptions) {
    this.state = options.state;
    this.zones = new Zones(options.field);
    this.reset(options.state);
  }
  get result(): 'playing' | 'won' | 'lost' {
    if (this.hp <= 0) return 'lost';
    if (this.options.continueAfterVictory) return 'playing';
    const hostile = this.actors.filter(actor => actor.team === 'hostile');
    return hostile.length && hostile.every(actor => actor.defeated) ? 'won' : 'playing';
  }
  get player(): CombatEntity {
    const cast = this.casts.find(entry => entry.casterId === 'player');
    return { id: 'player', speciesId: this.options.field.playerSpeciesId, team: 'player',
      x: this.state.player.x, y: this.state.player.y, facing: this.state.facing,
      hp: this.hp, maxHp: Encounter.playerMaxHp, defeated: this.hp <= 0,
      animation: this.hp <= 0 ? 'Idle' : (this.hurtUntil.get('player') ?? 0) > this.time ? 'Hurt'
        : cast && cast.phase !== 'recovery' ? 'Attack' : 'Idle' };
  }
  get playerMovementMultiplier(): number {
    if (this.result !== 'playing' || this.statuses.isSleeping('player')) return 0;
    const cast = this.casts.find(entry => entry.casterId === 'player');
    if (!cast || cast.phase === 'recovery') return 1;
    return cast.phase === 'tracking' ? cast.move.combat!.movementDuringPreparation : 0;
  }
  reset(state: GameState, graceSeconds = 1): void {
    this.state = state;
    this.time = 0;
    this.hp = Encounter.playerMaxHp;
    this.grace = Math.max(0, graceSeconds);
    this.casts = []; this.projectiles = []; this.zones.clear(); this.statuses.clear(); this.events = []; this.sequence = 0;
    this.castSequence = 0; this.lastFailure = null;
    this.cooldowns.clear(); this.hurtUntil.clear();
    this.actors = createEncounterActors(this.options);
  }
  cancelAll(): void {
    for (const cast of this.casts) this.emit('cast-cancel', cast.casterId, cast.moveId);
    this.casts = []; this.projectiles = []; this.zones.clear();
    for (const actor of this.actors) actor.roaming.velocity = { x: 0, y: 0 };
  }
  requestAttack(moveId: string): boolean { return this.beginCast(this.player, moveId); }
  takeEvents(): CombatEvent[] { const events = this.events; this.events = []; return events; }
  snapshot(): EncounterSnapshot {
    return { time: this.time, result: this.result, player: { ...this.player },
      actors: this.actors.map(({ roaming, ...actor }) => ({ ...actor, velocity: { ...roaming.velocity } })),
      casts: this.casts.map(({ move: _move, hits: _hits, locked: _locked, activated: _activated, ...cast }) => structuredClone(cast)),
      projectiles: this.projectiles.map(({ team: _team, angleRadians: _angle, speed: _speed, ...projectile }) => structuredClone(projectile)),
      zones: this.zones.snapshot(), lastFailure: this.lastFailure,
      statuses: this.statuses.snapshot(), graceSeconds: this.grace,
      cooldowns: Object.fromEntries([...this.cooldowns].map(([key, until]) => [key, Math.max(0, until - this.time)])) };
  }
  update(dtSeconds: number): void {
    if (!Number.isFinite(dtSeconds) || dtSeconds <= 0 || this.result !== 'playing') return;
    const steps = Math.ceil(dtSeconds / .01), dt = dtSeconds / steps;
    for (let step = 0; step < steps && this.result === 'playing'; step++) {
      this.time += dt;
      this.grace = Math.max(0, this.grace - dt);
      for (const id of this.statuses.update(dt)) this.emit('sleep-end', id);
      this.updateActors(dt);
      for (const cast of [...this.casts]) this.updateCast(cast, dt);
      this.updateProjectiles(dt);
      this.zones.update(this.time - dt, this.time, {
        entity: id => this.entity(id),
        targets: team => this.targetsFor(team).filter(target => !(target.id === 'player' && this.grace > EPSILON)),
        hit: (caster, target, moveId) => {
          const move = this.options.moves.find(move => move.id === moveId);
          if (move) this.applyEffect(caster, target, move);
        },
        event: (type, zone) => this.emit(type, zone.casterId, zone.moveId, undefined, undefined, zone.geometry.origin),
      });
      syncActorAnimations(this.actors, this.casts, this.hurtUntil, id => this.statuses.isSleeping(id), this.time);
      if (this.result !== 'playing') this.cancelAll();
    }
  }
  private species(id: string) {
    const species = this.options.species.find(entry => entry.id === id);
    if (!species) throw new Error(`Unknown combat species: ${id}`);
    return species;
  }
  private entity(id: string): CombatEntity | undefined { return id === 'player' ? this.player : this.actors.find(actor => actor.id === id); }
  private emit(type: CombatEvent['type'], casterId: string, moveId?: string, targetId?: string, amount?: number, position?: Point, reason?: string): void {
    const origin = this.entity(targetId ?? casterId) ?? this.player;
    this.events.push({ id: ++this.sequence, time: this.time, type, casterId, moveId, targetId,
      position: position ? { ...position } : { x: origin.x, y: origin.y }, amount, reason });
    if (this.events.length > 256) this.events.shift();
  }
  private beginCast(caster: CombatEntity, moveId: string): boolean {
    const move = this.options.moves.find(entry => entry.id === moveId);
    if (this.result !== 'playing' || this.statuses.isSleeping(caster.id) || !move?.combat || caster.defeated || caster.team === 'neutral'
      || !this.species(caster.speciesId).learnset.some(entry => entry.moveId === moveId)
      || this.casts.some(cast => cast.casterId === caster.id)
      || (this.cooldowns.get(`${caster.id}:${moveId}`) ?? 0) > this.time + EPSILON
      || (caster.team === 'hostile' && this.grace > EPSILON)) return false;
    const aim = this.aimFor(caster, move.combat);
    const cast: Cast = { id: ++this.sequence, casterId: caster.id, moveId, move,
      phase: move.combat.trackingSeconds ? 'tracking' : 'locked', elapsedSeconds: 0,
      aim, geometry: resolveGeometry(move.combat, caster, aim, this.options.field),
      hits: new Set(), locked: !move.combat.trackingSeconds, activated: false };
    const pattern = patternFor(move.combat);
    if (pattern.kind === 'zones') {
      try {
        cast.zoneIds = this.zones.plan({ pattern, caster, aim, castId: cast.id, moveId,
          time: this.time, preparationSeconds: move.combat.preparationSeconds,
          seed: ((this.options.seed ?? 1) ^ Math.imul(this.castSequence + 1, 2654435761)) >>> 0,
          nextId: () => ++this.sequence });
        cast.geometry = this.zones.firstGeometry(cast.id)!;
      } catch (error) {
        this.lastFailure = error instanceof Error ? error.message : String(error);
        this.emit('cast-rejected', caster.id, moveId, undefined, undefined, undefined, this.lastFailure);
        return false;
      }
    }
    this.castSequence++; this.lastFailure = null;
    this.casts.push(cast);
    this.cooldowns.set(`${caster.id}:${moveId}`, this.time + move.combat.cooldownSeconds);
    this.emit('cast-start', caster.id, moveId);
    if (cast.locked) this.emit('aim-lock', caster.id, moveId);
    return true;
  }
  private updateActors(dt: number): void {
    const neutrals = this.actors.filter(actor => actor.team === 'neutral' && !actor.defeated && !this.statuses.isSleeping(actor.id));
    updateRoamers(neutrals.map(actor => actor.roaming), this.options.field, dt);
    for (const actor of this.actors) {
      if (actor.team !== 'hostile' || actor.defeated) continue;
      if (this.options.aiEnabled === false) { actor.behavior = 'idle'; actor.roaming.velocity = { x: 0, y: 0 }; continue; }
      if (this.statuses.isSleeping(actor.id)) { actor.behavior = 'sleeping'; actor.roaming.velocity = { x: 0, y: 0 }; continue; }
      actor.roaming.velocity = { x: 0, y: 0 };
      const cast = this.casts.find(entry => entry.casterId === actor.id);
      if (cast) { actor.behavior = cast.phase === 'recovery' ? 'recovering' : cast.phase === 'active' ? 'active' : 'preparing'; continue; }
      const dx = this.player.x - actor.x, dy = this.player.y - actor.y, distance = Math.hypot(dx, dy);
      const learned = this.options.moves.filter(move => move.combat && this.species(actor.speciesId).learnset.some(entry => entry.moveId === move.id));
      if (!learned.length) { actor.behavior = 'idle'; continue; }
      if (distance > EPSILON) actor.facing = facingFromVector({ x: dx, y: dy });
      const move = this.grace <= EPSILON && clearAttackPath(this.options.field, actor, this.player)
        ? learned.find(candidate => distance <= engagementRange(candidate.combat!) * .85
          && (this.cooldowns.get(`${actor.id}:${candidate.id}`) ?? 0) <= this.time + EPSILON) : undefined;
      if (move) {
        actor.behavior = 'idle';
        this.beginCast(actor, move.id);
        continue;
      }
      if (distance <= Math.min(...learned.map(candidate => engagementRange(candidate.combat!) * .85))) {
        actor.behavior = 'idle'; continue;
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
      const aim = this.aimFor(caster, rule);
      const pattern = patternFor(rule);
      const validAim = pattern.kind !== 'target-disk' || (Math.hypot(aim.x - caster.x, aim.y - caster.y) <= pattern.targetingRange
        && canOccupy(this.options.field, aim, 0) && clearAttackPath(this.options.field, caster, aim));
      if (validAim) {
        cast.aim = { x: aim.x, y: aim.y };
        if (caster.team === 'hostile') caster.facing = facingFromVector({ x: aim.x - caster.x, y: aim.y - caster.y });
        if (pattern.kind === 'zones') {
          this.zones.retarget(cast.id, caster, aim);
          cast.geometry = this.zones.firstGeometry(cast.id) ?? cast.geometry;
        } else cast.geometry = resolveGeometry(rule, caster, aim, this.options.field);
      }
      if (cast.elapsedSeconds + EPSILON >= rule.trackingSeconds) {
        cast.locked = true; cast.phase = 'locked'; this.emit('aim-lock', caster.id, cast.moveId);
      }
    }
    if (cast.elapsedSeconds + EPSILON < rule.preparationSeconds) return;
    if (!cast.activated) {
      cast.activated = true; this.emit('activation', caster.id, cast.moveId);
      const pattern = patternFor(rule);
      if (pattern.kind === 'projectile' && cast.geometry.kind === 'line') {
        this.projectiles.push({ id: ++this.sequence, castId: cast.id, casterId: caster.id, moveId: cast.moveId,
          team: caster.team, position: { ...cast.geometry.origin }, previousPosition: { ...cast.geometry.origin },
          radius: pattern.radius, remainingRange: pattern.range, angleRadians: cast.geometry.angleRadians, speed: pattern.speed, spawnTime: this.time });
        this.emit('projectile-launch', caster.id, cast.moveId);
      }
    }
    if (previousElapsed < rule.preparationSeconds + rule.activeSeconds - EPSILON) {
      cast.phase = cast.elapsedSeconds < rule.preparationSeconds + rule.activeSeconds - EPSILON ? 'active' : 'recovery';
      const kind = patternFor(rule).kind;
      const targets = kind === 'projectile' || kind === 'zones' ? [] : this.targetsFor(caster.team);
      for (const target of targets) {
        if (target.defeated || cast.hits.has(target.id) || (target.id === 'player' && this.grace > EPSILON)
          || !touchesGeometry(cast.geometry, target) || !clearAttackPath(this.options.field, cast.geometry.origin, target)) continue;
        cast.hits.add(target.id);
        this.applyEffect(caster, target, cast.move);
      }
    } else cast.phase = 'recovery';
    if (cast.elapsedSeconds + EPSILON >= rule.preparationSeconds + rule.activeSeconds + rule.recoverySeconds) this.removeCast(cast, false);
  }
  private aimFor(caster: CombatEntity, rule: NonNullable<Move['combat']>): Point {
    if (caster.team === 'hostile') return { x: this.player.x, y: this.player.y };
    const pattern = patternFor(rule);
    if (pattern.kind === 'target-disk' || (pattern.kind === 'zones' && pattern.placement.kind === 'target')) {
      const targetingRange = pattern.kind === 'target-disk' ? pattern.targetingRange : engagementRange(rule);
      const target = this.actors.filter(actor => actor.team === 'hostile' && !actor.defeated
        && Math.hypot(actor.x - caster.x, actor.y - caster.y) <= targetingRange)
        .sort((a, b) => Math.hypot(a.x - caster.x, a.y - caster.y) - Math.hypot(b.x - caster.x, b.y - caster.y))[0];
      if (target) return { x: target.x, y: target.y };
    }
    const angle = facingAngle(caster.facing), range = engagementRange(rule);
    return { x: caster.x + Math.cos(angle) * range, y: caster.y + Math.sin(angle) * range };
  }
  private targetsFor(team: CombatEntity['team']): CombatEntity[] {
    return team === 'player' ? this.actors.filter(actor => actor.team === 'hostile') : [this.player];
  }
  private applyEffect(caster: CombatEntity, target: CombatEntity, move: Move): void {
    const rule = move.combat!, effect = effectFor(rule);
    if (effect.kind === 'sleep') {
      this.statuses.applySleep(target.id, effect.durationSeconds, effect.wakeOnHit);
      for (const cast of [...this.casts]) if (cast.casterId === target.id) this.removeCast(cast, true);
      this.emit('sleep-start', caster.id, move.id, target.id);
      return;
    }
    const damage = 'damage' in rule ? rule.damage : moveDamage(move, this.species(caster.speciesId), this.species(target.speciesId));
    if (target.id === 'player') this.hp = Math.max(0, this.hp - damage);
    else target.hp = Math.max(0, target.hp - damage);
    if (this.statuses.wakeOnDamage(target.id)) this.emit('sleep-end', target.id);
    this.hurtUntil.set(target.id, this.time + .2);
    this.emit('hit', caster.id, move.id, target.id, damage);
    if ((target.id === 'player' ? this.hp : target.hp) <= 0) {
      target.defeated = true; this.emit('defeat', caster.id, move.id, target.id);
      for (const pending of [...this.casts]) if (pending.casterId === target.id) this.removeCast(pending, true);
      this.projectiles = this.projectiles.filter(projectile => projectile.casterId !== target.id);
      this.zones.cancelCaster(target.id);
    }
  }
  private updateProjectiles(dt: number): void {
    for (const projectile of [...this.projectiles]) {
      if (!this.projectiles.includes(projectile)) continue;
      const candidates = this.targetsFor(projectile.team).filter(target => !(target.id === 'player' && this.grace > EPSILON));
      const contact = advanceProjectile(projectile, this.options.field, candidates, dt);
      if (contact.target) {
        const caster = this.entity(projectile.casterId), move = this.options.moves.find(move => move.id === projectile.moveId);
        if (caster && move) this.applyEffect(caster, contact.target, move);
      }
      if (contact.done) {
        this.emit('projectile-impact', projectile.casterId, projectile.moveId, contact.target?.id, undefined, projectile.position);
        this.projectiles = this.projectiles.filter(entry => entry !== projectile);
      }
    }
  }
  private removeCast(cast: Cast, cancelled: boolean): void {
    this.casts = this.casts.filter(entry => entry !== cast);
    if (cancelled) { this.zones.cancelCast(cast.id); this.emit('cast-cancel', cast.casterId, cast.moveId); }
  }
}
