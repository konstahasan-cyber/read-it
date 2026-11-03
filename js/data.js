// Loads topic packs from /topics and normalises them into one course.
// To add a topic: drop a JSON file into /topics and list it in topics/index.json.

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function normTeam(pack, id, raw) {
  const t = { ...raw, id, pack: pack.id, kind: pack.kind, full: `${pack.id}:${id}` };
  if (pack.kind === 'alphabet') {
    t.label = id;
    t.lower = id.toLowerCase();
    t.re = new RegExp('^' + esc(t.lower), 'i');
    t.snd = [raw.sound];
  } else {
    t.label = raw.label || id;
    t.re = new RegExp(raw.pattern || esc(t.label), 'i');
    t.literal = !raw.split && !/\s/.test(t.label);
    t.snd = raw.snd || [raw.sound];
  }
  t.words = (raw.words || []).map((w) => ({ ...w, team: t.full }));
  t.read = raw.read || [];
  t.alt = raw.alt || [];
  return t;
}

/**
 * Split a unit into ~5-minute steps: two rules each (a lone leftover joins the last step).
 * A step = learn cards for its rules + 8 exercises.
 */
function chunk(ids) {
  const out = [];
  for (let i = 0; i < ids.length; i += 2) out.push(ids.slice(i, i + 2));
  if (out.length > 1 && out[out.length - 1].length === 1) out[out.length - 2].push(...out.pop());
  return out;
}

export async function loadCourse(base = './topics/') {
  const index = await fetch(base + 'index.json', { cache: 'no-cache' }).then((r) => r.json());
  const packs = await Promise.all(index.packs.map((p) => fetch(base + p.file, { cache: 'no-cache' }).then((r) => r.json())));
  // Russian translations, shared by all packs: { "fish": "рыба", ... }
  const dict = index.dictionary ? await fetch(base + index.dictionary, { cache: 'no-cache' }).then((r) => r.json()).catch(() => ({})) : {};
  const course = { packs: [], units: [], teams: new Map(), dict, ru: (w) => dict[String(w).toLowerCase()] || '' };

  for (const raw of packs) {
    const pack = { id: raw.id, kind: raw.kind, title: raw.title, subtitle: raw.subtitle, units: [] };
    for (const [id, t] of Object.entries(raw.teams)) {
      const team = normTeam(raw, id, t);
      team.words.forEach((w) => (w.ru = course.ru(w.w)));
      course.teams.set(`${raw.id}:${id}`, team);
    }
    const byId = {};
    for (const u of raw.units) {
      const unit = { id: `${raw.id}:${u.id}`, short: u.id, pack: raw.id, title: u.title, final: !!u.final };
      if (u.review) {
        unit.review = true;
        unit.teams = [...new Set(u.review.flatMap((r) => byId[r].teams))];
      } else {
        unit.teams = u.teams.map((t) => `${raw.id}:${t}`);
        unit.steps = chunk(unit.teams);
      }
      byId[u.id] = unit;
      pack.units.push(unit);
      course.units.push(unit);
    }
    course.packs.push(pack);
  }
  return course;
}

/** Teams introduced up to and including this unit — the pool for distractors. */
export function poolFor(course, unit, step = null) {
  const pack = course.packs.find((p) => p.id === unit.pack);
  const ids = new Set();
  for (const u of pack.units) {
    if (u.id === unit.id && step != null) { u.steps.slice(0, step + 1).flat().forEach((t) => ids.add(t)); break; }
    u.teams.forEach((t) => ids.add(t));
    if (u.id === unit.id) break;
  }
  return [...ids].map((id) => course.teams.get(id));
}

/** Every team in a pack (used when the pool so far is too small to make distractors). */
export function packTeams(course, packId) {
  return [...course.teams.values()].filter((t) => t.pack === packId);
}
