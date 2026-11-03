import { loadCourse, poolFor, packTeams } from './data.js';
import { buildSession, retryQuestion } from './engine.js';
import * as S from './store.js';
import * as sync from './sync.js';
import { initSpeech, say, listen, canListen, tone } from './speech.js';
import { shuffle, int } from './rng.js';
import { icon } from './icons.js';

const root = document.getElementById('root');
const tabs = document.getElementById('tabs');
let course;
let tasks = [];

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const st = () => S.get();
const code = () => st().student?.code || null;

/* ---------- boot ---------- */

async function boot() {
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
  course = await loadCourse();
  initSpeech();

  const params = new URLSearchParams(location.search);
  const linkCode = params.get('s');
  S.onChange((s) => { sync.pushProgress(s.student?.code, s); updateBadge(); });

  if (!st().student || (linkCode && linkCode !== code())) return welcome(linkCode);
  start();
}

function start() {
  tabs.classList.remove('hidden');
  window.addEventListener('hashchange', route);
  window.addEventListener('online', () => sync.flush(code()));
  route();
  refreshTasks();
  const day = S.today();
  if (localStorage.getItem('readit.opened') !== day) {
    localStorage.setItem('readit.opened', day);
    sync.logEvent(code(), 'open', { streak: S.liveStreak(), xp: st().xp });
  }
  sync.flush(code());
  updateBadge();
}

async function refreshTasks() {
  tasks = (await sync.assignments(code())).filter((a) => !st().done[a.id]);
  if (location.hash === '' || location.hash === '#/') home();
}

function updateBadge() {
  if (!('setAppBadge' in navigator)) return;
  const left = (st().days[S.today()] || 0) < S.DAILY_GOAL;
  (left ? navigator.setAppBadge(1) : navigator.clearAppBadge()).catch(() => {});
}

function route() {
  const h = location.hash || '#/';
  tabs.querySelectorAll('a').forEach((a) => a.setAttribute('aria-current', a.getAttribute('href') === h ? 'page' : 'false'));
  if (h === '#/me') me(); else if (h === '#/dict') dictionary(); else home();
  window.scrollTo(0, 0);
}

