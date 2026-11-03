// Builds randomized exercise sessions.
//
// Guarantees, checked by tests/random-check.html:
//  - no (team, exercise type) pair repeats inside a session while unused pairs remain;
//  - no word is the subject of two questions in one session;
//  - the same exercise type never comes twice in a row, the same team never twice in a row
//    (when the session has more than one team);
//  - the right answer lands on each button position about equally often and never three times running;
//  - distractors never contain the target rule (so there is always exactly one right answer).

import { int, pick, shuffle, sample, weighted } from './rng.js';

const lc = (s) => s.toLowerCase();
const has = (team, word) => team.re.test(lc(word));
const sameSound = (a, b) => a.snd.some((s) => b.snd.includes(s));

const PHONICS_TYPES = ['findSound', 'listen', 'teamWord', 'spell', 'missing', 'odd', 'build', 'hearPick', 'magic', 'say'];
const ALPHA_TYPES = ['hearName', 'nameRu', 'case', 'firstSound', 'letterPic'];

export const TYPE_NAMES = {
  findSound: 'Найди звук', listen: 'Послушай', teamWord: 'Найди слово', spell: 'Как пишется?',
  missing: 'Вставь буквы', odd: 'Лишнее слово', build: 'Собери слово', hearPick: 'Новое слово',
  magic: 'Magic e', say: 'Скажи вслух', hearName: 'Имя буквы', nameRu: 'Как называется?',
  case: 'Большая и маленькая', firstSound: 'Первая буква', letterPic: 'Картинка к букве',
};

/* ---------- small helpers ---------- */

/** A word not yet asked about; words already shown as wrong options are used last. */
function freshWord(list, ctx) {
  const free = list.filter((w) => !ctx.used.has(lc(w.w)));
  const unseen = free.filter((w) => !ctx.shown.has(lc(w.w)));
  return unseen.length ? pick(unseen) : free.length ? pick(free) : null;
}

function wordsOf(t, { emoji = false, includeRead = false } = {}) {
  let ws = t.words.filter((w) => !emoji || w.e);
  if (includeRead) ws = ws.concat(t.read.map((w) => ({ w, e: '', team: t.full })));
  return ws;
}

function distractorTeams(target, pool, n, ok) {
  const cands = pool.filter((d) => d.full !== target.full && d.label !== target.label && ok(d));
  return sample(cands, n);
}

/** Replace the rule's letters in a word with another spelling. */
function respell(word, team, replacement) {
  const re = new RegExp(team.re.source, 'i');
  return word.replace(re, replacement);
}

function choice(q, correct, wrong) {
  const opts = [correct, ...wrong];
  const seen = new Set();
  q.options = opts.filter((o) => { const k = lc(o.text || o.emoji || o.id); if (seen.has(k)) return false; seen.add(k); return true; });
  q.answer = correct.id;
  return q.options.length >= 2 ? q : null;
}

/* ---------- phonics generators ---------- */

const G = {};

G.findSound = (t, ctx) => {
  const w = freshWord(wordsOf(t, { emoji: true }), ctx);
  if (!w) return null;
  const ds = distractorTeams(t, ctx.pool, 2, (d) => !has(d, w.w));
  if (ds.length < 2) return null;
  return choice(
    { type: 'findSound', word: w.w, prompt: 'Какое буквосочетание в этом слове?', show: { kind: 'emoji', emoji: w.e, ru: w.ru, word: w.w, hideWord: true }, speak: { text: w.w } },
    { id: t.full, text: t.label }, ds.map((d) => ({ id: d.full, text: d.label })),
  );
};

G.listen = (t, ctx) => {
  const w = freshWord(wordsOf(t, { includeRead: true }), ctx);
  if (!w) return null;
  // Teams that sound the same can't be told apart by ear, so they are never distractors here.
  const ds = distractorTeams(t, ctx.pool, 2, (d) => !has(d, w.w) && !sameSound(d, t));
  if (ds.length < 2) return null;
  return choice(
    { type: 'listen', word: w.w, prompt: 'Послушай слово. Какой звук ты слышишь?', show: { kind: 'audio' }, speak: { text: w.w }, autoplay: true },
    { id: t.full, text: t.label }, ds.map((d) => ({ id: d.full, text: d.label })),
  );
};

