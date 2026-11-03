import { loadCourse } from './data.js';
import * as sync from './sync.js';
import { int } from './rng.js';
import { icon } from './icons.js';

const root = document.getElementById('root');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let course;

const DEMO_TASKS = 'readit.demo.assignments';
const MODE_NAMES = { learn: 'Учить правила', practice: 'Тренировка', test: 'Тест', review: 'Повторение пройденного' };

function toast(text) {
  const el = document.getElementById('toast');
  el.textContent = text; el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 2400);
}

const day = (d = new Date()) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const fmtDate = (d) => new Date(d).toLocaleString('ru', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const ago = (d) => {
  if (!d) return 'ещё не заходил(а)';
  const m = Math.round((Date.now() - new Date(d)) / 60000);
  if (m < 2) return 'только что';
  if (m < 60) return `${m} мин назад`;
  if (m < 60 * 24) return `${Math.round(m / 60)} ч назад`;
  return `${Math.round(m / 1440)} дн назад`;
};
const unitTitle = (id) => course.units.find((u) => u.id === id)?.title || id || 'Повторение';

function liveStreak(data) {
  const s = data?.streak;
  if (!s?.last) return 0;
  const gap = Math.round((new Date(day()) - new Date(s.last)) / 864e5);
  return gap <= 1 ? s.count : 0;
}

/* ---------- data source: Supabase, or this device in demo mode ---------- */

const api = sync.online ? {
  async students() {
    const [students, progress] = await Promise.all([sync.rest('students?select=*&order=created_at'), sync.rest('progress?select=code,data,updated_at')]);
    const tasks = await sync.rest('assignments?select=id,code,due');
    const done = await sync.rest(`events?select=payload&kind=in.(session,learn)&payload->>assignment=not.is.null`);
    const doneIds = new Set(done.map((e) => e.payload.assignment));
    return students.map((s) => {
      const p = progress.find((x) => x.code === s.code);
      const mine = tasks.filter((t) => t.code === s.code);
      return { ...s, data: p?.data, updated: p?.updated_at, open: mine.filter((t) => !doneIds.has(t.id)), late: mine.filter((t) => !doneIds.has(t.id) && t.due && t.due < day()) };
    });
  },
  async student(code) {
    const [[s], [p], events, tasks] = await Promise.all([
      sync.rest(`students?code=eq.${encodeURIComponent(code)}`),
      sync.rest(`progress?code=eq.${encodeURIComponent(code)}`),
      sync.rest(`events?code=eq.${encodeURIComponent(code)}&order=created_at.desc&limit=150`),
      sync.rest(`assignments?code=eq.${encodeURIComponent(code)}&order=created_at.desc`),
    ]);
    return { ...s, data: p?.data, updated: p?.updated_at, events, tasks };
  },
  addStudent: (name, code) => sync.rest('students', { method: 'POST', body: { name, code } }),
  delStudent: (code) => sync.rest(`students?code=eq.${encodeURIComponent(code)}`, { method: 'DELETE' }),
  addTask: (t) => sync.rest('assignments', { method: 'POST', body: t }),
  delTask: (id) => sync.rest(`assignments?id=eq.${id}`, { method: 'DELETE' }),
} : {
  local() { try { return JSON.parse(localStorage.getItem('readit.state.v1')); } catch { return null; } },
  tasks() { try { return JSON.parse(localStorage.getItem(DEMO_TASKS)) || []; } catch { return []; } },
  async students() {
    const d = this.local();
    if (!d?.student) return [];
    const open = this.tasks().filter((t) => !d.done?.[t.id]);
    return [{ code: 'local', name: d.student.name, data: d, updated: d.history?.[0]?.at, open, late: open.filter((t) => t.due && t.due < day()) }];
  },
  async student() {
    const d = this.local();
    const events = (d.history || []).map((h) => ({ kind: 'session', created_at: new Date(h.at).toISOString(), payload: { ...h, title: unitTitle(h.unit) } }));
    return { code: 'local', name: d.student.name, data: d, updated: d.history?.[0]?.at, events, tasks: this.tasks() };
  },
  async addStudent() { throw new Error('Чтобы добавлять учеников, подключите сервер (README.md).'); },
  async delStudent() {},
  async addTask(t) { localStorage.setItem(DEMO_TASKS, JSON.stringify([{ ...t, id: crypto.randomUUID(), created_at: new Date().toISOString() }, ...this.tasks()])); },
  async delTask(id) { localStorage.setItem(DEMO_TASKS, JSON.stringify(this.tasks().filter((t) => t.id !== id))); },
};

/* ---------- views ---------- */

async function boot() {
  course = await loadCourse();
  window.addEventListener('hashchange', route);
  route();
}

function route() {
  if (sync.online && !sync.teacherSession()) return login();
  const m = location.hash.match(/^#\/s\/(.+)$/);
  if (m) studentView(decodeURIComponent(m[1]));
  else if (location.hash === '#/dict') dictView();
  else list();
  window.scrollTo(0, 0);
}

function guard(e) {
  if (e.message === 'auth') return login();
  console.error(e);
  root.innerHTML += `<p class="error">Ошибка: ${esc(e.message)}</p>`;
}

function login() {
  root.innerHTML = `
    <section class="welcome">
      <h1>Вход для учителя</h1>
      <p class="muted">Почта и пароль пользователя из Supabase → Authentication.</p>
      <form id="f" class="actions">
        <div class="field"><label for="em">Почта</label><input id="em" type="email" autocomplete="username" required></div>
        <div class="field"><label for="pw">Пароль</label><input id="pw" type="password" autocomplete="current-password" required></div>
        <p class="error" id="err"></p>
        <button class="btn">Войти</button>
      </form>
      <a class="link" href="index.html">Открыть приложение ученика</a>
    </section>`;
  document.getElementById('f').onsubmit = async (e) => {
    e.preventDefault();
    try { await sync.signIn(document.getElementById('em').value, document.getElementById('pw').value); route(); }
    catch (err) { document.getElementById('err').textContent = err.message; }
  };
}

function statusOf(task, events) {
  const ev = events.find((e) => e.payload?.assignment === task.id);
  if (ev) {
    const p = ev.payload;
    return { cls: 'ok', text: p.total ? `Выполнено · ${p.score}/${p.total}` : 'Выполнено', when: ev.created_at };
  }
  if (task.due && task.due < day()) return { cls: 'late', text: 'Просрочено' };
  return { cls: 'wait', text: 'Ждёт выполнения' };
}

async function list() {
  root.innerHTML = '<p class="muted">Загружаю…</p>';
  let students;
  try { students = await api.students(); } catch (e) { return guard(e); }
  const today = day();
  root.innerHTML = `
    <header class="top"><div class="hello"><h1>Ученики</h1><p class="muted">${sync.online ? esc(sync.teacherSession()?.email) : 'Демо-режим'}</p></div>
      <a class="link" href="#/dict">Словарик</a>
      ${sync.online ? '<button class="link" id="out">Выйти</button>' : ''}</header>
    ${sync.online ? '' : `<p class="demo">Сервер не подключён — здесь видно только ученика на этом устройстве. Чтобы смотреть прогресс ученицы удалённо, подключите Supabase по инструкции в README.md (10 минут, бесплатно).</p>`}
    <div class="grid">${students.map((s) => {
      const d = s.data || {};
      const todayXp = d.days?.[today] || 0;
      return `<button class="card" data-s="${esc(s.code)}">
        <h3>${esc(s.name)}</h3>
        <div class="kv"><span class="flame-c">${icon.flame} <b>${liveStreak(d)}</b> дн.</span><span class="star-c">${icon.star} <b>${d.xp || 0}</b></span><span>Сегодня: <b>${todayXp ? `+${todayXp}` : 'нет'}</b></span></div>
        <div class="kv"><span>Был(а): ${ago(s.updated)}</span></div>
        <div>${s.late.length ? `<span class="pill late">Просрочено: ${s.late.length}</span> ` : ''}${s.open.length ? `<span class="pill wait">Заданий: ${s.open.length}</span>` : '<span class="pill idle">Нет открытых заданий</span>'}</div>
      </button>`;
    }).join('') || '<p class="muted">Пока нет учеников.</p>'}</div>
    ${sync.online ? `<section class="panel"><h2>Добавить ученика</h2>
      <form id="add" class="linkbox"><input id="nm" placeholder="Имя ученика" required maxlength="40"><button class="btn go">Добавить</button></form>
      <div id="newlink"></div></section>` : ''}`;
  root.querySelectorAll('[data-s]').forEach((b) => (b.onclick = () => (location.hash = `#/s/${encodeURIComponent(b.dataset.s)}`)));
  const out = document.getElementById('out');
  if (out) out.onclick = () => { sync.signOut(); route(); };
  const add = document.getElementById('add');
  if (add) add.onsubmit = async (e) => {
    e.preventDefault();
    const name = document.getElementById('nm').value.trim();
    const abc = 'abcdefghjkmnpqrstuvwxyz23456789';
    const code = Array.from({ length: 10 }, () => abc[int(abc.length)]).join('');
    try {
      await api.addStudent(name, code);
      await list();
      showLink(document.getElementById('newlink'), name, code);
    } catch (err) { toast(err.message); }
  };
}

function studentLink(code) { return new URL(`index.html?s=${code}`, location.href).href; }

function showLink(box, name, code) {
  const url = studentLink(code);
  box.innerHTML = `<p style="margin-top:10px">Отправьте ${esc(name)} эту ссылку. Её нужно открыть на iPhone в Safari и добавить на экран «Домой».</p>
    <div class="linkbox" style="margin-top:8px"><input readonly value="${esc(url)}"><button class="btn quiet" id="cp">Копировать</button></div>`;
  box.querySelector('#cp').onclick = () => navigator.clipboard.writeText(url).then(() => toast('Ссылка скопирована'));
}

async function studentView(code) {
  root.innerHTML = '<p class="muted">Загружаю…</p>';
  let s;
  try { s = await api.student(code); } catch (e) { return guard(e); }
  const d = s.data || { units: {}, teams: {}, days: {}, history: [], streak: {} };
  const events = s.events || [];

  const days = [];
  for (let i = 27; i >= 0; i--) days.push(day(new Date(Date.now() - i * 864e5)));
  const week = days.slice(-7).reduce((n, x) => n + (d.days?.[x] ? 1 : 0), 0);

  const teamRows = Object.entries(d.teams || {}).filter(([, x]) => x.n > 0)
    .map(([id, x]) => ({ id, t: course.teams.get(id), acc: x.c / x.n, n: x.n }))
    .filter((r) => r.t).sort((a, b) => a.acc - b.acc);

  const unitOptions = course.packs.map((p) => `<optgroup label="${esc(p.title)}">${p.units.map((u) => `<option value="${u.id}">${esc(u.title)}</option>`).join('')}</optgroup>`).join('');

  root.innerHTML = `
    <button class="link back" id="back">← Все ученики</button>
    <header class="top"><div class="hello"><h1>${esc(s.name)}</h1><p class="muted">Был(а): ${ago(s.updated)}</p></div></header>
    <div class="stats">
      <div class="stat"><b class="flame-c">${icon.flame} ${liveStreak(d)}</b><span>дней подряд (рекорд ${d.streak?.best || 0})</span></div>
      <div class="stat"><b>${week}/7</b><span>дней на этой неделе</span></div>
      <div class="stat"><b class="star-c">${icon.star} ${d.xp || 0}</b><span>очков всего</span></div>
    </div>

    <section class="panel"><h2>Задания</h2>
      ${(s.tasks || []).length ? `<div class="scroll"><table><thead><tr><th>Что</th><th>Срок</th><th>Статус</th><th></th></tr></thead><tbody>
      ${s.tasks.map((t) => { const st = statusOf(t, events); return `<tr><td><b>${esc(unitTitle(t.unit))}</b><br><span class="feed-mist">${MODE_NAMES[t.mode] || t.mode}${t.note ? ` — ${esc(t.note)}` : ''}</span></td>
        <td>${t.due ? new Date(t.due).toLocaleDateString('ru', { day: 'numeric', month: 'short' }) : '—'}</td>
        <td><span class="pill ${st.cls}">${st.text}</span>${st.when ? `<br><span class="feed-mist">${fmtDate(st.when)}</span>` : ''}</td>
        <td><button class="link" data-del="${t.id}" aria-label="Удалить задание">Удалить</button></td></tr>`; }).join('')}
      </tbody></table></div>` : '<p class="muted">Заданий пока нет. Дайте первое — оно появится у ученика сверху на главном экране.</p>'}
      <form id="task" class="form">
        <div class="field"><label for="u">Урок</label><select id="u">${unitOptions}</select></div>
        <div class="field"><label for="m">Что сделать</label><select id="m">${Object.entries(MODE_NAMES).map(([k, v]) => `<option value="${k}" ${k === 'test' ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
        <div class="field"><label for="due">Срок</label><input id="due" type="date" value="${day(new Date(Date.now() + 2 * 864e5))}"></div>
        <div class="field"><label for="note">Комментарий</label><input id="note" maxlength="120" placeholder="Необязательно"></div>
        <div class="field wide"><button class="btn go">Дать задание</button></div>
      </form>
    </section>

    <div class="two">
      <section class="panel"><h2>Где ошибается</h2>
        ${teamRows.length ? teamRows.slice(0, 12).map((r) => {
          const pct = Math.round(r.acc * 100);
          const col = pct >= 85 ? 'var(--leaf)' : pct >= 65 ? 'var(--sun)' : 'var(--coral)';
          return `<div class="acc"><b>${esc(r.t.kind === 'alphabet' ? r.t.label + r.t.lower : r.t.label)}</b><div class="bar"><i style="width:${pct}%;background:${col}"></i></div><span>${pct}% <span class="feed-mist">(${r.n})</span></span></div>`;
        }).join('') : '<p class="muted">Появится после первых заданий.</p>'}
      </section>
      <section class="panel"><h2>Уроки</h2>
        <div class="scroll"><table><thead><tr><th>Урок</th><th>Тест</th><th>Тренировок</th></tr></thead><tbody>
        ${course.units.map((u) => { const x = d.units?.[u.id]; if (!x) return ''; return `<tr><td>${esc(u.title)}</td><td>${x.best ? `${Math.round(x.best * 100)}% ${'★'.repeat(x.stars || 0)}` : '—'}${x.passed ? ' <span class="pill ok">сдан</span>' : ''}</td><td>${x.practiced || 0}</td></tr>`; }).join('') || '<tr><td colspan="3" class="muted">Пока ничего</td></tr>'}
        </tbody></table></div>
      </section>
    </div>

    <section class="panel"><h2>Последние 4 недели</h2>
      <div class="cal">${days.map((x) => `<i class="${d.days?.[x] ? 'hit' : ''} ${x === day() ? 'today' : ''}" title="${x}: ${d.days?.[x] || 0} очков">${+x.slice(8)}</i>`).join('')}</div>
    </section>

    <section class="panel"><h2>История занятий</h2>
      <div class="scroll"><table><thead><tr><th>Когда</th><th>Что</th><th>Результат</th><th>Ошибки</th></tr></thead><tbody>
      ${events.filter((e) => e.kind !== 'open').slice(0, 60).map((e) => {
        const p = e.payload || {};
        if (e.kind === 'learn') return `<tr><td>${fmtDate(e.created_at)}</td><td>${esc(p.title || unitTitle(p.unit))}<br><span class="feed-mist">изучение правил</span></td><td>—</td><td></td></tr>`;
        const pct = p.total ? Math.round((p.score / p.total) * 100) : 0;
        const mins = p.seconds ? `${Math.floor(p.seconds / 60)} мин ${p.seconds % 60} с` : '';
        return `<tr><td>${fmtDate(e.created_at)}</td><td>${esc(p.title || unitTitle(p.unit) + (p.step != null ? `, шаг ${p.step + 1}` : ''))}<br><span class="feed-mist">${MODE_NAMES[p.mode] || p.mode}${p.assignment ? ' · задание' : ''}</span></td>
          <td><span class="pill ${pct >= 80 ? 'ok' : pct >= 60 ? 'wait' : 'late'}">${p.score}/${p.total}</span><br><span class="feed-mist">${mins}</span></td>
          <td>${(p.mistakes || []).map((m) => (m.word ? `${esc(m.word)}${course.ru(m.word) ? ` — ${esc(course.ru(m.word))}` : ''} <span class="feed-mist">(${esc(m.label)})</span>` : `буква ${esc(m.label)}`)).join(', ')}</td></tr>`;
      }).join('') || '<tr><td colspan="4" class="muted">Занятий пока не было</td></tr>'}
      </tbody></table></div>
    </section>

    ${sync.online ? `<section class="panel"><h2>Ссылка для входа</h2><div id="lnk"></div>
      <button class="link" id="rm" style="justify-self:start;color:var(--coral)">Удалить ученика и весь прогресс</button></section>` : ''}`;

  document.getElementById('back').onclick = () => (location.hash = '#/');
  root.querySelectorAll('[data-del]').forEach((b) => (b.onclick = async () => {
    if (!confirm('Удалить задание?')) return;
    try { await api.delTask(b.dataset.del); studentView(code); } catch (e) { guard(e); }
  }));
  document.getElementById('task').onsubmit = async (e) => {
    e.preventDefault();
    const t = { code, unit: document.getElementById('u').value, mode: document.getElementById('m').value, due: document.getElementById('due').value || null, note: document.getElementById('note').value.trim() || null };
    try { await api.addTask(t); toast('Задание отправлено'); studentView(code); } catch (err) { guard(err); }
  };
  if (sync.online) {
    showLink(document.getElementById('lnk'), s.name, code);
    document.getElementById('rm').onclick = async () => {
      if (!confirm(`Удалить ${s.name}? Прогресс удалится навсегда.`)) return;
      try { await api.delStudent(code); location.hash = '#/'; } catch (e) { guard(e); }
    };
  }
}

function dictView() {
  // Every word of the course with its translation and the rule it practises.
  const rows = [];
  const seen = new Set();
  for (const pack of course.packs) for (const u of pack.units) {
    if (u.review) continue;
    for (const id of u.teams) {
      const t = course.teams.get(id);
      for (const w of [...t.words, ...t.read.map((x) => ({ w: x, e: '' }))]) {
        const k = w.w.toLowerCase();
        if (seen.has(k)) continue;
        seen.add(k);
        rows.push({ w: w.w, e: w.e, ru: course.ru(w.w), rule: t.kind === 'alphabet' ? t.label + t.lower : t.label, unit: `${pack.title}: ${u.title}`, isNew: !w.e });
      }
    }
  }
  root.innerHTML = `
    <button class="link back" id="back">← Все ученики</button>
    <header class="top"><div class="hello"><h1>Словарик</h1><p class="muted">${rows.length} слов. «Новое слово» — слова без картинки, которые ученица читает сама по правилу.</p></div></header>
    <div class="field"><input id="q" type="search" placeholder="Поиск: fish, рыба, sh, Урок 2" autocomplete="off"></div>
    <section class="panel"><div class="scroll"><table><thead><tr><th></th><th>Слово</th><th>Перевод</th><th>Правило</th><th>Урок</th></tr></thead><tbody id="rows"></tbody></table></div></section>`;
  document.getElementById('back').onclick = () => (location.hash = '#/');
  const draw = (q = '') => {
    q = q.trim().toLowerCase();
    document.getElementById('rows').innerHTML = rows.filter((r) => !q || [r.w, r.ru, r.rule, r.unit].some((x) => x.toLowerCase().includes(q)))
      .map((r) => `<tr><td>${r.e}</td><td><b>${esc(r.w)}</b>${r.isNew ? ' <span class="pill idle">новое слово</span>' : ''}</td><td>${esc(r.ru)}</td><td>${esc(r.rule)}</td><td class="feed-mist">${esc(r.unit)}</td></tr>`).join('');
  };
  document.getElementById('q').oninput = (e) => draw(e.target.value);
  draw();
}

boot().catch((e) => { console.error(e); root.innerHTML = '<p class="error">Не удалось загрузить данные. Обновите страницу.</p>'; });