let toastTimer;
function toast(text) {
  const el = document.getElementById('toast');
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

/* ---------- welcome ---------- */

async function welcome(linkCode) {
  tabs.classList.add('hidden');
  let joined = null, err = '';
  if (linkCode && sync.online) {
    try { joined = await sync.join(linkCode); if (!joined) err = 'Ссылка не подошла. Попроси у учителя новую.'; }
    catch { err = 'Нет связи с сервером. Проверь интернет и открой ссылку ещё раз.'; }
  }
  root.innerHTML = `
    <section class="welcome">
      <div class="stack" aria-hidden="true"><span class="tile">sh</span><span class="tile">ee</span><span class="tile">igh</span></div>
      <h1>${joined ? `Привет, ${esc(joined.name)}!` : 'Учимся читать по-английски'}</h1>
      <p class="muted">Буквы, их названия и звуки. Немного каждый день — и ты будешь читать новые слова сама.</p>
      ${joined ? '' : `
        <div class="field"><label for="nm">Как тебя зовут?</label><input id="nm" autocomplete="given-name" maxlength="30" placeholder="Имя"></div>
        ${sync.online ? '<p class="muted" style="font-size:15px">Чтобы учитель видел твои успехи, открой приложение по ссылке от учителя.</p>' : ''}`}
      ${err ? `<p class="error">${esc(err)}</p>` : ''}
      <button class="btn go" id="go">Начать</button>
      <a class="link" href="admin.html">Я учитель</a>
    </section>`;
  document.getElementById('go').onclick = async () => {
    const name = joined ? joined.name : document.getElementById('nm').value.trim();
    if (!name) { document.getElementById('nm').focus(); return; }
    const student = { name, code: joined ? linkCode : null };
    if (joined) {
      const saved = await sync.restore(linkCode).catch(() => null);
      if (saved && saved.v) S.replace({ ...saved, student });
      else S.replace({ ...(st().student?.code ? {} : st()), student });
      history.replaceState(null, '', location.pathname + '#/');
    } else {
      S.replace({ ...st(), student });
    }
    start();
  };
}

/* ---------- home ---------- */

function stars(n) {
  return [0, 1, 2].map((i) => (i < n ? icon.star : `<span class="off">${icon.star}</span>`)).join('');
}

function unitTitle(id) { return course.units.find((u) => u.id === id)?.title || id; }
const MODE_NAMES = { practice: 'тренировка', test: 'тест', review: 'повторение', learn: 'изучение' };

function home() {
  const s = st();
  const streak = S.liveStreak();
  const todayXp = s.days[S.today()] || 0;
  const goal = Math.min(1, todayXp / S.DAILY_GOAL);
  const learned = S.learnedTeams(course);
  const doneToday = s.streak.last === S.today();
  const C = 2 * Math.PI * 27;

  let html = `
    <header class="top">
      <div class="hello"><h1>${esc(s.student.name)}</h1><p class="muted">${doneToday ? 'Сегодня ты уже позанималась' : 'Пора немного позаниматься'}</p></div>
      <span class="chip flame ${streak ? '' : 'cold'}" title="Дней подряд">${icon.flame} ${streak}</span>
      <span class="chip xp" title="Очки">${icon.star} ${s.xp}</span>
    </header>`;

  for (const t of tasks) {
    html += `<section class="task">
      <h2>Задание от учителя</h2>
      <p><b>${esc(unitTitle(t.unit))}</b> — ${MODE_NAMES[t.mode] || t.mode}${t.due ? `, до ${new Date(t.due).toLocaleDateString('ru', { day: 'numeric', month: 'long' })}` : ''}</p>
      ${t.note ? `<p class="note">${esc(t.note)}</p>` : ''}
      <button class="btn warm" data-task="${esc(t.id)}">Выполнить</button>
    </section>`;
  }

  html += `<section class="today">
      <svg class="ring" viewBox="0 0 64 64" aria-hidden="true"><circle class="bg" cx="32" cy="32" r="27"/><circle class="fg" cx="32" cy="32" r="27" transform="rotate(-90 32 32)" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - goal)}"/></svg>
      <div><h2>${goal >= 1 ? 'Цель на сегодня выполнена' : `Цель дня: ${todayXp} из ${S.DAILY_GOAL} очков`}</h2>
      <p class="muted">${!doneToday && streak ? `Позанимайся сегодня, чтобы серия из ${streak} ${plural(streak, 'дня', 'дней', 'дней')} не сгорела.` : 'Повторение смешивает всё, что ты уже прошла.'}</p></div>
      <button class="btn ${learned.length >= 3 ? 'go' : 'quiet'}" id="mix" ${learned.length >= 3 ? '' : 'disabled'}>${learned.length >= 3 ? 'Повторить пройденное' : 'Повторение откроется после первого урока'}</button>
    </section>`;

  for (const pack of course.packs) {
    let marked = false;
    const passed = pack.units.filter((u) => s.units[u.id]?.passed).length;
    html += `<div class="pack-title"><h2>${esc(pack.title)}</h2><span class="muted">${passed} из ${pack.units.length}</span></div><div class="route">`;
    for (const u of pack.units) {
      const us = s.units[u.id] || {};
      const open = S.isUnlocked(course, u);
      const current = open && !us.passed && !marked;
      if (current) marked = true;
      const labels = u.review ? [] : u.teams.map((id) => course.teams.get(id)).map((t) => (t.kind === 'alphabet' ? t.label + t.lower : t.label));
      html += `<div class="stop ${us.passed ? 'passed' : current ? 'current' : ''}">
        <button class="unit ${u.review ? 'review' : ''} ${u.pack === 'abc' ? 'alpha' : ''}" data-unit="${u.id}" ${open ? '' : 'disabled'}>
          <span class="head"><h3>${esc(u.title)}</h3><span class="stars" aria-label="${us.stars || 0} звезды">${stars(us.stars || 0)}</span></span>
          ${u.review ? `<span class="muted" style="font-size:15px">${u.final ? 'Всё вместе, без подсказок' : 'Смешиваем прошлые уроки'} · ${u.teams.length} правил</span>`
            : `<span class="letters">${labels.map((l) => `<span class="mini">${esc(l)}</span>`).join('')}</span>`}
          ${!open ? `<span class="lock">${icon.lock} Откроется после теста предыдущего урока</span>`
            : u.steps && !us.passed ? `<span class="step-bar" aria-label="Пройдено шагов: ${us.steps || 0} из ${u.steps.length}">${u.steps.map((_, i) => `<i class="${i < (us.steps || 0) ? 'on' : ''}"></i>`).join('')}<em>${(us.steps || 0) >= u.steps.length ? 'Осталось сдать тест' : `Шаг ${(us.steps || 0) + 1} из ${u.steps.length} · 5 минут`}</em></span>` : ''}
        </button></div>`;
    }
    html += '</div>';
  }
  root.innerHTML = html;

  root.querySelectorAll('[data-unit]').forEach((b) => (b.onclick = () => unitSheet(course.units.find((u) => u.id === b.dataset.unit))));
  root.querySelectorAll('[data-task]').forEach((b) => (b.onclick = () => runTask(tasks.find((t) => t.id === b.dataset.task))));
  const mix = document.getElementById('mix');
  if (mix) mix.onclick = dailyMix;
}

function runTask(t) {
  const unit = course.units.find((u) => u.id === t.unit);
  if (!unit) return toast('Этого урока пока нет в приложении');
  if (t.mode === 'learn') return learn(unit, t.id);
  if (t.mode === 'review') return dailyMix(t.id);
  return session({ unit, mode: t.mode, assignment: t.id });
}

function dailyMix(assignment = null) {
  const learned = S.learnedTeams(course);
  if (learned.length < 3) return toast('Сначала пройди первый урок');
  // Weakest and longest-unseen rules first, then a random handful — so nothing is forgotten.
  const stats = st().teams;
  const score = (t) => { const x = stats[t.full]; if (!x || !x.n) return 2; return (1 - x.c / x.n) * 3 + Math.min(7, (Date.now() - x.last) / 864e5) / 2; };
  const ranked = shuffle(learned).sort((a, b) => score(b) - score(a));
  const focus = [...ranked.slice(0, 4), ...shuffle(ranked.slice(4)).slice(0, 3)];
  const byPack = (t) => [...packTeams(course, t.pack).filter((x) => learned.includes(x))];
  session({ unit: null, mode: 'review', focus, poolOf: byPack, title: 'Повторение', assignment: typeof assignment === 'string' ? assignment : null });
}

/* ---------- unit sheet ---------- */

function screen(html) {
  const el = document.createElement('div');
  el.className = 'screen';
  el.innerHTML = `<div class="app">${html}</div>`;
  document.body.appendChild(el);
  document.body.style.overflow = 'hidden';
  el.close = () => { el.remove(); if (!document.querySelector('.screen')) document.body.style.overflow = ''; };
  return el;
}

function testSize(unit) { return unit.final ? 24 : unit.review ? 18 : 14; }

const teamName = (t) => (t.kind === 'alphabet' ? t.label + t.lower : t.label);

function unitSheet(unit) {
  const us = st().units[unit.id] || {};
  const teams = unit.teams.map((id) => course.teams.get(id));
  const done = us.steps || 0;
  const stepsDone = !unit.steps || done >= unit.steps.length;
  // Each step is a short sitting: learn two rules, then 8 exercises on them.
  const stepList = unit.steps ? `<ol class="steps-list">${unit.steps.map((ids, i) => {
    const state = i < done ? 'done' : i === done ? 'now' : 'later';
    return `<li><button class="step ${state}" data-step="${i}" ${i > done ? 'disabled' : ''}>
      <span class="num">${i < done ? icon.check : i + 1}</span>
      <span class="what"><b>${ids.map((id) => esc(teamName(course.teams.get(id)))).join(' · ')}</b><small>${i < done ? 'Готово — можно пройти ещё раз' : 'Правила и 8 заданий · 5 минут'}</small></span>
      ${i === done ? `<span class="go-ic">${icon.play}</span>` : ''}
    </button></li>`;
  }).join('')}</ol>` : '';
  const el = screen(`
    <div class="bar"><button class="x" aria-label="Закрыть">${icon.close}</button></div>
    <section class="unit-sheet ${unit.pack === 'abc' ? 'alpha alpha-steps' : ''}">
      <p class="muted">${esc(course.packs.find((p) => p.id === unit.pack).title)}</p>
      <h1>${esc(unit.title)}</h1>
      ${unit.steps ? stepList : `<div class="letters">${teams.map((t) => `<span class="mini">${esc(teamName(t))}</span>`).join('')}</div>`}
      <div class="actions">
        <button class="btn quiet" data-a="practice">${icon.repeat} ${unit.review ? 'Тренировка' : 'Повторить весь урок'}</button>
        <p class="action-note muted">10 заданий по всем правилам урока, ошибки повторяются в конце.</p>
        <button class="btn ${stepsDone && !us.passed ? 'go' : 'quiet'}" data-a="test">${icon.doc} Тест</button>
        <p class="action-note muted">${testSize(unit)} заданий без подсказок. Чтобы открыть следующий урок, нужно 80%.${us.best ? ` Твой лучший результат: ${Math.round(us.best * 100)}%.` : ''}${stepsDone ? '' : ' Лучше сначала пройти все шаги.'}</p>
      </div>
    </section>`);
  el.querySelector('.x').onclick = el.close;
  el.querySelectorAll('[data-step]').forEach((b) => (b.onclick = () => { el.close(); learn(unit, null, +b.dataset.step); }));
  el.querySelectorAll('[data-a]').forEach((b) => (b.onclick = () => { el.close(); session({ unit, mode: b.dataset.a }); }));
}

/* ---------- learn ---------- */

function highlight(word, team) {
  const m = word.toLowerCase().match(team.re);
  if (!m) return esc(word);
  if (team.split) {
    // a_e: colour the vowel and the final e
    const i = m.index, j = i + m[0].length;
    return esc(word.slice(0, i)) + `<b>${esc(word[i])}</b>` + esc(word.slice(i + 1, j)) + `<b>e</b>` + esc(word.slice(j + 1));
  }
  return esc(word.slice(0, m.index)) + `<b>${esc(word.slice(m.index, m.index + m[0].length))}</b>` + esc(word.slice(m.index + m[0].length));
}

function learn(unit, assignment = null, step = null) {
  const teams = (step != null ? unit.steps[step] : unit.teams).map((id) => course.teams.get(id));
  let i = 0;
  const el = screen(`<div class="bar"><button class="x" aria-label="Закрыть">${icon.close}</button><div class="progress"><i></i></div></div><div class="learn-card"></div><div class="learn-nav"></div>`);
  el.querySelector('.x').onclick = el.close;

  const draw = () => {
    const t = teams[i];
    el.querySelector('.progress i').style.width = `${((i + 1) / teams.length) * 100}%`;
    const card = el.querySelector('.learn-card');
    if (t.kind === 'alphabet') {
      card.innerHTML = `
        <button class="tile hero-tile alpha" data-say-letter="${esc(t.name)}" data-l="${esc(t.label)}">${esc(t.label)}${esc(t.lower)}</button>
        <div class="sound-line">
          <span class="ipa">${esc(t.ru)} <span class="muted" style="font-size:20px">${esc(t.nameIpa)}</span></span>
          <span class="hint muted">Так буква называется. А звучит в словах как ${esc(t.sound)}</span>
        </div>
        <p class="section-label">Слова на эту букву — нажми, чтобы послушать</p>
        <div class="words">${t.words.map((w) => `<button class="tile word-tile" data-say="${esc(w.w)}"><span class="em">${w.e}</span><span>${highlight(w.w, t)}</span><small class="ru">${esc(w.ru)}</small></button>`).join('')}</div>`;
    } else {
      const k = t.key;
      card.innerHTML = `
        <button class="tile hero-tile" data-sound="${esc(t.full)}">${esc(t.label)}</button>
        <div class="sound-line"><span class="ipa">${esc(t.sound)}</span><span class="hint">${esc(t.hint)}</span></div>
        <p class="adult">${esc(t.ru)}</p>
        ${k?.seg ? `<p class="section-label">Произнеси каждый звук… а потом быстро!</p>
        <div class="blend">${k.seg.map((sg) => `<span class="tile ${sg === t.label || (t.split && (sg === t.label[0] || sg === 'e')) ? 'team' : ''}" >${esc(sg)}</span>`).join('')}
          <span class="arrow">→</span><button class="tile" data-say="${esc(k.w)}">${esc(k.w)} ${k.e || ''}</button></div>` : ''}
        <p class="section-label">Смотри, говори, читай</p>
        <div class="words">${t.words.map((w) => `<button class="tile word-tile" data-say="${esc(w.w)}"><span class="em">${w.e}</span><span>${highlight(w.w, t)}</span><small class="ru">${esc(w.ru)}</small></button>`).join('')}</div>
        ${t.read.length ? `<p class="section-label">Теперь прочитай сама — без картинок. Потом нажми и проверь.</p>
        <div class="read-row">${t.read.map((w) => `<button class="tile" data-say="${esc(w)}">${esc(w)}</button>`).join('')}</div>` : ''}`;
    }
    card.querySelectorAll('[data-say]').forEach((b) => (b.onclick = () => say(b.dataset.say)));
    card.querySelectorAll('[data-sound]').forEach((b) => (b.onclick = () => say(t.say || t.label, 'sound', t.full)));
    card.querySelectorAll('[data-say-letter]').forEach((b) => (b.onclick = () => say(b.dataset.sayLetter, 'letter', b.dataset.l)));

    const nav = el.querySelector('.learn-nav');
    const last = i === teams.length - 1;
    nav.innerHTML = `<button class="btn quiet" id="prev" ${i ? '' : 'disabled'}>Назад</button><button class="btn go" id="next">${last ? 'К заданиям' : 'Дальше'}</button>`;
    nav.querySelector('#prev').onclick = () => { i--; draw(); el.scrollTo(0, 0); };
    nav.querySelector('#next').onclick = () => {
      if (!last) { i++; draw(); el.scrollTo(0, 0); return; }
      if (step != null) { el.close(); session({ unit, mode: 'practice', step }); return; }
      S.markLearned(unit.id);
      if (assignment) { st().done[assignment] = Date.now(); S.save(); tasks = tasks.filter((x) => x.id !== assignment); }
      sync.logEvent(code(), 'learn', { unit: unit.id, title: unit.title, assignment });
      el.close();
      session({ unit, mode: 'practice' });
    };
    if (t.kind === 'alphabet') say(t.name, 'letter', t.label); else say(t.say || t.label, 'sound', t.full);
  };
  draw();
}

/* ---------- session ---------- */

function session({ unit, mode, focus, poolOf, title, assignment = null, step = null }) {
  const s = st();
  const teams = focus || (step != null ? unit.steps[step] : unit.teams).map((id) => course.teams.get(id));
  // Distractors come from rules already met; early on there are too few, so widen the pool.
  const pool = (t) => (poolOf ? poolOf(t) : (() => {
    for (const p of [poolFor(course, unit, step), poolFor(course, unit)]) if (p.length >= 5) return p;
    return packTeams(course, unit.pack);
  })());
  if (step != null) title = `${unit.title}, шаг ${step + 1}`;
  const canSay = canListen && s.settings.say && mode !== 'test' && Date.now() > (s.sayPausedUntil || 0);
  const count = mode === 'test' ? testSize(unit) : step != null ? 8 : 10;

  // A mixed review spans packs, so build per pack and interleave.
  let questions;
  const packs = [...new Set(teams.map((t) => t.pack))];
  if (packs.length === 1) {
    questions = buildSession({ focus: teams, pool: pool(teams[0]), count, stats: s.teams, recent: unit ? s.recent[unit.id + (step != null ? '#' + step : '')] || [] : s.recent.mix || [], canSay });
  } else {
    const parts = packs.map((p) => {
      const f = teams.filter((t) => t.pack === p);
      return buildSession({ focus: f, pool: pool(f[0]), count: Math.round((count * f.length) / teams.length), stats: s.teams, recent: s.recent.mix || [], canSay });
    });
    questions = shuffle(parts.flat());
  }
  if (!questions.length) return toast('Не получилось собрать задания');

  const started = Date.now();
  let idx = 0, score = 0, retries = 0, scored = 0;
  const mistakes = [];
  const used = new Set(questions.map((q) => q.word?.toLowerCase()).filter(Boolean));
  const el = screen(`<div class="bar"><button class="x" aria-label="Закончить">${icon.close}</button><div class="progress"><i></i></div></div><div class="q"></div>
    <div class="verdict"><div class="in"><h3></h3><p class="explain"></p><button class="btn">Дальше</button></div></div>`);
  el.querySelector('.x').onclick = () => { if (idx === 0 || confirm('Закончить? Прогресс этого занятия не сохранится.')) el.close(); };
  const verdict = el.querySelector('.verdict');

  const finish = () => {
    const keys = questions.map((q) => q.key);
    const res = S.finishSession({ unit: unit?.id || null, step, recentKey: unit && step != null ? `${unit.id}#${step}` : null, mode, score, total: scored, mistakes, seconds: Math.round((Date.now() - started) / 1000), keys, assignment });
    if (!unit) { st().recent.mix = [...keys, ...(st().recent.mix || [])].slice(0, 60); S.save(); }
    if (assignment) tasks = tasks.filter((x) => x.id !== assignment);
    sync.logEvent(code(), 'session', { ...res.entry, title: title || unit?.title, unitTitle: unit?.title || title });
    el.close();
    results(res, unit, mode, step);
  };

  const next = () => {
    verdict.classList.remove('show');
    idx++;
    if (idx >= questions.length) return finish();
    show();
  };
  const nextBtn = verdict.querySelector('.in > .btn');
  nextBtn.onclick = next;

  const judge = (q, ok, skipped = false) => {
    if (!skipped) {
      scored++;
      if (ok) score++;
      S.recordAnswer(q.team, ok);
    }
    const team = course.teams.get(q.team);
    if (!ok && !skipped) {
      mistakes.push({ team: q.team, label: team.label, type: q.type, word: q.word || null });
      if (mode !== 'test' && retries < 3) {
        const r = retryQuestion(team, q.type, pool(team), used, false);
        if (r) { retries++; r.retry = true; questions.push(r); if (r.word) used.add(r.word.toLowerCase()); }
      }
    }
    if (st().settings.sound) tone(ok ? 'ok' : 'bad');
    verdict.className = `verdict show ${ok || skipped ? 'ok' : 'bad'}`;
    const right = q.options?.find((o) => o.id === q.answer);
    const rightText = right ? (right.label || right.text) : q.word;
    verdict.querySelector('h3').textContent = skipped ? 'Пропустим' : ok ? pick(['Верно!', 'Отлично!', 'Супер!', 'Так держать!']) : 'Почти!';
    const exp = verdict.querySelector('.explain');
    const ruleBit = team.kind === 'alphabet' ? `${team.label}${team.lower} — «${team.ru}», звук ${team.sound}` : `${team.label} ${team.sound}`;
    exp.innerHTML = `${q.word || q.speak ? `<button class="play small" aria-label="Послушать">${icon.speaker}</button>` : ''}<span>${ok ? '' : `Правильно: <b>${esc(rightText)}</b>. `}${q.word ? `<b>${highlight(q.word, team)}</b>${course.ru(q.word) ? ` (${esc(course.ru(q.word))})` : ''} — ` : ''}${esc(ruleBit)}</span>`;
    const pb = exp.querySelector('.play');
    if (pb) pb.onclick = () => say(q.speak?.letter ? q.speak.text : q.word, q.speak?.letter ? 'letter' : 'word', q.speak?.letter);
    el.querySelector('.progress i').style.width = `${((idx + 1) / questions.length) * 100}%`;
    nextBtn.focus();
  };

  const playPrompt = (q) => q.speak && (q.speak.letter ? say(q.speak.text, 'letter', q.speak.letter) : say(q.speak.text));

  function show() {
    const q = questions[idx];
    const box = el.querySelector('.q');
    const sh = q.show || {};
    let stage = '';
    const cap = sh.ru ? `<p class="caption">${esc(sh.ru)}</p>` : '';
    if (sh.kind === 'emoji') stage = `<div class="stage-row"><span class="emoji" aria-label="${esc(sh.ru || 'картинка')}">${sh.emoji}</span><button class="play small" aria-label="Послушать слово по-английски">${icon.speaker}</button></div>${cap}`;
    else if (sh.kind === 'audio') stage = `<button class="play" aria-label="Послушать ещё раз">${icon.speaker}</button>`;
    else if (sh.kind === 'big') stage = `<span class="tile big ${course.teams.get(q.team).kind === 'alphabet' ? 'alpha' : ''}">${esc(sh.text)}</span>`;
    else if (sh.kind === 'blank') stage = `<div class="stage-row"><span class="emoji" style="font-size:72px" aria-label="${esc(sh.ru || 'картинка')}">${sh.emoji}</span><button class="play small" aria-label="Послушать слово по-английски">${icon.speaker}</button></div>${cap}
      <div class="wordline">${esc(sh.before)}<span class="blank" style="min-width:${sh.size * 0.7}em"></span>${esc(sh.after)}</div>`;
    else if (sh.kind === 'word') stage = `<div class="word-mark">${highlight(sh.text, course.teams.get(sh.mark))}</div>`;

    const retryNote = q.retry ? '<p class="muted" style="font-size:15px">Ещё раз это правило</p>' : '';
    if (q.mode === 'build') {
      box.innerHTML = `${retryNote}<p class="prompt">${esc(q.prompt)}</p><div class="stage">${stage}</div>
        <div class="slots" aria-label="Твоё слово"></div><div class="bank">${q.tiles.map((t) => `<button class="tile" data-t="${t.id}">${esc(t.text)}</button>`).join('')}</div>
        <div class="foot"><button class="btn go" id="check" disabled>Проверить</button></div>`;
      const slots = box.querySelector('.slots'), check = box.querySelector('#check');
      const picked = [];
      const redraw = () => {
        slots.innerHTML = picked.map((t, i) => `<button class="tile" data-i="${i}">${esc(t.text)}</button>`).join('');
        slots.querySelectorAll('[data-i]').forEach((b) => (b.onclick = () => { const t = picked.splice(+b.dataset.i, 1)[0]; box.querySelector(`[data-t="${t.id}"]`).classList.remove('used'); redraw(); }));
        check.disabled = !picked.length;
      };
      box.querySelectorAll('[data-t]').forEach((b) => (b.onclick = () => {
        if (b.classList.contains('used')) return;
        b.classList.add('used'); picked.push(q.tiles.find((t) => t.id === b.dataset.t)); redraw();
      }));
      check.onclick = () => {
        const ok = picked.map((t) => t.text).join('') === q.answerText;
        slots.querySelectorAll('.tile').forEach((t) => t.classList.add(ok ? 'is-right' : 'is-wrong'));
        box.querySelectorAll('button').forEach((b) => (b.disabled = true));
        judge(q, ok);
      };
    } else if (q.mode === 'say') {
      box.innerHTML = `${retryNote}<p class="prompt">${esc(q.prompt)}</p><div class="stage">${stage}</div>
        <div class="stage"><button class="mic" aria-label="Нажми и говори">${icon.mic}</button></div>
        <p class="muted" style="text-align:center;font-size:15px" id="heard">Нажми на микрофон и скажи слово</p>
        <div class="foot"><button class="link" id="skip">Сейчас не могу говорить</button></div>`;
      let tries = 0;
      const mic = box.querySelector('.mic'), heard = box.querySelector('#heard');
      mic.onclick = async () => {
        mic.classList.add('on'); heard.textContent = 'Слушаю…';
        try {
          const alts = await listen();
          mic.classList.remove('on');
          const ok = alts.some((a) => near(a, q.answerText));
          tries++;
          if (ok || tries >= 2) { box.querySelectorAll('button').forEach((b) => (b.disabled = true)); judge(q, ok); }
          else heard.textContent = alts.length ? `Я услышал «${alts[0]}». Попробуй ещё раз!` : 'Не расслышал. Скажи погромче!';
        } catch {
          mic.classList.remove('on');
          heard.textContent = 'Микрофон недоступен.';
          judge(q, false, true);
        }
      };
      box.querySelector('#skip').onclick = () => {
        st().sayPausedUntil = Date.now() + 15 * 60000; S.save();
        box.querySelectorAll('button').forEach((b) => (b.disabled = true));
        judge(q, false, true);
      };
    } else {
      const opts = q.options;
      const isPic = opts.some((o) => o.emoji);
      const long = opts.some((o) => (o.text || '').length > 6) && !isPic;
      const cls = isPic ? '' : long ? 'list' : opts.length === 3 ? 'three' : '';
      box.innerHTML = `${retryNote}<p class="prompt">${esc(q.prompt)}</p>${q.sub ? `<p class="sub muted">${esc(q.sub)}</p>` : ''}<div class="stage">${stage}</div>
        <div class="options ${cls}">${opts.map((o) => `<button class="tile ${isPic ? 'pic' : ''}" data-o="${esc(o.id)}" ${o.label ? `aria-label="${esc(o.label)}"` : ''}>${o.emoji ? `<span class="em">${o.emoji}</span>${o.ru ? `<span class="cap">${esc(o.ru)}</span>` : ''}` : esc(o.text)}</button>`).join('')}</div>
        ${q.confirm ? '<div class="foot"><button class="btn go" id="check" disabled>Проверить</button></div>' : ''}`;
      // Picture answers: the first tap only selects and says the English word, «Проверить» answers.
      let chosen = null;
      const answer = (b) => {
        const o = opts.find((x) => x.id === b.dataset.o);
        const ok = o.id === q.answer;
        box.querySelectorAll('[data-o]').forEach((x) => {
          x.disabled = true;
          if (x.dataset.o === q.answer) x.classList.add('is-right');
          else if (x === b) x.classList.add('is-wrong');
          else x.classList.add('is-faded');
          x.classList.remove('is-picked');
        });
        box.querySelector('#check')?.setAttribute('disabled', '');
        judge(q, ok);
      };
      box.querySelectorAll('[data-o]').forEach((b) => (b.onclick = () => {
        if (!q.confirm) return answer(b);
        chosen = b;
        box.querySelectorAll('[data-o]').forEach((x) => x.classList.toggle('is-picked', x === b));
        box.querySelector('#check').disabled = false;
        const o = opts.find((x) => x.id === b.dataset.o);
        if (o.speak) say(o.speak);
      }));
      box.querySelector('#check')?.addEventListener('click', () => chosen && answer(chosen));
    }
    box.querySelectorAll('.play').forEach((b) => (b.onclick = () => playPrompt(q)));
    if (q.autoplay || sh.kind === 'emoji' || sh.kind === 'blank') {
      // Picture questions read the word aloud only when it doesn't give the answer away.
      if (q.autoplay || !['spell', 'missing', 'findSound', 'build'].includes(q.type)) playPrompt(q);
    }
    el.scrollTo(0, 0);
  }
  show();
}

function pick(a) { return a[int(a.length)]; }

function near(a, b) {
  a = a.replace(/[^a-z]/g, ''); b = b.replace(/[^a-z]/g, '');
  if (a === b || a.split(' ').includes(b)) return true;
  if (b.length < 4) return false;
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length] <= 1;
}

