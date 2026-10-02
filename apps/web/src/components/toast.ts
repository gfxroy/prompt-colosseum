import { createStore } from "../lib/store";

export interface Toast {
  id: number;
  emoji: string;
  title: string;
  body?: string;
}
export const toastStore = createStore<{ toasts: Toast[] }>("colosseum.toasts.ephemeral", () => ({ toasts: [] }), "session");
let n = 0;
export function toast(t: Omit<Toast, "id">, ttl = 4200) {
  const id = ++n + Date.now();
  toastStore.set((s) => ({ toasts: [...s.toasts, { ...t, id }] }));
  setTimeout(() => toastStore.set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })), ttl);
}
