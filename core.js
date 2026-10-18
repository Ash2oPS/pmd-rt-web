export const MAP = [
  "########################",
  "#..........##..........#",
  "#...##...........##....#",
  "#...##...........##....#",
  "#......................#",
  "#......................#",
  "#..........###.........#",
  "#..........###.........#",
  "#...~~~...........##...#",
  "#..~~~~~..........##...#",
  "#...~~~................#",
  "#..............#.......#",
  "#......................#",
  "########################",
];
export const CRYSTALS = [
  { x: 7, y: 5 },
  { x: 19, y: 4 },
  { x: 16, y: 11 },
];
export const ACTIONS = [
  "up",
  "down",
  "left",
  "right",
  "confirm",
  "back",
  "menu",
];
export const walkable = (x, y) =>
  Number.isInteger(x) && Number.isInteger(y) && MAP[y]?.[x] === ".";
export function initialState() {
  return {
    version: 1,
    player: { x: 3, y: 5 },
    steps: 0,
    collected: [],
    facing: "down",
  };
}
export function move(state, dx, dy) {
  if (Math.abs(dx) + Math.abs(dy) !== 1) return false;
  state.facing = dx ? (dx > 0 ? "right" : "left") : dy > 0 ? "down" : "up";
  const x = state.player.x + dx,
    y = state.player.y + dy;
  if (!walkable(x, y)) return false;
  state.player = { x, y };
  state.steps++;
  const index = CRYSTALS.findIndex((c) => c.x === x && c.y === y);
  if (index >= 0 && !state.collected.includes(index))
    state.collected.push(index);
  return true;
}
export function restore(raw) {
  try {
    const s = JSON.parse(raw);
    if (
      s?.version !== 1 ||
      !walkable(s.player?.x, s.player?.y) ||
      !Number.isSafeInteger(s.steps) ||
      s.steps < 0 ||
      !Array.isArray(s.collected) ||
      s.collected.length > CRYSTALS.length ||
      !s.collected.every(
        (n) => Number.isInteger(n) && n >= 0 && n < CRYSTALS.length,
      ) ||
      new Set(s.collected).size !== s.collected.length ||
      !["up", "down", "left", "right"].includes(s.facing)
    )
      return null;
    return {
      version: 1,
      player: { x: s.player.x, y: s.player.y },
      steps: s.steps,
      collected: [...s.collected],
      facing: s.facing,
    };
  } catch {
    return null;
  }
}
export function defaultMapping() {
  return Object.fromEntries(
    ACTIONS.map((a, i) => [
      a,
      { type: "button", index: [12, 13, 14, 15, 0, 1, 9][i] },
    ]),
  );
}
export function validateMapping(map) {
  return (
    !!map &&
    ACTIONS.every((a) => {
      const b = map[a];
      return (
        b &&
        Number.isInteger(b.index) &&
        b.index >= 0 &&
        b.index < 64 &&
        (b.type === "button" || (b.type === "axis" && [1, -1].includes(b.sign)))
      );
    })
  );
}
export function decodePad(pad, mapping) {
  if (!pad) return [];
  const defaults = defaultMapping();
  return ACTIONS.filter((a) => {
    const b = mapping[a];
    if (b.type === "axis") return (pad.axes[b.index] || 0) * b.sign > 0.5;
    if (pad.buttons[b.index]?.pressed || pad.buttons[b.index]?.value > 0.5)
      return true;
    if (b.index !== defaults[a].index) return false;
    const axes = { up: [1, -1], down: [1, 1], left: [0, -1], right: [0, 1] };
    return axes[a] ? (pad.axes[axes[a][0]] || 0) * axes[a][1] > 0.25 : false;
  });
}
