// Cryptographic randomness: Math.random is fine for games, but here the point
// is that a student can't learn "the third button is usually right".

const buf = new Uint32Array(64);
let pos = buf.length;

function u32() {
  if (pos >= buf.length) { crypto.getRandomValues(buf); pos = 0; }
  return buf[pos++];
}

/** Uniform integer in [0, n) without modulo bias. */
export function int(n) {
  if (n <= 1) return 0;
  const limit = Math.floor(0x100000000 / n) * n;
  let x;
  do { x = u32(); } while (x >= limit);
  return x % n;
}

export function pick(arr) { return arr[int(arr.length)]; }

export function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = int(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function sample(arr, k) { return shuffle(arr).slice(0, k); }

/** Weighted pick; weights are non-negative numbers. */
export function weighted(items, weightOf) {
  const ws = items.map(weightOf);
  const total = ws.reduce((s, w) => s + w, 0);
  if (total <= 0) return pick(items);
  let r = (u32() / 0x100000000) * total;
  for (let i = 0; i < items.length; i++) { r -= ws[i]; if (r < 0) return items[i]; }
  return items[items.length - 1];
}
