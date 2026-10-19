export {};
declare global {
  interface Window {
    render_game_to_text: () => string;
    advanceTime: (ms: number) => void;
    render_attack_lab_to_text: () => string;
    advance_attack_lab: (ms: number) => void;
  }
}
