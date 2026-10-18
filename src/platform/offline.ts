interface InstallPrompt extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<unknown>;
}

/** Let first-visit lazy asset requests pass through the worker's runtime cache. */
export function waitForOfflineController(timeoutMs = 8000): Promise<boolean> {
  if (import.meta.env.DEV || !("serviceWorker" in navigator)) return Promise.resolve(false);
  const serviceWorker = navigator.serviceWorker;
  if (serviceWorker.controller) return Promise.resolve(true);
  return new Promise((resolve) => {
    const finish = (controlled: boolean) => {
      clearTimeout(timeout);
      serviceWorker.removeEventListener("controllerchange", changed);
      resolve(controlled);
    };
    const changed = () => { if (serviceWorker.controller) finish(true); };
    const timeout = setTimeout(() => finish(false), timeoutMs);
    serviceWorker.addEventListener("controllerchange", changed);
    // Close the race between the initial controller read and installing the listener.
    changed();
  });
}
export function setupOffline(
  status: HTMLElement,
  button: HTMLButtonElement,
  notify: (text: string) => void,
) {
  let prompt: InstallPrompt | null = null;
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    prompt = event as InstallPrompt;
    button.hidden = false;
  });
  button.addEventListener("click", async () => {
    if (!prompt) return;
    await prompt.prompt();
    await prompt.userChoice;
    prompt = null;
    button.hidden = true;
  });
  window.addEventListener("appinstalled", () => {
    button.hidden = true;
    notify("Le jeu est installé. Bonne exploration !");
  });
  if (!("serviceWorker" in navigator)) {
    status.textContent = "Non pris en charge";
    return;
  }
  if (import.meta.env.DEV) {
    status.textContent = "Mode local";
    void navigator.serviceWorker
      .getRegistrations()
      .then((registrations) =>
        Promise.all(
          registrations
            .filter(
              (r) =>
                r.scope ===
                new URL(import.meta.env.BASE_URL, location.href).href,
            )
            .map((r) => r.unregister()),
        ),
      );
    return;
  }
  void navigator.serviceWorker
    .register(`${import.meta.env.BASE_URL}sw.js`)
    .then(async () => {
      await navigator.serviceWorker.ready;
      status.textContent = "Prêt";
    })
    .catch(() => {
      status.textContent = "Indisponible";
    });
}