/* ---------- results ---------- */

function results(res, unit, mode, step = null) {
  const { entry } = res;
  const pct = Math.round(res.pct * 100);
  const isTest = mode === 'test';
  const head = isTest ? (res.stars ? 'Тест сдан!' : 'Почти получилось') : pct >= 80 ? 'Отличная работа!' : 'Хорошая тренировка';
  const nStars = isTest ? res.stars : pct >= 95 ? 3 : pct >= 80 ? 2 : 1;
  const weak = [...new Set(entry.mistakes.map((m) => m.label))];
  const nextStep = step != null ? unit.steps[step + 1] : null;
  const lastStep = step != null && !nextStep && !st().units[unit.id]?.passed;
  const el = screen(`
    <section class="result">
      <div class="big-stars" aria-label="${nStars} из 3">${[0, 1, 2].map((i) => `<span class="${i < nStars ? '' : 'off'}">${icon.star}</span>`).join('')}</div>
      <h1>${head}</h1>
      <div class="stats">
        <div class="stat"><b>${entry.score}/${entry.total}</b><span>верно</span></div>
        <div class="stat"><b>+${res.xp}</b><span>очков</span></div>
        <div class="stat"><b>${Math.floor(entry.seconds / 60)}:${String(entry.seconds % 60).padStart(2, '0')}</b><span>время</span></div>
      </div>
      ${res.streakUp ? `<div class="flame-up">${icon.flame} ${res.streak} ${plural(res.streak, 'день', 'дня', 'дней')} подряд!</div>` : ''}
      ${res.goalReached ? `<div class="flame-up">${icon.target} Цель на сегодня выполнена</div>` : ''}
      ${res.unlocked ? `<div class="badge-new">${icon.lock} Открыт следующий урок</div>` : ''}
      ${isTest && !res.stars ? `<p class="muted">Нужно 80%, у тебя ${pct}%. Потренируйся и попробуй ещё раз.</p>` : ''}
      ${res.newBadges.map((b) => `<div class="badge-new">${icon.medal} Новая награда: ${esc(b.title)}</div>`).join('')}
      ${weak.length ? `<div class="redo"><p class="muted">Повтори эти правила:</p><div class="letters">${weak.map((w) => `<span class="mini">${esc(w)}</span>`).join('')}</div></div>` : ''}
      ${nextStep ? `<button class="btn go" id="nextstep">${icon.play} Шаг ${step + 2}: ${nextStep.map((id) => esc(teamName(course.teams.get(id)))).join(' · ')}</button>` : ''}
      ${lastStep ? `<button class="btn go" id="totest">${icon.doc} Сдать тест урока</button>` : ''}
      <button class="btn ${nextStep || lastStep ? 'quiet' : 'go'}" id="done">${nextStep || lastStep ? 'На сегодня хватит' : 'Продолжить'}</button>
    </section>`);
  if (st().settings.sound) setTimeout(() => tone('win'), 250);
  if (nStars >= 2 || res.streakUp) confetti();
  el.querySelector('#done').onclick = () => { el.close(); route(); };
  el.querySelector('#nextstep')?.addEventListener('click', () => { el.close(); route(); learn(unit, null, step + 1); });
  el.querySelector('#totest')?.addEventListener('click', () => { el.close(); route(); session({ unit, mode: 'test' }); });
}

