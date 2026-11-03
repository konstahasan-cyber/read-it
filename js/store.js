// Student progress: stored on the device, mirrored to the server by sync.js.

const KEY = 'readit.state.v1';

export const DAILY_GOAL = 30; // XP per day for the "goal reached" ring
export const PASS = 0.8;      // test score needed to open the next unit (book: 23/28 ≈ 82%)

export function today(d = new Date()) {
  const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return z.toISOString().slice(0, 10);
}

function dayDiff(a, b) { return Math.round((new Date(b) - new Date(a)) / 86400000); }

function blank() {
  return {
    v: 1, student: null, xp: 0,
    streak: { count: 0, best: 0, last: null, freezes: 1 },
    days: {}, units: {}, teams: {}, recent: {}, badges: [], history: [], done: {},
    settings: { sound: true, say: true },
  };
}

let state = load();
const listeners = new Set();

function load() {
  try { return { ...blank(), ...JSON.parse(localStorage.getItem(KEY)) }; } catch { return blank(); }
}

export function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* storage full or blocked */ }
  listeners.forEach((f) => f(state));
}

export const get = () => state;
export const onChange = (f) => listeners.add(f);
export function replace(next) { state = { ...blank(), ...next }; save(); }

/** Streak that is still alive today (yesterday counts until the day ends). */
export function liveStreak() {
  const s = state.streak;
  if (!s.last) return 0;
  const gap = dayDiff(s.last, today());
  return gap <= 1 ? s.count : 0;
}

function bumpStreak() {
  const s = state.streak, t = today();
  if (s.last === t) return false;
  const gap = s.last ? dayDiff(s.last, t) : 99;
  if (gap === 1) s.count += 1;
  else if (gap === 2 && s.freezes > 0) { s.freezes -= 1; s.count += 1; } // one missed day forgiven
  else s.count = 1;
  s.last = t;
  s.best = Math.max(s.best, s.count);
  if (s.count % 7 === 0) s.freezes = Math.min(2, s.freezes + 1);
  return true;
}

export function recordAnswer(teamId, ok) {
  const t = (state.teams[teamId] ||= { c: 0, n: 0, last: 0 });
  t.n += 1; if (ok) t.c += 1; t.last = Date.now();
}

export function markLearned(unitId) {
  const u = (state.units[unitId] ||= {});
  u.learned = true;
  save();
}

const BADGES = [
  { id: 'first', title: 'Первый шаг', test: (s) => s.history.length >= 1 },
  { id: 'streak3', title: '3 дня подряд', test: (s) => s.streak.best >= 3 },
  { id: 'streak7', title: 'Неделя без пропусков', test: (s) => s.streak.best >= 7 },
  { id: 'streak30', title: 'Месяц подряд', test: (s) => s.streak.best >= 30 },
  { id: 'xp100', title: '100 очков', test: (s) => s.xp >= 100 },
  { id: 'xp500', title: '500 очков', test: (s) => s.xp >= 500 },
  { id: 'perfect', title: 'Без единой ошибки', test: (s) => s.history.some((h) => h.total >= 8 && h.score === h.total) },
  { id: 'abc', title: 'Весь алфавит', test: (s) => s.units['abc:ar2']?.passed },
  { id: 'final', title: 'Super Reader', test: (s) => s.units['phonics:final']?.passed },
];
export const BADGE_LIST = BADGES;

/**
 * Finish a session. Returns what changed so the UI can celebrate it.
 * result: { unit, mode, score, total, mistakes:[{team, type, word}], seconds, assignment }
 */
export function finishSession(result) {
  const pct = result.total ? result.score / result.total : 0;
  const xp = Math.round(result.score * (result.mode === 'test' ? 2 : 1.5)) + (pct === 1 ? 5 : 0);
  const t = today();
  const before = state.days[t] || 0;
  state.xp += xp;
  state.days[t] = before + xp;
  const streakUp = bumpStreak();

  let unlocked = false, stars = 0;
  if (result.unit) {
    const u = (state.units[result.unit] ||= {});
    u.attempts = (u.attempts || 0) + 1;
    if (result.mode === 'test') {
      u.best = Math.max(u.best || 0, pct);
      stars = pct >= 0.95 ? 3 : pct >= 0.88 ? 2 : pct >= PASS ? 1 : 0;
      u.stars = Math.max(u.stars || 0, stars);
      if (pct >= PASS && !u.passed) { u.passed = true; unlocked = true; }
    } else {
      u.practiced = (u.practiced || 0) + 1;
      if (result.step != null) u.steps = Math.max(u.steps || 0, result.step + 1);
    }
  }
  if (result.assignment) state.done[result.assignment] = Date.now();

  const keys = result.keys || [];
  const rk = result.recentKey || result.unit;
  if (rk) state.recent[rk] = [...keys, ...(state.recent[rk] || [])].slice(0, 40);

  const entry = { at: Date.now(), day: t, unit: result.unit, step: result.step ?? null, mode: result.mode, score: result.score, total: result.total, xp, seconds: result.seconds, mistakes: result.mistakes, assignment: result.assignment || null };
  state.history = [entry, ...state.history].slice(0, 200);

  const had = new Set(state.badges);
  const newBadges = BADGES.filter((b) => !had.has(b.id) && b.test(state));
  state.badges.push(...newBadges.map((b) => b.id));

  save();
  return { entry, xp, pct, stars, unlocked, streakUp, streak: state.streak.count, goalReached: before < DAILY_GOAL && state.days[t] >= DAILY_GOAL, newBadges };
}

export function isUnlocked(course, unit) {
  const pack = course.packs.find((p) => p.id === unit.pack);
  const i = pack.units.findIndex((u) => u.id === unit.id);
  if (i === 0) return true;
  // Phonics opens straight away too: the alphabet and letter teams can run side by side.
  return !!state.units[pack.units[i - 1].id]?.passed;
}

/** Teams the student has seen: units unlocked so far. */
export function learnedTeams(course) {
  const ids = new Set();
  for (const u of course.units) {
    const us = state.units[u.id];
    if (!us) continue;
    if (us.passed || us.learned || (us.practiced && !us.steps)) u.teams.forEach((t) => ids.add(t));
    else if (us.steps && u.steps) u.steps.slice(0, us.steps).flat().forEach((t) => ids.add(t));
  }
  return [...ids].map((id) => course.teams.get(id));
}
