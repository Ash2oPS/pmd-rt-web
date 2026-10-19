import { createState } from '../domain/state.ts';
import { WALK_SPEED, moveContinuous } from '../domain/movement.ts';
import type { GameState, Point, World } from '../domain/state.ts';
import type { Action } from '../platform/input/mapping.ts';
export class Runtime {
  state: GameState;
  visual: Point;
  velocity: Point = { x: 0, y: 0 };
  time = 0;
  previous = new Set<Action>();
  private held: Action | '' = '';
  private repeat = 0;
  constructor(readonly world: World, state = createState(world), readonly maxSpeed = WALK_SPEED) {
    this.state = state;
    this.visual = { ...state.player };
  }
  clear() {
    this.held = '';
    this.repeat = 0;
    this.velocity = { x: 0, y: 0 };
  }
  replace(state: GameState) {
    this.state = state;
    this.visual = { ...state.player };
    this.clear();
  }
  updateInput(actions: Set<Action>, dt: number, act: (action: Action) => void, paused: boolean) {
    for (const action of ['menu', 'back', 'confirm'] as const)
      if (actions.has(action) && !this.previous.has(action)) act(action);
    const direction = (['up', 'down', 'left', 'right'] as const).find(action => actions.has(action));
    if (paused && direction) {
      this.repeat -= dt;
      if (direction !== this.held || this.repeat <= 0) {
        act(direction);
        this.repeat = direction !== this.held ? .25 : .14;
      }
      this.held = direction;
    } else { this.held = ''; this.repeat = 0; }
    this.previous = actions;
  }
  advance(vector: Point, dt: number) {
    const before = { ...this.state.player };
    const result = moveContinuous(this.state, vector, dt, this.world, this.maxSpeed);
    this.visual = { ...this.state.player };
    this.velocity = dt > 0 ? {
      x: (this.visual.x - before.x) / dt,
      y: (this.visual.y - before.y) / dt,
    } : { x: 0, y: 0 };
    this.time += dt;
    return result;
  }
}
