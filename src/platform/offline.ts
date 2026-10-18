interface InstallPrompt extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<unknown>;
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
