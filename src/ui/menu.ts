import { element } from "./dom.ts";
import type { Action, Mapping } from "../platform/input/mapping.ts";
import { ACTIONS, bindingLabel } from "../platform/input/mapping.ts";
export const actionLabels: Record<Action, string> = {
  up: "Haut",
  down: "Bas",
  left: "Gauche",
  right: "Droite",
  confirm: "Valider",
  back: "Retour",
  menu: "Menu",
};
export interface MenuCallbacks {
  pause(): void;
  resume(): void;
  capture(action: Action): void;
  commands: Record<string, () => void>;
}
export class Menu {
  screen: "main" | "controls" | "journal" | null = null;
  private selected = 0;
  constructor(private callbacks: MenuCallbacks) {
    document
      .querySelectorAll<HTMLButtonElement>("[data-menu]")
      .forEach((button) =>
        button.addEventListener("click", () =>
          callbacks.commands[button.dataset.menu!]?.(),
        ),
      );
    element("menu-toggle").addEventListener("click", () =>
      this.paused ? this.resume() : this.open(),
    );
    for (const id of ["controls-back", "journal-back"])
      element(id).addEventListener("click", () => this.open());
    document
      .querySelector(".menu-panel")!
      .addEventListener("focusin", (event) => {
        const index = this.buttons().indexOf(event.target as HTMLElement);
        if (index >= 0) {
          this.selected = index;
          this.highlight();
        }
      });
    document.addEventListener("keydown", (event) => {
      if (!this.paused || event.key !== "Tab") return;
      event.preventDefault();
      this.navigate(event.shiftKey ? -1 : 1);
    });
  }
  get paused() {
    return this.screen !== null;
  }
  get submenu() {
    return this.screen === "controls" || this.screen === "journal";
  }
  buttons(): HTMLElement[] {
    const id =
      this.screen === "controls"
        ? "controls-panel"
        : this.screen === "journal"
          ? "journal-panel"
          : "menu-main";
    return [
      ...element(id).querySelectorAll<HTMLElement>("button, summary"),
    ].filter((button) => !button.hidden);
  }
  highlight() {
    document
      .querySelectorAll(".selected")
      .forEach((button) => button.classList.remove("selected"));
    this.selected = Math.max(
      0,
      Math.min(this.selected, this.buttons().length - 1),
    );
    this.buttons()[this.selected]?.classList.add("selected");
  }
  open(reason = "L’aventure t’attend.", focus = true) {
    this.callbacks.pause();
    this.show("main", "Une petite pause.", reason, focus);
    element("scene-status").textContent = "En pause";
  }
  resume() {
    this.screen = null;
    element("overlay").hidden = true;
    element("scene-status").textContent = "Exploration";
    this.callbacks.resume();
    element("game").focus({ preventScroll: true });
  }
  private show(
    screen: NonNullable<Menu["screen"]>,
    title: string,
    reason: string,
    focus = true,
  ) {
    this.screen = screen;
    this.selected = 0;
    element("overlay").hidden = false;
    for (const [name, id] of [
      ["main", "menu-main"],
      ["controls", "controls-panel"],
      ["journal", "journal-panel"],
    ])
      element(id).hidden = name !== screen;
    element("menu-title").textContent = title;
    this.message(reason);
    this.highlight();
    if (focus) this.buttons()[0]?.focus({ preventScroll: true });
  }
  controls(mapping: Mapping) {
    this.renderBindings(mapping);
    this.show(
      "controls",
      "À ta façon.",
      "Croix ou stick · A valider · B retour · Start menu",
    );
  }
  journal() {
    this.show(
      "journal",
      "Carnet d’expédition.",
      "Progression, sauvegarde et connexion.",
    );
  }
  renderBindings(mapping: Mapping) {
    element("bindings").replaceChildren(
      ...ACTIONS.map((action) => {
        const button = document.createElement("button");
        button.dataset.binding = action;
        const name = document.createElement("span"),
          binding = document.createElement("span");
        name.textContent = actionLabels[action];
        binding.textContent = bindingLabel(mapping[action]);
        button.append(name, binding);
        button.addEventListener("click", () => this.callbacks.capture(action));
        return button;
      }),
    );
  }
  navigate(delta: number) {
    const buttons = this.buttons();
    this.selected = (this.selected + delta + buttons.length) % buttons.length;
    this.highlight();
    buttons[this.selected]?.focus({ preventScroll: true });
    buttons[this.selected]?.scrollIntoView({ block: "nearest" });
  }
  confirm() {
    this.buttons()[this.selected]?.click();
  }
  message(text: string) {
    element("pause-reason").textContent = text;
  }
}
