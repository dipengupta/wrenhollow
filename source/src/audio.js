// ============================================================================
// audio: a procedural highland dusk (no sample files)
// ============================================================================
// A fixed Web Audio graph, built on the first click / key / touch and driven by a 10 Hz timer, not the frame loop.
// Layers: wind (louder and brighter with height, speed and the weather), lapping water near the loch, rain, a distant
// bell, rooks by day and an owl at night.
let AC, OUT, muted = false;
const VOL = 0.8;
function mkSound(ac) {
  const sr = ac.sampleRate;
  const N = (Cl, o, ...to) => { const n = new Cl(ac, o); for (const d of to) n.connect(d); if (n.start) n.start(); return n; };
  const G = (gain, ...to) => N(GainNode, { gain }, ...to);
  const BQ = (type, frequency, Q, ...to) => N(BiquadFilterNode, { type, frequency, Q }, ...to);
  const lfo = (frequency, depth, to) => N(OscillatorNode, { frequency }, G(depth, to));
  const noise = (secs, f) => { const n = sr * secs | 0, b = new AudioBuffer({ length: n, numberOfChannels: 2, sampleRate: sr }); f(b.getChannelData(0), n); f(b.getChannelData(1), n); return b; };
  const nb = noise(11, (d, n) => { for (let i = 0, b = 0; i < n + 4096; i++) { b = (b + 0.02 * (rnd() * 2 - 1)) / 1.02; if (i < n) d[i] = b * 3.5; else { const k = (i - n) / 4096; d[i - n] = d[i - n] * k + b * 3.5 * (1 - k); } } });
  const ir = noise(4, (d, n) => { for (let i = 0, b = 0; i < n; i++) { const t = i / sr; b += (rnd() * 2 - 1 - b) * (0.05 + 0.5 * exp(-t * 2)); d[i] = b * (1 - exp(-t * 40)) * exp(-t * 1.4) * (1 - i / n); } });
  const lim = N(DynamicsCompressorNode, { threshold: -6, knee: 6, ratio: 20, attack: 0.003, release: 0.3 }, ac.destination);
  const out = OUT = G(0, lim), wet = N(ConvolverNode, { buffer: ir }, out);
  const src = (playbackRate, ...to) => N(AudioBufferSourceNode, { buffer: nb, loop: true, playbackRate }, ...to);
  // wind: two bands of noise with slow gusts
  const wind = G(0.3, out), windF = BQ('bandpass', 500, 0.6, wind), gust = G(1, windF); src(1, gust); lfo(0.05, 0.4, gust.gain); lfo(0.13, 0.25, gust.gain);
  const low = G(0.25, out); src(0.7, BQ('lowpass', 180, 0.7, low)); lfo(0.07, 0.1, low.gain);
  // the loch lapping: low-passed noise pulsed by slow waves, loud near the water
  const lap = G(0, out), lapP = G(0.5, lap); src(0.53, BQ('lowpass', 600, 1, lapP)); lfo(0.4, 0.45, lapP.gain); lfo(0.23, 0.25, lapP.gain);
  // rain: bright hiss over a softer patter
  const rain = G(0, out); src(2.3, BQ('highpass', 1400, 0.5, rain)); src(1.1, BQ('bandpass', 700, 0.8, G(0.5, rain)));
  // thunder: a deep rumble and a sharper crack, both from the noise loop, shaped by envelopes when lightning strikes
  const rumble = G(0, out, G(0.8, wet)), crack = G(0, out); src(0.22, BQ('lowpass', 140, 0.8, rumble)); src(0.6, BQ('bandpass', 400, 0.7, crack));
  // running water: the mill race and Wren Falls, louder as you come close
  const water = G(0, out); src(1.6, BQ('bandpass', 900, 0.4, water)); src(0.9, BQ('lowpass', 500, 0.7, G(0.6, water)));
  // pooled voices
  const pool = (n, send, type) => Array.from({ length: n }, () => { const p = N(StereoPannerNode, {}, out, G(send, wet)), g = G(0, p); return { p, g, o: N(OscillatorNode, { type }, g) }; });
  const bell = pool(6, 2.2), rook = pool(3, 0.6, 'sawtooth'), owl = pool(2, 1.2, 'sine'), honk = pool(4, 0.8, 'square'), moo = pool(2, 1, 'sawtooth');
  const play = (vs, t, f0, f1, dur, vol, att, pan = rr(-0.7, 0.7)) => {
    const v = vs.shift(), f = v.o.frequency, g = v.g.gain; vs.push(v);
    v.p.pan.setValueAtTime(pan, t);
    f.setValueAtTime(f0, t); f.exponentialRampToValueAtTime(f1, t + dur);
    g.setValueAtTime(0, t); g.linearRampToValueAtTime(vol, t + att); g.setTargetAtTime(0, t + att, (dur - att) / 5);
  };
  let lt = ac.currentTime, tR = lt + 3, lx = F[CX], ly = F[CY], lz = F[CZ], lastHour = -1, lastTod = tod, strikeAt = lt + 4, seen = STRIKES, tG = lt + 2, tC = lt + 20;
  out.gain.setTargetAtTime(VOL, lt, 1.5);
  return () => {
    const now = ac.currentTime, t = now + 0.05, dt = now - lt;
    if (dt <= 0) return;
    let v = hypot(F[CX] - lx, F[CY] - ly, F[CZ] - lz) / dt; if (v > 150) v = 0;
    lt = now; lx = F[CX]; ly = F[CY]; lz = F[CZ];
    const alt = clamp((ly - H(lx, lz)) / 120, 0, 1);
    const w = WEATHER[weather], night = TOD[tod].night, snowy = SEASON[season].snow > 0.5;
    wind.gain.setTargetAtTime((0.18 + 0.35 * alt + 0.3 * min(v / 70, 1)) * (0.6 + 0.8 * w.wind), t, 0.5);
    rain.gain.setTargetAtTime(snowy ? 0 : w.precip * 0.35, t, 1); windF.frequency.setTargetAtTime(380 + 500 * alt + v * 8, t, 0.5);
    lap.gain.setTargetAtTime(0.5 * clamp(1 - ly / 25, 0, 1), t, 0.5);
    { const df = hypot(lx - FALLS[0], ly - FALLS[1], lz - FALLS[2]), dm = hypot(lx - MILLW[0], ly - MILLW[1], lz - MILLW[2]);
      water.gain.setTargetAtTime(0.5 * clamp(1 - df / 90, 0, 1) ** 2 + 0.3 * clamp(1 - dm / 50, 0, 1) ** 2, t, 0.4); }
    // thunder follows the flash after 1 to 4 s
    if (STRIKES !== seen) {
      seen = STRIKES; const tt = t + rr(1, 4), big = rr(0.6, 1);
      rumble.gain.cancelScheduledValues(t); rumble.gain.setValueAtTime(0, tt); rumble.gain.linearRampToValueAtTime(1.6 * big, tt + 0.25); rumble.gain.setTargetAtTime(0.5 * big, tt + 0.3, 0.6); rumble.gain.setTargetAtTime(0, tt + 1.4, 1.3);
      crack.gain.cancelScheduledValues(t); crack.gain.setValueAtTime(0, tt - 0.05); crack.gain.linearRampToValueAtTime(0.5 * big, tt); crack.gain.setTargetAtTime(0, tt + 0.02, 0.15);
    }
    // geese honking as the V passes over in autumn (the same path as the shader's)
    if (SEASON[season].phase === 2 && night < 0.6 && w.precip < 0.5 && t > tG) {
      const pd = (F[TIME] / 80 % 1) * 2800 - 1400, gx = 60 - 0.8 * pd, gz = -40 + 0.6 * pd, d = hypot(lx - gx, ly - 180, lz - gz);
      if (d < 700) { const v = 0.02 * (1 - d / 700); for (let k = 0; k < 3; k++) { const f = rr(300, 380); play(honk, t + k * rr(0.25, 0.5), f, f * 0.85, 0.2, v * rr(0.5, 1), 0.02); } }
      tG = t + rr(1, 3);
    }
    // highland cattle lowing now and then, when you are near one of their herds
    if (t > tC) {
      if (night < 0.5 && (hypot(lx + 265, lz + 505) < 160 || hypot(lx - 245, lz + 235) < 120)) { const f = rr(105, 130); play(moo, t, f, f * 0.75, 1.6, 0.03, 0.25); play(moo, t, f * 2, f * 1.5, 1.6, 0.012, 0.25); }
      tC = t + rr(15, 35);
    }
    // the Bell Tower strikes the hour the clock shows: on the hour, and soon after the time of day is changed
    const hour = floor(TOD[tod].clock + F[TIME] / 3600);
    if (tod !== lastTod) { lastTod = tod; strikeAt = t + 2; }
    if (lastHour >= 0 && hour !== lastHour) strikeAt = t;
    lastHour = hour;
    if (t >= strikeAt) {
      const n = (hour + 11) % 12 + 1;
      for (let k = 0; k < n; k++) { const tt = t + k * 2.4; for (const [r, a] of [[0.5, 0.05], [1, 0.035], [1.19, 0.02], [1.5, 0.015], [2.0, 0.012], [2.74, 0.008]]) play(bell, tt, 196 * r, 196 * r * 0.998, 6, a * 0.8, 0.01, 0.3); }
      strikeAt = Infinity;
    }
    if (t > tR) {
      if (night > 0.5) { // a tawny owl: a long hoot, a pause, then a wavering one
        play(owl, t, 410, 380, 0.9, 0.02, 0.08); play(owl, t + 1.9, 400, 360, 0.3, 0.012, 0.04); play(owl, t + 2.4, 420, 370, 1.4, 0.018, 0.1);
        tR = t + rr(12, 25);
      } else { // a rook calling twice (they keep quiet in the rain)
        if (w.precip < 0.5) { const f = rr(380, 520); for (let k = 0; k < 2; k++) play(rook, t + k * 0.32, f, f * 0.7, 0.22, 0.015, 0.02); }
        tR = t + rr(4, 14);
      }
    }
  };
}
function sound() {
  if (!AC) { AC = new AudioContext({ latencyHint: 'playback' }); setInterval(mkSound(AC), 100); }
  if (AC.state === 'suspended' && !document.hidden) AC.resume();
}
const mute = () => { muted = !muted; if (OUT) OUT.gain.setTargetAtTime(muted ? 0 : VOL, AC.currentTime, 0.08); };