function plural(n, one, few, many) {
  const m10 = n % 10, m100 = n % 100;
  return m10 === 1 && m100 !== 11 ? one : m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20) ? few : many;
}

function confetti() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const box = document.createElement('div');
  box.className = 'confetti';
  const bits = ['sh', 'ee', 'a', 'oo', 'ch', 'igh', 'ar', '★', 'b', 'qu'];
  const colors = ['var(--coral)', 'var(--sun)', 'var(--leaf)', 'var(--ink)'];
  for (let i = 0; i < 36; i++) {
    const s = document.createElement('i');
    s.textContent = bits[int(bits.length)];
    s.style.left = `${int(100)}%`;
    s.style.color = colors[int(colors.length)];
    s.style.setProperty('--rot', `${int(720) - 360}deg`);
    s.style.animationDuration = `${1.6 + int(16) / 10}s`;
    s.style.animationDelay = `${int(6) / 10}s`;
    box.appendChild(s);
  }
  document.body.appendChild(box);
  setTimeout(() => box.remove(), 4000);
}

/* ---------- dictionary ---------- */

let dictQuery = '';
function dictionary() {
  // Every word of the course, grouped by unit, with its Russian translation.
  const groups = [];
  const seen = new Set();
  for (const pack of course.packs) for (const u of pack.units) {
    if (u.review) continue;
    const rows = [];
    for (const id of u.teams) {
      const t = course.teams.get(id);
      const words = [...t.words, ...t.read.map((w) => ({ w, e: '', ru: course.ru(w) }))];
      for (const w of words) {
        const k = w.w.toLowerCase();
        if (seen.has(k)) continue;
        seen.add(k);
        rows.push({ ...w, t });
      }
    }
    groups.push({ title: `${pack.title}: ${u.title}`, rows });
  }
  root.innerHTML = `
    <section class="dict">
      <h1>Словарик</h1>
      <p class="muted">Все слова из уроков. Нажми на слово, чтобы послушать.</p>
      <div class="field"><label class="sr" for="q">Поиск</label><input id="q" type="search" placeholder="Найти слово: fish или рыба" value="${esc(dictQuery)}" autocomplete="off"></div>
      <div id="dict-list"></div>
    </section>`;
  const list = document.getElementById('dict-list');
  const draw = () => {
    const q = dictQuery.trim().toLowerCase();
    const html = groups.map((g) => {
      const rows = g.rows.filter((r) => !q || r.w.toLowerCase().includes(q) || (r.ru || '').toLowerCase().includes(q));
      if (!rows.length) return '';
      return `<h2 class="dict-h">${esc(g.title)}</h2><ul class="dict-list">${rows.map((r) => `
        <li><button class="dict-row" data-say="${esc(r.w)}">
          <span class="em">${r.e || ''}</span>
          <span class="en">${highlight(r.w, r.t)}</span>
          <span class="ru">${esc(r.ru)}</span>
          <span class="spk">${icon.speaker}</span>
        </button></li>`).join('')}</ul>`;
    }).join('');
    list.innerHTML = html || '<p class="muted" style="margin-top:16px">Такого слова нет. Попробуй написать по-другому.</p>';
    list.querySelectorAll('[data-say]').forEach((b) => (b.onclick = () => say(b.dataset.say)));
  };
  document.getElementById('q').oninput = (e) => { dictQuery = e.target.value; draw(); };
  draw();
}

