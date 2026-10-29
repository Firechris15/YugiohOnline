// Synthesized sound effects (WebAudio, no audio files needed).
import { useSettings } from '../store/settings';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;

function audio(): AudioContext | null {
  const s = useSettings.getState();
  if (!s.sound) return null;
  try {
    if (!ctx) {
      ctx = new AudioContext();
      master = ctx.createGain();
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') void ctx.resume();
    master!.gain.value = s.volume * 0.5;
    return ctx;
  } catch {
    return null;
  }
}

function tone(freq: number, dur: number, type: OscillatorType = 'sine', vol = 0.3, delay = 0, slideTo?: number) {
  const a = audio();
  if (!a || !master) return;
  const t = a.currentTime + delay;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + dur + 0.05);
}

function noise(dur: number, vol = 0.25, from = 800, to = 3000, delay = 0, q = 1.2) {
  const a = audio();
  if (!a || !master) return;
  const t = a.currentTime + delay;
  const len = Math.floor(a.sampleRate * dur);
  const buf = a.createBuffer(1, len, a.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  const src = a.createBufferSource();
  src.buffer = buf;
  const f = a.createBiquadFilter();
  f.type = 'bandpass';
  f.Q.value = q;
  f.frequency.setValueAtTime(from, t);
  f.frequency.exponentialRampToValueAtTime(to, t + dur);
  const g = a.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(master);
  src.start(t);
  src.stop(t + dur + 0.05);
}

export const sfx = {
  click: () => tone(880, 0.06, 'triangle', 0.12),
  hover: () => tone(1400, 0.03, 'sine', 0.04),
  draw: () => noise(0.22, 0.18, 2500, 900, 0, 0.8),
  set: () => {
    noise(0.12, 0.2, 600, 300);
    tone(180, 0.12, 'triangle', 0.15);
  },
  summon: () => {
    tone(90, 0.35, 'sine', 0.45, 0, 55);
    noise(0.3, 0.12, 400, 2400, 0.02);
    tone(660, 0.25, 'triangle', 0.1, 0.08);
    tone(990, 0.3, 'triangle', 0.08, 0.14);
  },
  activate: () => {
    [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.22, 'triangle', 0.12, i * 0.05));
    noise(0.4, 0.06, 3000, 6000, 0.05, 4);
  },
  attack: () => noise(0.32, 0.3, 300, 4000, 0, 0.9),
  hit: () => {
    tone(120, 0.25, 'square', 0.25, 0, 40);
    noise(0.18, 0.35, 1800, 200);
  },
  destroy: () => {
    noise(0.5, 0.35, 3000, 120, 0, 0.7);
    tone(300, 0.4, 'sawtooth', 0.1, 0, 60);
  },
  heal: () => [784, 988, 1175].forEach((f, i) => tone(f, 0.3, 'sine', 0.12, i * 0.07)),
  phase: () => tone(660, 0.18, 'sine', 0.1, 0, 880),
  turn: () => {
    tone(440, 0.2, 'triangle', 0.12);
    tone(660, 0.3, 'triangle', 0.12, 0.12);
  },
  negate: () => {
    tone(600, 0.25, 'square', 0.12, 0, 200);
    noise(0.25, 0.15, 5000, 800);
  },
  victory: () => [523, 659, 784, 1046, 1318].forEach((f, i) => tone(f, 0.5, 'triangle', 0.16, i * 0.12)),
  defeat: () => [392, 349, 311, 262].forEach((f, i) => tone(f, 0.6, 'sine', 0.16, i * 0.18)),
  coin: () => [1200, 1500, 1800, 2200].forEach((f, i) => tone(f, 0.08, 'square', 0.05, i * 0.07)),
};
