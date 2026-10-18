import { createState, move } from "../domain/state.ts";
import type { GameState, Point, World } from "../domain/state.ts";
import type { Action } from "../platform/input/mapping.ts";
export class Runtime {
  state: GameState;
  visual: Point;
  time = 0;
  previous = new Set<Action>();
  private held: Action | "" = "";
  private repeat = 0;
  constructor(
    readonly world: World,
    state = createState(world),
  ) {
    this.state = state;
    this.visual = { ...state.player };
  }
  clear() {
    this.held = "";
    this.repeat = 0;
  }
  replace(state: GameState) {
    this.state = state;
    this.visual = { ...state.player };
  }
  direction(action: Action) {
    const directions: Partial<Record<Action, [number, number]>> = {
      up: [0, -1],
      down: [0, 1],
      left: [-1, 0],
      right: [1, 0],
    };
    const delta = directions[action];
    return delta ? move(this.state, ...delta, this.world) : false;
  }
  touch(action: Action) {
    this.previous.add(action);
    if (["up", "down", "left", "right"].includes(action)) {
      this.held = action;
      this.repeat = 0.25;
    }
  }
  updateInput(actions: Set<Action>, dt: number, act: (action: Action) => void) {
    for (const action of ["menu", "back", "confirm"] as const)
      if (actions.has(action) && !this.previous.has(action)) act(action);
    const direction = (["up", "down", "left", "right"] as const).find((a) =>
      actions.has(a),
    );
    if (direction) {
      this.repeat -= dt;
      if (direction !== this.held || this.repeat <= 0) {
        act(direction);
        this.repeat = direction !== this.held ? 0.25 : 0.14;
      }
      this.held = direction;
    } else this.clear();
    this.previous = actions;
  }
  animate(dt: number, reducedMotion: boolean) {
    this.time += dt;
    const speed = reducedMotion ? 1 : Math.min(1, dt * 20);
    this.visual.x += (this.state.player.x - this.visual.x) * speed;
    this.visual.y += (this.state.player.y - this.visual.y) * speed;
  }
}