/* ---------- me ---------- */

const BADGE_ICONS = { first: icon.sparkles, streak3: icon.flame, streak7: icon.flame, streak30: icon.medal, xp100: icon.star, xp500: icon.star, perfect: icon.checkCircle, abc: icon.book, final: icon.medal };

function me() {
  const s = st();
  const days = [];
  for (let i = 27; i >= 0; i--) { const d = new Date(Date.now() - i * 864e5); days.push(S.today(d)); }
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  root.innerHTML = `
    <section class="me">
      <h1>${esc(s.student.name)}</h1>
      <p class="muted">${s.student.code ? 'Учитель видит твои успехи' : 'Прогресс хранится на этом телефоне'}</p>
      <div class="stats" style="margin-top:14px">
        <div class="stat"><b class="flame-c">${icon.flame} ${S.liveStreak()}</b><span>дней подряд</span></div>
        <div class="stat"><b>${s.streak.best}</b><span>лучшая серия</span></div>
        <div class="stat"><b class="star-c">${icon.star} ${s.xp}</b><span>очков</span></div>
      </div>
      <div class="panel"><h2>Последние 4 недели</h2>
        <div class="cal">${days.map((d) => `<i class="${s.days[d] ? 'hit' : ''} ${d === S.today() ? 'today' : ''}" title="${d}">${+d.slice(8)}</i>`).join('')}</div>
        <p class="muted" style="font-size:14px">Пропустила один день? Серию спасёт заморозка — сейчас их ${s.streak.freezes}. Новая даётся за каждые 7 дней подряд.</p>
      </div>
      <div class="panel"><h2>Награды</h2>
        <div class="badges">${S.BADGE_LIST.map((b) => `<div class="badge ${s.badges.includes(b.id) ? '' : 'off'}"><span>${BADGE_ICONS[b.id]}</span>${esc(b.title)}</div>`).join('')}</div>
      </div>
      <div class="panel"><h2>Настройки</h2>
        <div class="row"><span>Звуки ответов</span><button class="switch" role="switch" aria-checked="${s.settings.sound}" data-set="sound" aria-label="Звуки ответов"></button></div>
        ${canListen ? `<div class="row"><span>Задания «скажи вслух»</span><button class="switch" role="switch" aria-checked="${s.settings.say}" data-set="say" aria-label="Задания скажи вслух"></button></div>` : ''}
      </div>
      ${standalone ? '' : `<div class="panel"><h2>Поставить на экран iPhone</h2>
        <ol class="steps"><li>Открой эту страницу в Safari.</li><li>Нажми «Поделиться» (квадрат со стрелкой).</li><li>Выбери «На экран „Домой“».</li><li>Нажми «Добавить».</li></ol></div>`}
      <div class="panel"><a class="link" href="admin.html">Вход для учителя</a></div>
    </section>`;
  root.querySelectorAll('[data-set]').forEach((b) => (b.onclick = () => {
    const k = b.dataset.set;
    s.settings[k] = !s.settings[k];
    S.save();
    b.setAttribute('aria-checked', s.settings[k]);
  }));
}

boot().catch((e) => {
  console.error(e);
  root.innerHTML = `<p class="error">Не удалось загрузить уроки. Проверь интернет и обнови страницу.</p>`;
});
