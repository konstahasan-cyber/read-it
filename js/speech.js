// Voice: prerecorded audio files when present (see tools/generate_audio.py),
// otherwise the device's built-in English voice.

let manifest = null;
let voice = null;
const cache = new Map();

export async function initSpeech() {
  try { manifest = await fetch('./audio/manifest.json').then((r) => (r.ok ? r.json() : null)); } catch { manifest = null; }
  pickVoice();
  if ('speechSynthesis' in window) speechSynthesis.onvoiceschanged = pickVoice;
}

function pickVoice() {
  if (!('speechSynthesis' in window)) return;
  const vs = speechSynthesis.getVoices().filter((v) => /^en/i.test(v.lang));
  const prefer = [/en-GB/i, /en-AU|en-IE/i, /en-US/i];
  const good = /Daniel|Kate|Serena|Arthur|Martha|Google UK|Samantha|Karen/i;
  for (const p of prefer) {
    const list = vs.filter((v) => p.test(v.lang));
    if (list.length) { voice = list.find((v) => good.test(v.name)) || list[0]; return; }
  }
  voice = vs[0] || null;
}

export const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function playFile(path) {
  return new Promise((resolve) => {
    let a = cache.get(path);
    if (!a) { a = new Audio(path); cache.set(path, a); }
    a.currentTime = 0;
    a.onended = resolve;
    a.onerror = resolve;
    a.play().catch(resolve);
  });
}

function tts(text, rate = 0.82) {
  return new Promise((resolve) => {
    if (!('speechSynthesis' in window)) return resolve();
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    if (voice) u.voice = voice;
    u.lang = voice?.lang || 'en-GB';
    u.rate = rate;
    u.onend = resolve;
    u.onerror = resolve;
    speechSynthesis.speak(u);
    setTimeout(resolve, 4000);
  });
}

/** kind: 'word' | 'letter' (letter name) | 'sound' (letter team sound, id = team.full) */
export function say(text, kind = 'word', id = null) {
  const file = kind === 'sound' ? `sound-${slug(id)}` : kind === 'letter' ? `letter-${slug(text)}` : `word-${slug(text)}`;
  if (manifest?.files?.includes(file)) return playFile(`./audio/${file}.mp3`);
  return tts(text, kind === 'word' ? 0.8 : 0.75);
}

/* Speech recognition for the "say it" exercise. Safari exposes the webkit prefix. */
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
export const canListen = !!SR;

export function listen() {
  return new Promise((resolve, reject) => {
    if (!SR) return reject(new Error('unsupported'));
    const r = new SR();
    r.lang = 'en-GB';
    r.interimResults = false;
    r.maxAlternatives = 5;
    let done = false;
    r.onresult = (e) => { done = true; resolve([...e.results[0]].map((x) => x.transcript.toLowerCase().trim())); };
    r.onerror = (e) => { if (!done) reject(new Error(e.error)); };
    r.onend = () => { if (!done) resolve([]); };
    r.start();
    setTimeout(() => { try { r.stop(); } catch { /* already stopped */ } }, 5000);
  });
}

/* Tiny feedback tones (no files needed). */
let ctx;
export function tone(kind) {
  try {
    ctx ||= new (window.AudioContext || window.webkitAudioContext)();
    const notes = kind === 'ok' ? [660, 880] : kind === 'win' ? [523, 659, 784, 1047] : [220, 196];
    notes.forEach((f, i) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = kind === 'bad' ? 'triangle' : 'sine';
      o.frequency.value = f;
      const t = ctx.currentTime + i * 0.09;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.18, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
      o.connect(g).connect(ctx.destination);
      o.start(t); o.stop(t + 0.25);
    });
  } catch { /* audio not available */ }
}