G.teamWord = (t, ctx) => {
  const w = freshWord(wordsOf(t, { includeRead: true }), ctx);
  if (!w) return null;
  const others = ctx.pool.filter((d) => d.full !== t.full).flatMap((d) => wordsOf(d, { includeRead: true }))
    .filter((x) => !has(t, x.w) && lc(x.w) !== lc(w.w));
  if (others.length < 3) return null;
  const wrong = sample(others, 3);
  wrong.forEach((x) => ctx.shown.add(lc(x.w)));
  return choice(
    { type: 'teamWord', word: w.w, prompt: `Найди слово, где есть ${t.label}`, show: { kind: 'big', text: t.label, sound: t.sound } },
    { id: 'ok', text: w.w, speak: w.w }, wrong.map((x, i) => ({ id: 'x' + i, text: x.w, speak: x.w })),
  );
};

G.spell = (t, ctx) => {
  if (!t.alt.length) return null;
  const w = freshWord(wordsOf(t, { emoji: true }), ctx);
  if (!w) return null;
  const real = lc(w.w);
  const wrong = [...new Set(t.alt.map((a) => lc(respell(w.w, t, a))))].filter((x) => x !== real);
  if (wrong.length < 2) return null;
  return choice(
    { type: 'spell', word: w.w, prompt: 'Как правильно написать?', show: { kind: 'emoji', emoji: w.e, ru: w.ru, hideWord: true }, speak: { text: w.w } },
    { id: 'ok', text: w.w }, sample(wrong, 2).map((x, i) => ({ id: 'x' + i, text: x })),
  );
};

G.missing = (t, ctx) => {
  if (!t.literal && !(t.kind === 'phonics' && /^[a-z]+$/.test(t.label))) return null;
  const cands = wordsOf(t, { emoji: true }).filter((w) => {
    const m = lc(w.w).match(t.re);
    return m && m[0] === t.label;
  });
  const w = freshWord(cands, ctx);
  if (!w) return null;
  const m = lc(w.w).match(t.re);
  const before = w.w.slice(0, m.index), after = w.w.slice(m.index + m[0].length);
  const ds = distractorTeams(t, ctx.pool, 2, (d) => d.literal && !has(d, w.w) && lc(before + d.label + after) !== lc(w.w));
  if (ds.length < 2) return null;
  return choice(
    { type: 'missing', word: w.w, prompt: 'Каких букв не хватает?', show: { kind: 'blank', emoji: w.e, ru: w.ru, before, after, size: t.label.length }, speak: { text: w.w } },
    { id: t.full, text: t.label }, ds.map((d) => ({ id: d.full, text: d.label })),
  );
};

G.odd = (t, ctx) => {
  if (t.snd.length > 1) return null;
  const mine = wordsOf(t, { includeRead: true }).filter((w) => !ctx.used.has(lc(w.w)));
  if (mine.length < 3) return null;
  const three = sample(mine, 3);
  const oddTeams = ctx.pool.filter((d) => d.full !== t.full && !sameSound(d, t));
  const oddWords = shuffle(oddTeams).flatMap((d) => wordsOf(d, { includeRead: true }).map((w) => ({ w, d })))
    .filter(({ w, d }) => !has(t, w.w) && !ctx.used.has(lc(w.w)) && three.every((x) => !has(d, x.w)));
  if (!oddWords.length) return null;
  const { w: odd } = pick(oddWords);
  three.forEach((x) => ctx.used.add(lc(x.w)));
  return choice(
    { type: 'odd', word: odd.w, prompt: 'Какое слово лишнее? У него другой звук.', show: { kind: 'none' } },
    { id: 'ok', text: odd.w, speak: odd.w }, three.map((x, i) => ({ id: 'x' + i, text: x.w, speak: x.w })),
  );
};

