import { useSyncExternalStore } from "react";

/** Tiny persisted store (localStorage or sessionStorage) with React subscription. */
export function createStore<T>(key: string, initial: () => T, storage: "local" | "session" = "local") {
  const area = () => (storage === "local" ? globalThis.localStorage : globalThis.sessionStorage);
  let value: T;
  try {
    const raw = area()?.getItem(key);
    value = raw ? { ...initial(), ...JSON.parse(raw) } : initial();
  } catch {
    value = initial();
  }
  const subs = new Set<() => void>();
  const get = () => value;
  const set = (next: T | ((prev: T) => T)) => {
    value = typeof next === "function" ? (next as (p: T) => T)(value) : next;
    try {
      area()?.setItem(key, JSON.stringify(value));
    } catch {
      /* quota or privacy mode - keep in memory */
    }
    subs.forEach((s) => s());
  };
  const subscribe = (cb: () => void) => {
    subs.add(cb);
    return () => subs.delete(cb);
  };
  const use = () => useSyncExternalStore(subscribe, get, get);
  const reset = () => set(initial());
  return { get, set, use, subscribe, reset };
}
