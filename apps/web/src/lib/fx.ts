import confetti from "canvas-confetti";
import { settingsStore } from "./state";

const reduced = () => settingsStore.get().reducedFx || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

export function celebrate() {
  if (reduced()) return;
  const colors = ["#ffd166", "#f97316", "#fde68a", "#34d399", "#ffffff"];
  confetti({ particleCount: 120, spread: 80, origin: { y: 0.6 }, colors, disableForReducedMotion: true });
  setTimeout(() => confetti({ particleCount: 80, angle: 60, spread: 60, origin: { x: 0 }, colors }), 250);
  setTimeout(() => confetti({ particleCount: 80, angle: 120, spread: 60, origin: { x: 1 }, colors }), 400);
  try {
    const thumb = confetti.shapeFromText({ text: "👍", scalar: 2 });
    setTimeout(() => confetti({ shapes: [thumb], scalar: 2, particleCount: 25, spread: 100, origin: { y: 0.7 } }), 600);
  } catch {
    /* emoji shapes unsupported */
  }
}

export function boo() {
  if (reduced()) return;
  try {
    const thumb = confetti.shapeFromText({ text: "👎", scalar: 2 });
    confetti({ shapes: [thumb], scalar: 2, particleCount: 18, spread: 70, gravity: 1.4, origin: { y: 0.2 } });
  } catch {
    /* ignore */
  }
}

export function sparkle(x = 0.5, y = 0.5) {
  if (reduced()) return;
  confetti({ particleCount: 30, spread: 50, startVelocity: 25, origin: { x, y }, colors: ["#ffd166", "#fde68a"], scalar: 0.7 });
}