function segment(word, pool) {
  if (word.length > 8 || /[^a-z]/i.test(word)) return null;
  const labels = pool.filter((d) => d.literal && d.label.length > 1).map((d) => d.label).sort((a, b) => b.length - a.length);
  const out = [];
  let i = 0;
  const w = lc(word);
  while (i < w.length) {
    const hit = labels.find((l) => w.startsWith(l, i));
    out.push(hit || w[i]);
    i += hit ? hit.length : 1;
  }
  return out.length >= 2 && out.length <= 6 ? out : null;
}

G.build = (t, ctx) => {
  const cands = wordsOf(t, { emoji: true });
  const w = freshWord(cands, ctx);
  if (!w) return null;
  const seg = (lc(w.w) === lc(t.key?.w || '') && t.key.seg) || segment(w.w, ctx.pool);
  if (!seg) return null;
  const extra = shuffle([...t.alt.filter((a) => /^[a-z]{1,3}$/.test(a)), ...ctx.pool.filter((d) => d.literal).map((d) => d.label)])
    .filter((x) => !seg.includes(x)).slice(0, seg.length > 4 ? 1 : 2);
  const tiles = shuffle([...seg, ...extra]).map((text, i) => ({ id: 't' + i, text }));
  return {
    type: 'build', word: w.w, mode: 'build', prompt: 'Собери слово из кусочков',
    show: { kind: 'emoji', emoji: w.e, ru: w.ru, hideWord: true }, speak: { text: w.w }, tiles, answerText: lc(w.w), slots: seg.length,
  };
};

G.hearPick = (t, ctx) => {
  if (!t.literal && !t.split) return null;
  const w = freshWord(t.read.map((x) => ({ w: x })), ctx) || freshWord(wordsOf(t), ctx);
  if (!w) return null;
  // Wrong options swap the rule for one that *sounds* different, so the ear can decide.
  const swaps = ctx.pool.filter((d) => d.literal && d.full !== t.full && !sameSound(d, t) && !has(d, w.w) && d.label.length <= 3);
  const wrong = [...new Set(shuffle(swaps).map((d) => lc(respell(w.w, t, t.split ? d.label + '$1' : d.label))))]
    .filter((x) => x !== lc(w.w) && /^[a-z]+$/.test(x));
  if (wrong.length < 2) return null;
  return choice(
    { type: 'hearPick', word: w.w, prompt: 'Послушай и найди это слово', show: { kind: 'audio' }, speak: { text: w.w }, autoplay: true },
    { id: 'ok', text: w.w }, wrong.slice(0, 2).map((x, i) => ({ id: 'x' + i, text: x })),
  );
};

G.magic = (t, ctx) => {
  if (!t.magic?.length) return null;
  const pairs = t.magic.filter(([a, b]) => !ctx.used.has(a) && !ctx.used.has(b));
  if (!pairs.length) return null;
  const [short, long] = pick(pairs);
  const target = int(2) ? long : short;
  ctx.used.add(short); ctx.used.add(long);
  return choice(
    { type: 'magic', word: target, prompt: 'Послушай. Какое слово ты слышишь?', sub: 'Magic e заставляет гласную сказать своё имя.', show: { kind: 'audio' }, speak: { text: target }, autoplay: true },
    { id: 'ok', text: target }, [{ id: 'x0', text: target === long ? short : long }],
  );
};

G.say = (t, ctx) => {
  if (!ctx.canSay) return null;
  const w = freshWord(wordsOf(t, { includeRead: true }), ctx);
  if (!w) return null;
  return { type: 'say', word: w.w, mode: 'say', prompt: 'Прочитай слово вслух', show: { kind: 'word', text: w.w, mark: t.full }, speak: { text: w.w }, answerText: lc(w.w) };
};

/* ---------- alphabet generators ---------- */

const letterOpt = (d) => ({ id: d.full, text: d.label + d.lower });

