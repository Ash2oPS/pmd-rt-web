export function element<T extends HTMLElement = HTMLElement>(id: string): T {
  const value = document.getElementById(id);
  if (!value) throw new Error(`Missing UI element #${id}`);
  return value as T;
}
export function createToast(): (message: string) => void {
  let timer: ReturnType<typeof setTimeout>;
  return (message) => {
    element("toast").textContent = message;
    element("toast").classList.add("visible");
    clearTimeout(timer);
    timer = setTimeout(
      () => element("toast").classList.remove("visible"),
      2600,
    );
  };
}
