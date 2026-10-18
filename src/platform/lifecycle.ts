export function bindLifecycle(callbacks: {
  clear(): void;
  save(): void;
  suspend(reason: string): void;
  visible(): void;
}) {
  document.addEventListener("visibilitychange", () => {
    if (document.hidden)
      callbacks.suspend("Reprise après veille. Ta position a été sauvegardée.");
    else {
      callbacks.clear();
      callbacks.visible();
    }
  });
  window.addEventListener("blur", () => {
    callbacks.clear();
    callbacks.save();
  });
  window.addEventListener("pagehide", () => {
    callbacks.clear();
    callbacks.save();
  });
  document.addEventListener("freeze", () =>
    callbacks.suspend("Reprise après veille. Ta position a été sauvegardée."),
  );
}
