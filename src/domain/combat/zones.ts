import type { ZonePattern } from '../../content/zone-schema.ts';
import { canOccupy } from '../movement.ts';
import type { CollisionWorld, Point } from '../movement.ts';
import { clearAttackPath, touchesGeometry } from './geometry.ts';
import { HitLedger } from './hit-policy.ts';
import { resolveOffsets, rotatePoint, shapeGeometry, shapeRadius, zoneAnchor } from './zone-placement.ts';
import type { CombatEntity, ZoneSnapshot } from './types.ts';

interface ZoneGroup {
  castId: number; casterId: string; moveId: string; team: CombatEntity['team']; pattern: ZonePattern;
  anchor: Point; angle: number; ledger: HitLedger;
}
interface ZoneState extends ZoneSnapshot { group: ZoneGroup; offset: Point; anchor: Point; started: boolean }
interface PlanOptions {
  pattern: ZonePattern; caster: CombatEntity; aim: Point; castId: number; moveId: string;
  time: number; preparationSeconds: number; seed: number; nextId(): number;
}
interface ZoneCallbacks {
  entity(id: string): CombatEntity | undefined;
  targets(team: CombatEntity['team']): CombatEntity[];
  hit(caster: CombatEntity, target: CombatEntity, moveId: string): void;
  event(type: 'zone-activation' | 'zone-expiration', zone: ZoneSnapshot): void;
}
/** Scheduled, resolved zones outlive a caster's recovery without owning a second clock. */
export class Zones {
  private zones: ZoneState[] = [];
  constructor(private readonly world: CollisionWorld) {}
  plan(options: PlanOptions): number[] {
    const { pattern, caster, aim } = options;
    const anchor = zoneAnchor(pattern, caster, aim), angle = Math.atan2(aim.y - caster.y, aim.x - caster.x);
    if (!clearAttackPath(this.world, caster, anchor)) throw new Error('Zone anchor is hidden by terrain');
    const offsets = resolveOffsets(pattern, anchor, angle, this.world, options.seed);
    const count = offsets.reduce((total, wave) => total + wave.length, 0);
    if (this.zones.length + count > 256) throw new Error('The encounter already has too many zones');
    const group: ZoneGroup = { castId: options.castId, casterId: caster.id, moveId: options.moveId,
      team: caster.team, pattern, anchor, angle, ledger: new HitLedger() };
    const planned: ZoneState[] = [];
    for (const [wave, points] of offsets.entries()) for (const offset of points) {
      const activationTime = options.time + options.preparationSeconds + wave * pattern.waves.intervalSeconds;
      const point = rotatePoint(offset, angle);
      const zone: ZoneState = { id: options.nextId(), castId: options.castId, casterId: caster.id, moveId: options.moveId,
        phase: 'pending', activationTime, expirationTime: activationTime + pattern.waves.activeSeconds,
        geometry: shapeGeometry(pattern.shape, { x: anchor.x + point.x, y: anchor.y + point.y }, angle),
        offset, group, anchor: { ...anchor }, started: false };
      this.setGeometry(zone, options.time, anchor);
      planned.push(zone);
    }
    this.zones.push(...planned);
    return planned.map(zone => zone.id);
  }
  retarget(castId: number, caster: CombatEntity, aim: Point): void {
    const zones = this.zones.filter(zone => zone.castId === castId && zone.phase === 'pending');
    const group = zones[0]?.group;
    if (!group) return;
    if (group.pattern.placement.kind === 'target' && Math.hypot(aim.x - caster.x, aim.y - caster.y) > group.pattern.placement.targetingRange) return;
    const anchor = zoneAnchor(group.pattern, caster, aim), angle = Math.atan2(aim.y - caster.y, aim.x - caster.x);
    if (!canOccupy(this.world, anchor, 0) || !clearAttackPath(this.world, caster, anchor)) return;
    for (const zone of zones) {
      const offset = rotatePoint(zone.offset, angle), point = { x: anchor.x + offset.x, y: anchor.y + offset.y };
      if (!canOccupy(this.world, point, 0) || !clearAttackPath(this.world, anchor, point)) return;
    }
    group.anchor = anchor; group.angle = angle;
    for (const zone of zones) { zone.anchor = { ...anchor }; this.setGeometry(zone, zone.activationTime, anchor); }
  }
  clear(): void { this.zones = []; }
  cancelCast(castId: number): void { this.zones = this.zones.filter(zone => zone.castId !== castId || zone.started); }
  cancelCaster(casterId: string): void { this.zones = this.zones.filter(zone => zone.casterId !== casterId); }
  firstGeometry(castId: number) { return this.zones.find(zone => zone.castId === castId)?.geometry; }
  snapshot(): ZoneSnapshot[] {
    return this.zones.map(({ group: _group, offset: _offset, anchor: _anchor, started: _started, ...zone }) => structuredClone(zone));
  }
  update(previousTime: number, time: number, callbacks: ZoneCallbacks): void {
    for (const zone of [...this.zones]) {
      if (!this.zones.includes(zone)) continue;
      const caster = callbacks.entity(zone.casterId);
      if (!caster || caster.defeated) { this.cancelCaster(zone.casterId); continue; }
      if (time < zone.activationTime - 1e-9) {
        if (zone.group.pattern.motion.kind === 'orbit' && zone.group.pattern.motion.followCaster) {
          zone.anchor = { x: caster.x, y: caster.y }; this.setGeometry(zone, time, zone.anchor);
        }
        continue;
      }
      if (!zone.started) { zone.started = true; zone.phase = 'active'; callbacks.event('zone-activation', zone); }
      const start = Math.max(previousTime, zone.activationTime), end = Math.min(time, zone.expirationTime - 1e-7);
      const anchor = zone.group.pattern.motion.kind === 'orbit' && zone.group.pattern.motion.followCaster
        ? { x: caster.x, y: caster.y } : zone.group.anchor;
      if (end >= start) {
        const oldAnchor = zone.anchor;
        const rotation = zone.group.pattern.motion.kind === 'orbit'
          ? Math.abs(zone.group.pattern.motion.angularSpeedDegrees) * Math.PI / 180 * (end - start) : 0;
        const extent = Math.hypot(zone.offset.x, zone.offset.y) + shapeRadius(zone.group.pattern.shape);
        const steps = Math.max(1, Math.ceil((rotation * extent + Math.hypot(anchor.x - oldAnchor.x, anchor.y - oldAnchor.y)) / .025));
        for (let step = 0; step <= steps; step++) {
          const sampleTime = start + (end - start) * step / steps;
          const sampleAnchor = { x: oldAnchor.x + (anchor.x - oldAnchor.x) * step / steps,
            y: oldAnchor.y + (anchor.y - oldAnchor.y) * step / steps };
          this.setGeometry(zone, sampleTime, sampleAnchor);
          for (const target of callbacks.targets(zone.group.team)) {
            if (zone.occluded || target.defeated || !touchesGeometry(zone.geometry, target)
              || !clearAttackPath(this.world, zone.geometry.origin, target)) continue;
            if (zone.group.ledger.allow(zone.group.pattern.hitPolicy, zone.id, target.id, sampleTime)) callbacks.hit(caster, target, zone.moveId);
            if (!this.zones.includes(zone)) break;
          }
          if (!this.zones.includes(zone)) break;
        }
      }
      zone.anchor = { ...anchor };
      if (time >= zone.expirationTime - 1e-9) {
        callbacks.event('zone-expiration', zone);
        this.zones = this.zones.filter(entry => entry !== zone);
      }
    }
  }
  private setGeometry(zone: ZoneState, time: number, anchor: Point): void {
    const { pattern, angle } = zone.group;
    const rotation = pattern.motion.kind === 'orbit' ? pattern.motion.angularSpeedDegrees * Math.PI / 180 * Math.max(0, time - zone.activationTime) : 0;
    const offset = rotatePoint(zone.offset, angle + rotation);
    zone.geometry = shapeGeometry(pattern.shape, { x: anchor.x + offset.x, y: anchor.y + offset.y }, angle + rotation);
    if (pattern.motion.kind === 'orbit') {
      zone.occluded = !canOccupy(this.world, zone.geometry.origin, 0) || !clearAttackPath(this.world, anchor, zone.geometry.origin);
      const radius = Math.hypot(zone.offset.x, zone.offset.y), extent = shapeRadius(pattern.shape);
      zone.trajectory = { kind: 'ring', origin: { ...anchor }, innerRadius: Math.max(0, radius - extent), outerRadius: radius + extent,
        angleRadians: 0, angleDegrees: 360 };
    }
  }
}
