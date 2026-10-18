import { element } from "./dom.ts";
import type { PadLike, Mapping } from "../platform/input/mapping.ts";
import { rawSignals, bindingLabel } from "../platform/input/mapping.ts";
import type { createInputDiagnostics } from "../platform/input/diagnostics.ts";
type Diagnostics = ReturnType<typeof createInputDiagnostics>;
export function createDiagnosticsView(
  diagnostics: Diagnostics,
  mapping: () => Mapping,
  notify: (message: string) => void,
) {
  const report = () => diagnostics.report(mapping());
  const details = element<HTMLDetailsElement>("input-details");
  let lastPaint = 0;
  async function copy() {
    try {
      await navigator.clipboard.writeText(report());
      notify("Diagnostic copié. Tu peux le coller dans le chat.");
    } catch {
      details.open = true;
      element("input-report").textContent = report();
      notify("Copie indisponible. Le rapport est affiché dans Connexion.");
    }
  }
  element("copy-diagnostics").addEventListener("click", copy);
  details.addEventListener("toggle", () => {
    if (details.open) element("input-report").textContent = report();
  });
  document.addEventListener("wheel", () => diagnostics.snapshot.wheelEvents++, {
    passive: true,
  });
  return {
    copy,
    update(pad: PadLike | null) {
      const error = diagnostics.snapshot.error;
      element("pad-status").textContent = error
        ? "Erreur d’accès"
        : pad
          ? "Connectée"
          : "À connecter";
      element("pad-name").textContent =
        pad?.id || error || "Appuie sur un bouton pour la détecter.";
      const signals = rawSignals(pad);
      element("raw-input").textContent = signals.length
        ? signals.map(bindingLabel).join(" · ")
        : pad
          ? "Au repos · zone morte 25 %"
          : "Aucun signal";
      const meter = element("input-meter"),
        count = Math.min(64, pad?.buttons.length || 17);
      if (meter.children.length !== count)
        meter.replaceChildren(
          ...Array.from({ length: count }, (_, i) => {
            const bar = document.createElement("i");
            bar.title = `Bouton ${i}`;
            return bar;
          }),
        );
      [...meter.children].forEach((bar, i) =>
        bar.classList.toggle(
          "on",
          !!pad?.buttons[i]?.pressed || (pad?.buttons[i]?.value || 0) > 0.5,
        ),
      );
      if (details.open && performance.now() - lastPaint > 150) {
        element("input-report").textContent = report();
        lastPaint = performance.now();
      }
    },
  };
}