G.hearName = (t, ctx) => {
  const ds = distractorTeams(t, ctx.pool, 3, () => true);
  if (ds.length < 2) return null;
  return choice(
    { type: 'hearName', letter: t.label, prompt: 'Послушай название. Какая это буква?', show: { kind: 'audio' }, speak: { text: t.name, letter: t.label }, autoplay: true },
    letterOpt(t), ds.map(letterOpt),
  );
};

G.nameRu = (t, ctx) => {
  const ds = distractorTeams(t, ctx.pool, 3, (d) => d.ru !== t.ru);
  if (ds.length < 2) return null;
  return choice(
    { type: 'nameRu', letter: t.label, prompt: 'Как называется эта буква?', show: { kind: 'big', text: t.label + t.lower } },
    { id: t.full, text: t.ru, speak: t.name, letter: t.label }, ds.map((d) => ({ id: d.full, text: d.ru, speak: d.name, letter: d.label })),
  );
};

G.case = (t, ctx) => {
  const up = int(2) === 0;
  const ds = distractorTeams(t, ctx.pool, 3, () => true);
  if (ds.length < 2) return null;
  const f = (d) => ({ id: d.full, text: up ? d.lower : d.label });
  return choice(
    { type: 'case', letter: t.label, prompt: up ? 'Найди маленькую букву' : 'Найди большую букву', show: { kind: 'big', text: up ? t.label : t.lower } },
    f(t), ds.map(f),
  );
};

G.firstSound = (t, ctx) => {
  if (t.end) return null;
  const w = freshWord(t.words, ctx);
  if (!w) return null;
  const ds = distractorTeams(t, ctx.pool, 3, (d) => !sameSound(d, t) && !has(d, w.w));
  if (ds.length < 2) return null;
  return choice(
    { type: 'firstSound', word: w.w, prompt: 'С какой буквы начинается это слово по-английски?', show: { kind: 'emoji', emoji: w.e, ru: w.ru, word: w.w, hideWord: true }, speak: { text: w.w } },
    letterOpt(t), ds.map(letterOpt),
  );
};

G.letterPic = (t, ctx) => {
  if (t.end) return null;
  const w = freshWord(t.words, ctx);
  if (!w) return null;
  const others = ctx.pool.filter((d) => d.full !== t.full && !d.end && !sameSound(d, t))
    .flatMap((d) => d.words).filter((x) => !has(t, x.w));
  if (others.length < 2) return null;
  return choice(
    { type: 'letterPic', word: w.w, confirm: true, prompt: `Какое слово по-английски начинается на ${t.label}?`, sub: 'Нажми на картинку — услышишь, как она называется по-английски. Потом нажми «Проверить».', show: { kind: 'big', text: t.label + t.lower } },
    { id: 'ok', emoji: w.e, ru: w.ru, text: '', speak: w.w, label: w.ru }, sample(others, 3).map((x, i) => ({ id: 'x' + i, emoji: x.e, ru: x.ru, text: '', speak: x.w, label: x.ru })),
  );
};

/* ---------- session builder ---------- */

export function typesFor(team) {
  return team.kind === 'alphabet' ? ALPHA_TYPES : PHONICS_TYPES;
}

function teamWeight(team, stats) {
  const s = stats[team.full];
  if (!s || !s.n) return 3;
  const acc = s.c / s.n;
  const age = (Date.now() - (s.last || 0)) / 86400000;
  return 1 + (1 - acc) * 4 + Math.min(age, 7) / 3;
}

function generate(team, type, ctx) {
  const before = new Set(ctx.used);
  const q = G[type](team, ctx);
  if (!q) { ctx.used.clear(); before.forEach((x) => ctx.used.add(x)); return null; }
  if (q.word) ctx.used.add(lc(q.word));
  q.team = team.full;
  q.key = `${team.full}|${type}`;
  return q;
}

