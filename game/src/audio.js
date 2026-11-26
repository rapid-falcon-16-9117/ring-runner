// Ring Runner — a pocketful of WebAudio: no audio files, just oscillators.
// An engine hum that follows the throttle, a two-tone chime for a ring, a
// knock for a crate, a thud for bad news. Everything is guarded: a browser
// that refuses audio must never break the game, and screenshot staging
// (window.__MUTE__) keeps the renderer silent and deterministic.

let ctx = null;
let engineOsc = null;
let engineGain = null;
let lastWarn = 0;

function ensure() {
  if (window.__MUTE__) return null;
  try {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function tone(freq, dur, type = 'sine', gain = 0.08, when = 0) {
  const ac = ensure();
  if (!ac) return;
  try {
    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    g.gain.setValueAtTime(gain, ac.currentTime + when);
    g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + when + dur);
    osc.connect(g).connect(ac.destination);
    osc.start(ac.currentTime + when);
    osc.stop(ac.currentTime + when + dur + 0.02);
  } catch { /* silence is fine */ }
}

export const audio = {
  /** Start (once) the engine hum; call from a user gesture. */
  startEngine() {
    const ac = ensure();
    if (!ac || engineOsc) return;
    try {
      engineOsc = ac.createOscillator();
      engineGain = ac.createGain();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 55;
      engineGain.gain.value = 0.0;
      const filter = ac.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 320;
      engineOsc.connect(filter).connect(engineGain).connect(ac.destination);
      engineOsc.start();
    } catch { /* no engine, no problem */ }
  },
  /** Keep the hum honest with the throttle lever. */
  setEngine(throttle, speed) {
    if (!engineOsc || !ctx) return;
    try {
      engineOsc.frequency.value = 48 + throttle * 65 + speed * 0.12;
      engineGain.gain.value = 0.012 + throttle * 0.03;
    } catch { /* ignore */ }
  },
  ring() {
    tone(880, 0.12, 'sine', 0.07);
    tone(1318, 0.2, 'sine', 0.07, 0.09);
  },
  crate() {
    tone(523, 0.09, 'square', 0.045);
    tone(784, 0.14, 'square', 0.045, 0.07);
  },
  warn() {
    const now = performance.now();
    if (now - lastWarn < 900) return;
    lastWarn = now;
    tone(196, 0.16, 'square', 0.05);
  },
  thud() {
    tone(70, 0.4, 'sine', 0.16);
    tone(46, 0.55, 'triangle', 0.14, 0.05);
  },
  chime() {
    tone(659, 0.14, 'sine', 0.06);
    tone(880, 0.22, 'sine', 0.06, 0.11);
  },
};
