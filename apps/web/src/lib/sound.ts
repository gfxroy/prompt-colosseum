import { settingsStore } from "./state";

/** Synthesised sound effects (no assets). Off by default. */
let ctx: AudioContext | null = null;
const ac = () => (ctx ??= new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)());

function tone(freq: number, dur: number, type: OscillatorType = "sine", gain = 0.08, delay = 0, slideTo?: number) {
  const a = ac();
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, a.currentTime + delay);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, a.currentTime + delay + dur);
  g.gain.setValueAtTime(0.0001, a.currentTime + delay);
  g.gain.exponentialRampToValueAtTime(gain, a.currentTime + delay + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + delay + dur);
  o.connect(g).connect(a.destination);
  o.start(a.currentTime + delay);
  o.stop(a.currentTime + delay + dur + 0.05);
}

function noise(dur: number, gain = 0.05, delay = 0) {
  const a = ac();
  const buf = a.createBuffer(1, a.sampleRate * dur, a.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  const src = a.createBufferSource();
  const f = a.createBiquadFilter();
  f.type = "bandpass";
  f.frequency.value = 1200;
  const g = a.createGain();
  g.gain.value = gain;
  src.buffer = buf;
  src.connect(f).connect(g).connect(a.destination);
  src.start(a.currentTime + delay);
}

export type Sfx = "pass" | "fail" | "hit" | "victory" | "defeat" | "draw" | "click" | "badge" | "levelup";

export function play(s: Sfx) {
  if (!settingsStore.get().sound) return;
  try {
    switch (s) {
      case "pass":
        tone(880, 0.12, "triangle", 0.06);
        tone(1320, 0.1, "triangle", 0.04, 0.06);
        break;
      case "fail":
        tone(180, 0.18, "sawtooth", 0.05, 0, 110);
        break;
      case "hit":
        tone(90, 0.2, "square", 0.07, 0, 50);
        noise(0.12, 0.05);
        break;
      case "victory":
        [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.25, "triangle", 0.07, i * 0.11));
        noise(1.2, 0.03, 0.3);
        break;
      case "defeat":
        [392, 330, 262, 196].forEach((f, i) => tone(f, 0.3, "sine", 0.06, i * 0.15));
        break;
      case "draw":
        tone(440, 0.3, "sine", 0.05);
        tone(440, 0.3, "sine", 0.05, 0.2);
        break;
      case "badge":
        [784, 988, 1175].forEach((f, i) => tone(f, 0.18, "triangle", 0.06, i * 0.07));
        break;
      case "levelup":
        [523, 784, 1046, 1568].forEach((f, i) => tone(f, 0.2, "square", 0.04, i * 0.08));
        break;
      case "click":
        tone(1200, 0.03, "square", 0.02);
        break;
    }
  } catch {
    /* audio unavailable */
  }
}