/** Order so that neighbours never share a type, and never share a team when avoidable. */
function arrange(qs) {
  const teams = new Set(qs.map((q) => q.team)).size;
  for (let attempt = 0; attempt < 200; attempt++) {
    const left = shuffle(qs);
    const out = [];
    while (left.length) {
      const prev = out[out.length - 1];
      const counts = {};
      left.forEach((q) => (counts[q.type] = (counts[q.type] || 0) + 1));
      // A type that fills more than half of what's left must go now, or it can't be spread out.
      const crit = Object.keys(counts).find((ty) => counts[ty] * 2 > left.length);
      let cands = left.filter((q) => (!prev || q.type !== prev.type) && (!crit || q.type === crit));
      const spread = cands.filter((q) => !prev || teams < 2 || q.team !== prev.team);
      if (spread.length) cands = spread;
      else if (attempt < 100) cands = [];
      if (!cands.length) break;
      const q = pick(cands);
      out.push(left.splice(left.indexOf(q), 1)[0]);
    }
    if (out.length === qs.length) return out;
  }
  return shuffle(qs);
}

/** Shuffle options so the right answer never sits in the same slot three times running. */
function placeAnswers(qs) {
  // History per layout: a 3-button row and a 2×2 grid are different places on screen,
  // and mixing them would push answers toward the slot only the grid has.
  const hists = {};
  for (const q of qs) {
    if (!q.options) continue;
    const hist = (hists[q.options.length] ||= []);
    let opts;
    for (let i = 0; i < 20; i++) {
      opts = shuffle(q.options);
      const pos = opts.findIndex((o) => o.id === q.answer);
      const run = hist.length >= 2 && hist[hist.length - 1] === pos && hist[hist.length - 2] === pos;
      if (!run) break;
    }
    q.options = opts;
    hist.push(opts.findIndex((o) => o.id === q.answer));
  }
  return qs;
}

/**
 * @param focus   teams this session is about
 * @param pool    teams the student has met (distractors come from here)
 * @param count   number of questions
 * @param stats   per-team stats {c, n, last}
 * @param recent  question keys seen in the last sessions (avoided when possible)
 */
export function buildSession({ focus, pool, count, stats = {}, recent = [], canSay = false }) {
  const ctx = { pool, used: new Set(), shown: new Set(), canSay };
  const recentSet = new Set(recent);
  const usedKeys = new Set();
  const out = [];

  // Keep the mix varied: no exercise type takes much more than its share of the session.
  const cap = Math.ceil(count / 4) + 1;
  const perType = {};
  const tryMake = (team, types) => {
    const roomy = types.filter((ty) => (perType[ty] || 0) < cap);
    for (const type of shuffle(roomy.length ? roomy : types)) {
      const key = `${team.full}|${type}`;
      if (usedKeys.has(key) || (perType[type] || 0) >= cap) continue;
      const q = generate(team, type, ctx);
      if (q) { usedKeys.add(key); perType[type] = (perType[type] || 0) + 1; out.push(q); return true; }
    }
    return false;
  };

  // 1) every focus team at least once, fresh types first
  for (const team of shuffle(focus)) {
    if (out.length >= count) break;
    const types = typesFor(team);
    const fresh = types.filter((ty) => !recentSet.has(`${team.full}|${ty}`));
    tryMake(team, fresh) || tryMake(team, types);
  }

  // 2) fill up, weighting weaker teams, avoiding recently seen pairs while possible
  let guard = 0;
  while (out.length < count && guard++ < count * 30) {
    const team = weighted(focus, (t) => teamWeight(t, stats));
    const types = typesFor(team);
    const fresh = types.filter((ty) => !recentSet.has(`${team.full}|${ty}`) && !usedKeys.has(`${team.full}|${ty}`));
    if (!(fresh.length && tryMake(team, fresh)) && guard > count * 10) tryMake(team, types);
  }

  return placeAnswers(arrange(out));
}

/** One extra question about a team the student just got wrong (different exercise type). */
export function retryQuestion(team, avoidType, pool, usedWords, canSay = false) {
  const ctx = { pool, used: new Set(usedWords), shown: new Set(), canSay };
  for (const type of shuffle(typesFor(team).filter((t) => t !== avoidType && t !== 'say'))) {
    const q = generate(team, type, ctx);
    if (q) return placeAnswers([q])[0];
  }
  return null;
}
