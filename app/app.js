/* ============================================================================
   График отпусков ОТП — 2027 · логика приложения
   Данные: window.APP_DATA (генерируется scripts/build_data.py)
   ============================================================================ */
'use strict';

const D = window.APP_DATA;
const CAL = D.calendar;
const TODAY_ISO = '2026-11-17';

const MONTHS_SHORT = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
const MONTHS_FULL = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
const MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const SEASONS = [
  { name: 'Зима', months: [12, 1, 2], icon: '❄' },
  { name: 'Весна', months: [3, 4, 5], icon: '✿' },
  { name: 'Лето', months: [6, 7, 8], icon: '☀' },
  { name: 'Осень', months: [9, 10, 11], icon: '🍂' },
];

/* ------------------------------------------------------------------ утилиты */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const safeUrl = (value) => {
  try { const url = new URL(value, location.href); return ['http:', 'https:'].includes(url.protocol) ? escapeHtml(url.href) : '#'; }
  catch (error) { return '#'; }
};
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const parse = (s) => new Date(s + 'T00:00:00');
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const dayDiff = (a, b) => Math.round((parse(b) - parse(a)) / 86400000);
const fmtDay = (s) => { const d = parse(s); return d.getDate() + ' ' + MONTHS_GEN[d.getMonth()]; };
const fmtRange = (a, b) => fmtDay(a) + ' — ' + fmtDay(b);
const pad = (n) => String(n).padStart(2, '0');
const plural = (n, one, few, many) => {
  const a = Math.abs(n) % 100, b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  if (b === 1) return one;
  return many;
};
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const fmtDateRu = (s) => (!s ? '—' : /(?:Z|[+-]\d{2}:\d{2})$/.test(s) ? new Intl.DateTimeFormat('ru-RU', { timeZone: 'Europe/Moscow', day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(s)) : s.slice(0, 10).split('-').reverse().join('.'));

/* карта дней календаря 2027 */
const DAYMAP = new Map(CAL.days.map((x) => [x.d, x]));
const DAY_IN_YEAR = (s) => dayDiff('2027-01-01', s);
const MONTH_START_PCT = MONTHS_FULL.map((_, i) => {
  const first = `2027-${pad(i + 1)}-01`;
  return (DAY_IN_YEAR(first) / 365) * 100;
});

/* --------------------------------------------------------------- состояние */
const LS_KEY = window.APP_CLOUD_STATE ? 'otp2027.cloud' : (D.meta.demo ? 'otp2027.demo' : 'otp2027.v3');
const DEFAULT_WEIGHTS = { lvl: 12, stars: 0.55, awards: 0.35, kpi: 14, tasks: 30, days: 0.9, summer: 10 };
const WEIGHT_META = [
  { key: 'lvl', label: 'Lvl', min: 0, max: 30, step: 1, fmt: (v) => '×' + v },
  { key: 'stars', label: 'Звёзды', min: 0, max: 2, step: 0.05, fmt: (v) => '×' + v.toFixed(2) },
  { key: 'awards', label: 'Награды', min: 0, max: 2, step: 0.05, fmt: (v) => '×' + v.toFixed(2) },
  { key: 'kpi', label: 'KPI', min: 0, max: 40, step: 1, fmt: (v) => '×' + v },
  { key: 'tasks', label: 'Закрытые задачи', min: 0, max: 80, step: 5, fmt: (v) => 'до ' + v },
  { key: 'days', label: 'Штраф за отгулянные дни', min: 0, max: 3, step: 0.1, fmt: (v) => '×' + v.toFixed(1) },
  { key: 'summer', label: 'Штраф за лето 2026', min: 0, max: 30, step: 1, fmt: (v) => '−' + v },
];

const state = {
  weights: { ...DEFAULT_WEIGHTS },
  minLvl: 2,
  headQueue: true,
  deferNewHire: true,
  entries: [],       // {id, empId, start, end, status:'draft'|'confirmed', createdAt, sub}
  tab: 'planner',
};

function deferredEmployee(employee) {
  return employee.isNewHire === true || (employee.role || '').includes('принят в 2026');
}

function applySavedState(saved) {
  if (saved.weights) state.weights = { ...DEFAULT_WEIGHTS, ...saved.weights };
  if (typeof saved.minLvl === 'number') state.minLvl = saved.minLvl;
  if (typeof saved.headQueue === 'boolean') state.headQueue = saved.headQueue;
  const previousKey = Object.keys(saved).find((key) => key.endsWith('Last') && typeof saved[key] === 'boolean');
  const deferred = typeof saved.deferNewHire === 'boolean' ? saved.deferNewHire : saved[previousKey];
  if (typeof deferred === 'boolean') state.deferNewHire = deferred;
  if (Array.isArray(saved.entries)) state.entries = saved.entries;
  if (saved.tab) state.tab = saved.tab;
}

function saveState(syncCloud = true) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify({
      weights: state.weights, minLvl: state.minLvl, headQueue: state.headQueue,
      deferNewHire: state.deferNewHire, entries: state.entries, tab: state.tab,
    }));
  } catch (e) { /* приватный режим — не критично */ }
  if (syncCloud) window.cloudBridge?.save(window.getVacationSnapshot());
}
window.getVacationSnapshot = () => ({
  data: D,
  state: { weights: state.weights, minLvl: state.minLvl, headQueue: state.headQueue,
    deferNewHire: state.deferNewHire, entries: state.entries, tab: state.tab },
});
function loadState() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return;
    const s = JSON.parse(raw);
    applySavedState(s);
  } catch (e) { /* ignore */ }
}

/* ------------------------------------------------------------ расчёт периода */
function calcPeriod(startISO, endISO) {
  if (!startISO || !endISO || parse(endISO) < parse(startISO)) return null;
  let cal = 0, holidays = 0, work = 0, off = 0;
  let d = parse(startISO), end = parse(endISO);
  while (d <= end) {
    const key = iso(d);
    const info = DAYMAP.get(key);
    cal++;
    if (!info || info.k === 'holiday') { holidays++; off++; }
    else if (info.k === 'weekend' || info.k === 'transferred') off++;
    else work++;
    d = addDays(d, 1);
    if (cal > 400) break;
  }
  return { cal, holidays, work, off, vac: cal - holidays, days: cal };
}

function entriesOf(empId, includeConfirmed = true) {
  return state.entries.filter((e) => e.empId === empId && (includeConfirmed || e.status === 'draft'));
}
function personDays(empId) {
  return state.entries.filter((e) => e.empId === empId)
    .reduce((s, e) => s + (calcPeriod(e.start, e.end)?.vac || 0), 0);
}
function overlaps(a, b) { return !(a.end < b.start || b.end < a.start); }

/* --------------------------------------------------------------- приоритеты */
function maxClosed() {
  return Math.max(1, ...D.employees.map((e) => (e.jira && e.jira.closed2026) || 0));
}

function scoreEmployee(e) {
  const w = state.weights, o = e.otp, j = e.jira || {}, v = e.vac2026;
  const parts = [];
  let total = 0;
  if (o) {
    const lvlPts = (o.lvl || 0) * w.lvl;
    parts.push({ key: 'lvl', label: 'Lvl ' + o.lvl, pts: lvlPts, pos: true });
    const starsPts = (o.stars || 0) * w.stars;
    parts.push({ key: 'stars', label: (o.stars || 0) + ' ⭐', pts: starsPts, pos: true });
    const awPts = (o.awardInstances || 0) * w.awards;
    parts.push({ key: 'awards', label: (o.awardInstances || 0) + ' наград', pts: awPts, pos: true });
    const kpiPts = Math.max(0, (o.kpi || 0) - 7) * w.kpi;
    parts.push({ key: 'kpi', label: 'KPI ' + (o.kpi ?? '—'), pts: kpiPts, pos: true });
    total += lvlPts + starsPts + awPts + kpiPts;
  }
  const taskPts = j.closed2026 ? (j.closed2026 / maxClosed()) * w.tasks : 0;
  if (j.closed2026) parts.push({ key: 'tasks', label: (j.closed2026) + ' закрыто', pts: taskPts, pos: true });
  total += taskPts;

  const daysTaken = v ? v.daysCal : 0;
  const daysPts = -Math.min(daysTaken, 40) * w.days;
  if (v) parts.push({ key: 'days', label: '−' + daysTaken + ' дн. в 2026', pts: daysPts, pos: false });
  total += daysPts;

  const summerPts = (v && v.summer) ? -w.summer : 0;
  if (v) parts.push({ key: 'summer', label: v.summer ? 'лето 2026 было' : 'лето 2026 свободно', pts: summerPts, pos: summerPts >= 0 });
  total += summerPts;

  return { total: Math.round(total * 10) / 10, parts };
}

function buildRanking() {
  const list = D.employees.map((e) => {
    const sc = scoreEmployee(e);
    const lvl = e.otp ? e.otp.lvl : null;
    return { ...e, score: sc.total, parts: sc.parts, eligible: lvl !== null && lvl >= state.minLvl, lvl };
  });
  const head = list.find((x) => x.isHead);
  const newcomer = list.find(deferredEmployee);
  let pool = list.filter((x) => !(state.headQueue && x.isHead) && !(state.deferNewHire && newcomer && x.id === newcomer.id));
  const byScore = (a, b) => b.score - a.score || (a.fio > b.fio ? 1 : -1);
  const first = pool.filter((x) => x.eligible).sort(byScore);
  const second = pool.filter((x) => !x.eligible).sort(byScore);
  const ordered = [...first, ...second];
  if (state.deferNewHire && newcomer) ordered.push(newcomer);
  ordered.forEach((x, i) => { x.place = i + 1; });
  return { ordered, head: state.headQueue ? head : null, eligibleCount: first.length };
}

/* ------------------------------------------------- рекомендации по периодам */
function monthScore(e, m) {
  const v = e.vac2026;
  const taken = v ? v.months.includes(m) : false;
  let s = 0;
  const why = [];
  if (taken) { s -= 2.2; why.push('в 2026 уже отдыхал в этом месяце'); }
  if ([6, 7, 8].includes(m)) {
    if (v && v.summer) { s -= 1.5; why.push('лето 2026 было — шанс ниже'); }
    else { s += 0.7; why.push('лето 2026 свободно — можно претендовать'); }
  }
  if (m === 12) { s -= 0.9; why.push('с 15.12 — только по согласованию'); }
  if (m === 1) { s -= 0.35; why.push('праздники: дней отпуска тратится меньше, но выбора мало'); }
  if (m === 5) { s += 0.35; why.push('майские праздники: 2 дня подарка'); }
  if (m === 9 || m === 10) { s += 0.2; why.push('осенью меньше конкуренции'); }
  if (m === 4) { s += 0.15; }
  return { s, why, taken };
}

function monthRecommendations(e, n = 3) {
  const rows = [];
  for (let m = 1; m <= 12; m++) rows.push({ m, ...monthScore(e, m) });
  const good = rows.slice().sort((a, b) => b.s - a.s).slice(0, n);
  const bad = rows.slice().sort((a, b) => a.s - b.s).slice(0, 2);
  return { good, bad };
}

/* Рекомендации с учётом очереди: месяцы, уже отданные старшим по приоритету,
   получают штраф — иначе всем достаётся июнь-июль и график не сходится. */
let RECS = {};
function computeAllRecommendations(sequence) {
  const load = new Map();
  const res = {};
  for (const e of sequence) {
    const rows = [];
    for (let m = 1; m <= 12; m++) {
      const base = monthScore(e, m);
      const used = load.get(m) || 0;
      const isSummer = m >= 6 && m <= 8;
      rows.push({ m, s: base.s - used * (isSummer ? 1.15 : 0.7), why: base.why, taken: base.taken, used });
    }
    const good = rows.slice().sort((a, b) => b.s - a.s).slice(0, 3);
    const bad = rows.slice().sort((a, b) => a.s - b.s).slice(0, 2);
    good.forEach((g) => load.set(g.m, (load.get(g.m) || 0) + 1));
    res[e.id] = { good, bad };
  }
  RECS = res;
  return res;
}

/* лучшие окна внутри месяца: максимум праздников */
function bestWindowsInMonth(m, len = 14) {
  const firstDay = parse(`2027-${pad(m)}-01`);
  const lastDay = parse(`2027-${pad(m + 1 > 12 ? 12 : m + 1)}-01`);
  const monthEnd = new Date(lastDay - 1);
  const out = [];
  let d = firstDay;
  while (d <= monthEnd) {
    const s = iso(d), e = iso(addDays(d, len - 1));
    const c = calcPeriod(s, e);
    if (c) out.push({ start: s, end: e, ...c, score: c.holidays * 100 + c.work * 0.1 });
    d = addDays(d, 1);
  }
  return out.sort((a, b) => b.score - a.score).slice(0, 2);
}

function bestWindowsYear(len = 14, top = 8) {
  const out = [];
  let d = parse('2027-01-01');
  const last = parse('2027-12-31');
  while (d <= last) {
    const s = iso(d), e = iso(addDays(d, len - 1));
    if (parse(e) > last) break;
    const c = calcPeriod(s, e);
    out.push({ start: s, end: e, ...c, score: c.holidays * 1000 + c.work });
    d = addDays(d, 1);
  }
  out.sort((a, b) => b.score - a.score);
  // подавляем «соседние» окна, чтобы не дублировать один и тот же праздник
  const picked = [];
  for (const w of out) {
    if (picked.length >= top) break;
    if (picked.some((p) => overlaps(p, w))) continue;
    picked.push(w);
  }
  return picked;
}

/* -------------------------------------------------------------- валидация */
function maxConcurrent() {
  const pct = D.rules.maxPercent;
  return Math.max(1, Math.floor(D.employees.length * pct / 100));
}

function validate() {
  const issues = [];
  const entries = state.entries.slice().sort((a, b) => a.start.localeCompare(b.start));
  const byId = Object.fromEntries(D.employees.map((e) => [e.id, e]));
  const name = (id) => escapeHtml(byId[id] ? byId[id].short : id);

  // 1. длина периода
  for (const e of entries) {
    const c = calcPeriod(e.start, e.end);
    if (!c) continue;
    if (c.vac < D.rules.partMin) {
      issues.push({ type: 'err', text: `<b>${name(e.empId)}</b>: период ${fmtRange(e.start, e.end)} — ${c.vac} дн. отпуска, минимум ${escapeHtml(D.rules.partMin)} дня.` });
    }
    if (c.vac > 21) {
      issues.push({ type: 'warn', text: `<b>${name(e.empId)}</b>: один период ${c.vac} дн. — по регламенту основная часть 14–21 день, остальное дробится.` });
    }
  }

  // 2. запрещённые пары
  for (const [a, b] of D.rules.forbiddenPairs) {
    for (const ea of entries.filter((x) => x.empId === a)) {
      for (const eb of entries.filter((x) => x.empId === b)) {
        if (overlaps(ea, eb)) {
          issues.push({ type: 'err', text: `<b>${name(a)} + ${name(b)}</b> не могут быть в отпуске одновременно (${fmtRange(ea.start, ea.end)} ∩ ${fmtRange(eb.start, eb.end)}).` });
        }
      }
    }
  }

  // 3. ЦО — только один
  const group = D.rules.exclusiveGroup;
  for (let i = 0; i < group.length; i++) {
    for (let j = i + 1; j < group.length; j++) {
      for (const ea of entries.filter((x) => x.empId === group[i])) {
        for (const eb of entries.filter((x) => x.empId === group[j])) {
          if (overlaps(ea, eb)) {
            issues.push({ type: 'err', text: `<b>ЦО: ${name(group[i])} и ${name(group[j])}</b> — из сотрудников ЦО одновременно может отсутствовать только один (${fmtRange(ea.start, ea.end)}).` });
          }
        }
      }
    }
  }

  // 4. 10% отдела одновременно
  const limit = maxConcurrent();
  const dayLoad = new Map();
  for (const e of entries) {
    let d = parse(e.start);
    const end = parse(e.end);
    while (d <= end) {
      const k = iso(d);
      if (!dayLoad.has(k)) dayLoad.set(k, new Set());
      dayLoad.get(k).add(e.empId);
      d = addDays(d, 1);
    }
  }
  const over = [...dayLoad.entries()].filter(([, s]) => s.size > limit).sort((a, b) => a[0].localeCompare(b[0]));
  if (over.length) {
    const ranges = [];
    for (const [d, set] of over) {
      const names = [...set].map(name).join(', ');
      const lastR = ranges[ranges.length - 1];
      if (lastR && dayDiff(lastR.end, d) === 1 && lastR.names === names) lastR.end = d;
      else ranges.push({ start: d, end: d, names });
    }
    ranges.slice(0, 4).forEach((r) => {
      issues.push({
        type: 'err',
        text: `<b>Лимит ${escapeHtml(D.rules.maxPercent)}% отдела</b> (максимум ${limit} ${plural(limit, 'человек', 'человека', 'человек')} одновременно) превышен ${fmtRange(r.start, r.end)}: ${r.names}.`,
      });
    });
    if (ranges.length > 4) issues.push({ type: 'err', text: `…и ещё ${ranges.length - 4} ${plural(ranges.length - 4, 'интервал', 'интервала', 'интервалов')} с превышением лимита.` });
  }

  // 5. декабрь 15–31
  for (const e of entries) {
    const from = D.rules.decemberRestricted.from;
    if (parse(e.end) >= parse(from) && e.start <= D.rules.decemberRestricted.to) {
      issues.push({ type: 'warn', text: `<b>${name(e.empId)}</b>: ${fmtRange(e.start, e.end)} попадает на 15–31 декабря — только по согласованию с руководителем ОТП.` });
    }
  }

  // 6. норма 28 дней на человека
  for (const e of D.employees) {
    const days = personDays(e.id);
    if (state.entries.length === 0) break;   // пустой график — не засоряем подсказки
    if (days === 0) {
      issues.push({ type: 'warn', text: `<b>${escapeHtml(e.short)}</b>: не внесено ни одного периода — план неполный.` });
    } else if (days > D.rules.totalDays) {
      issues.push({ type: 'warn', text: `<b>${escapeHtml(e.short)}</b>: ${days} дн. — больше нормы ${escapeHtml(D.rules.totalDays)}.` });
    } else if (days < D.rules.totalDays && days > 0) {
      const main = entries.filter((x) => x.empId === e.id).some((x) => (calcPeriod(x.start, x.end)?.vac || 0) >= 14);
      if (!main) issues.push({ type: 'warn', text: `<b>${escapeHtml(e.short)}</b>: нет периода 14+ дней (основная часть отпуска).` });
    }
  }

  const errors = issues.filter((i) => i.type === 'err').length;
  return { issues, errors, warnings: issues.filter((i) => i.type === 'warn').length };
}

/* ------------------------------------------------------------------- рендер */
function renderFacts() {
  const n = D.employees.length;
  const items = [
    ['Сотрудников', n],
    ['Норма отпуска', D.rules.totalDays + ' дн.'],
    ['Рабочих дней 2027', CAL.totalWork],
    ['Праздников', CAL.totalHolidays],
    ['Лимит одновременно', D.rules.maxPercent + '%'],
    ['Периодов внесено', state.entries.length],
  ];
  $('#facts').innerHTML = items.map(([k, v]) => `<div class="fact">${escapeHtml(k)}: <b>${escapeHtml(v)}</b></div>`).join('');
}

function renderSliders() {
  $('#sliders').innerHTML = WEIGHT_META.map((m) => `
    <label class="slider">
      <span class="row"><span>${m.label}</span><output>${escapeHtml(state.weights[m.key])}</output></span>
      <input type="range" min="${m.min}" max="${m.max}" step="${m.step}" value="${escapeHtml(state.weights[m.key])}" data-w="${m.key}">
    </label>`).join('');
  $$('#sliders input[type=range]').forEach((inp) => {
    inp.addEventListener('input', () => {
      state.weights[inp.dataset.w] = parseFloat(inp.value);
      inp.previousElementSibling.querySelector('output').textContent = inp.value;
      saveState();
      renderPriority(false);
    });
  });
}

function ringUpdate(count, total) {
  const pct = total ? count / total : 0;
  const el = $('#ringFg');
  el.style.strokeDashoffset = String(327 - 327 * pct);
  $('#ringNum').textContent = count;
}

function renderPriority(animate = true) {
  const expanded = new Set($$('#cards details[open]').map((card) => card.dataset.employee));
  const { ordered, head, eligibleCount } = buildRanking();
  const byId = Object.fromEntries(D.employees.map((e) => [e.id, e]));
  const maxScore = Math.max(1, ...ordered.map((x) => x.score));
  computeAllRecommendations(head ? [head, ...ordered] : ordered);

  // герой
  const first = ordered[0];
  if (first) {
    const lvlTxt = first.otp ? `Lvl ${first.otp.lvl}` : 'нет данных «Мои результаты»';
    $('#heroTitle').textContent = `Первым период выбирает ${first.short}`;
    $('#heroText').textContent = `${first.fio} — ${first.role.toLowerCase()}. ${lvlTxt}, ${first.otp ? first.otp.awardInstances + ' наград, KPI ' + first.otp.kpi : 'JIRA: ' + first.jira.closed2026 + ' закрытых задач'}`
      + `${first.vac2026 && first.vac2026.summer ? ', летом 2026 уже отдыхал' : ''}. `
      + `Далее по очереди: ${ordered.slice(1, 4).map((x) => x.short).join(' → ')}.`;
  }
  const chips = [
    head ? `★ ${head.short} — руководитель, утверждает график` : null,
    `Порог очереди: Lvl ≥ ${state.minLvl}`,
    `В 1-й очереди: ${eligibleCount} из ${ordered.length}`,
    `Максимум одновременно: ${D.rules.maxPercent}% (${maxConcurrent()})`,
  ].filter(Boolean);
  $('#heroChips').innerHTML = chips.map((c, i) => `<span class="chip" style="animation-delay:${i * 60}ms">${escapeHtml(c)}</span>`).join('');
  ringUpdate(eligibleCount, ordered.length);

  // карточки
  const cards = [];
  if (head) cards.push(cardHtml(head, 'head', true, 0, expanded.has(head.id)));

  ordered.forEach((e, idx) => {
    let cls = '';
    if (deferredEmployee(e) && state.deferNewHire) cls = 'forced';
    cards.push(cardHtml(e, cls, false, idx, expanded.has(e.id)));
  });
  $('#cards').innerHTML = cards.join('');

  // анимация баров и чисел
  requestAnimationFrame(() => {
    $$('#cards .bar i').forEach((b) => { b.style.width = b.dataset.w + '%'; });
    $$('#cards .score-num').forEach((el) => countUp(el, 0, parseFloat(el.dataset.v), 800));
  });
}

function countUp(el, from, to, ms) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    el.textContent = Number.isInteger(to) ? to : to.toFixed(1);
    return;
  }
  const t0 = performance.now();
  const step = (t) => {
    const k = Math.min(1, (t - t0) / ms);
    const v = from + (to - from) * (1 - Math.pow(1 - k, 3));
    el.textContent = (Number.isInteger(to) ? Math.round(v) : v.toFixed(1));
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function verdictOf(e, place) {
  if (e.isHead) return ['head', 'утверждает график'];
  if (deferredEmployee(e) && state.deferNewHire) return ['low', 'последний'];
  if (place <= 3) return ['top', 'первая тройка'];
  if (place <= 6) return ['mid', 'средний шанс'];
  return ['low', 'поздний выбор'];
}

function cardHtml(e, cls, isHead, idx = 0, expanded = false) {
  const place = e.place;
  const [vcl, vtxt] = verdictOf(e, place);
  const o = e.otp;
  const v = e.vac2026;
  const maxScore = Math.max(1, ...D.employees.map((x) => scoreEmployee(x).total));
  const w = clamp(Math.round((e.score / maxScore) * 100), 0, 100);
  const rec = RECS[e.id] || monthRecommendations(e);

  const otpCells = o ? `
      <div class="metric"><span>Lvl</span><b>${escapeHtml(o.lvl)}<small>${o.title ? ' · ' + escapeHtml(o.title) : ''}</small></b></div>
      <div class="metric"><span>Звёзды</span><b>${escapeHtml(o.stars)}</b></div>
      <div class="metric"><span>Награды</span><b>${escapeHtml(o.awardInstances)}</b></div>
      <div class="metric"><span>KPI</span><b>${escapeHtml(o.kpi ?? '—')}</b></div>`
    : `
      <div class="metric"><span>Lvl</span><b>—<small> нет данных</small></b></div>
      <div class="metric"><span>Звёзды</span><b>—</b></div>
      <div class="metric"><span>Награды</span><b>—</b></div>
      <div class="metric"><span>KPI</span><b>—</b></div>`;

  const why = [];
  if (o) why.push(`<b>Lvl ${escapeHtml(o.lvl)}</b> ${o.lvl >= state.minLvl ? '— порог пройден, 1-я очередь' : '— ниже порога ' + escapeHtml(state.minLvl) + ', 2-я очередь'}; ${escapeHtml(o.stars)} ⭐, ${escapeHtml(o.awardInstances)} наград, KPI ${escapeHtml(o.kpi)}.`);
  else why.push(`На «Мои результаты» данных нет — ${e.isHead ? 'руководитель отдела' : 'принят в 2026, KPI ещё не ведётся'}.`);
  why.push(`JIRA HELP: <b>${escapeHtml(e.jira.requestsYear ?? '—')}</b> запросов за год, <b>${escapeHtml(e.jira.closed2026 ?? '—')}</b> закрыто в 2026.`);
  if (v) why.push(`Отпуск 2026: <b>${escapeHtml(v.daysCal)} дн.</b> (${escapeHtml(v.monthNames.join(', '))}) — ${v.summer ? 'лето занято, шанс на лето 2027 ниже' : 'лето свободно'}.`);
  else why.push('В графике 2026 не было — отпуск не отгулян.');
  if (deferredEmployee(e)) why.push('Принят в 2026 году — по правилу №6 в конце очереди.');
  if (e.isHead) why.push('Как руководитель утверждает график — выбирает период вне общей очереди.');

  const recTags = rec.good.map((g) => `<span class="tag">${MONTHS_FULL[g.m - 1]}</span>`).join('');
  const badTags = rec.bad.map((g) => `<span class="tag bad">${MONTHS_FULL[g.m - 1]}</span>`).join('');

  const bd = e.parts.map((p) => `<span class="bd ${p.pts >= 0 ? 'pos' : 'neg'}">${escapeHtml(p.label)} <b>${p.pts >= 0 ? '+' : ''}${p.pts.toFixed(1)}</b></span>`).join('');

  const seasonTags = SEASONS.map((s) => {
    const ok = rec.good.some((g) => s.months.includes(g.m));
    return `<span class="tag ${ok ? '' : 'plain'}">${s.icon} ${s.name}</span>`;
  }).join('');

  return `
  <details class="glass card ${cls}" style="--i:${idx}" data-employee="${escapeHtml(e.id)}" ${expanded ? 'open' : ''}>
    <summary class="card-top">
      <div class="place ${e.isHead ? 'head-badge' : (cls === 'forced' ? 'muted-badge' : '')}">${e.isHead ? '★' : place}</div>
      <div class="who">
        <h4>${escapeHtml(e.fio)}</h4>
        <p>${escapeHtml(e.role)}</p>
      </div>
      <span class="summary-score">${e.score} баллов</span>
      <span class="verdict ${vcl}">${vtxt}</span>
    </summary>
    <div class="metrics">${otpCells}</div>
    <div class="bar-row">
      <div class="bar-head"><span>Итоговый балл приоритета</span><b class="score-num" data-v="${e.score}">${e.score}</b></div>
      <div class="bar"><i data-w="${w}"></i></div>
    </div>
    <div class="breakdown">${bd}</div>
    <ul class="why">${why.map((x) => `<li>${x}</li>`).join('')}</ul>
    <div class="rec">
      <h5>Рекомендуем взять</h5>
      <div class="tags">${recTags}</div>
      <h5 style="margin-top:10px">Лучше не брать</h5>
      <div class="tags">${badTags}</div>
      <h5 style="margin-top:10px">Сезоны</h5>
      <div class="tags">${seasonTags}</div>
    </div>
  </details>`;
}

/* -------------------------------------------------------------- планировщик */
let pick = { empId: null, start: '', end: '' };
let mobileMonth = 0;

function renderMobileSchedule() {
  const month = mobileMonth + 1;
  const first = `2027-${pad(month)}-01`;
  const last = `2027-${pad(month)}-${pad(new Date(2027, month, 0).getDate())}`;
  const entries = state.entries.filter((entry) => entry.start <= last && entry.end >= first)
    .slice().sort((a, b) => a.start.localeCompare(b.start));
  $('#mobileMonthName').textContent = MONTHS_FULL[mobileMonth] + ' 2027';
  $('#mobilePeriods').innerHTML = entries.length ? entries.map((entry) => {
    const employee = D.employees.find((person) => person.id === entry.empId);
    return `<div class="mobile-period"><b>${escapeHtml(employee ? employee.short : entry.empId)}</b>
      <span>${fmtRange(entry.start, entry.end)}</span>
      <span class="badge ${entry.status === 'confirmed' ? 'ok' : 'draft'}">${entry.status === 'confirmed' ? 'утверждён' : 'черновик'}</span></div>`;
  }).join('') : '<p class="muted">В этом месяце пока нет периодов.</p>';
}

function renderSelect() {
  const { ordered, head } = buildRanking();
  const opts = [];
  if (head) opts.push(`<option value="${escapeHtml(head.id)}">★ ${escapeHtml(head.fio)} — руководитель</option>`);
  ordered.forEach((e) => {
    const lvl = e.otp ? 'Lvl ' + e.otp.lvl : 'Lvl —';
    opts.push(`<option value="${escapeHtml(e.id)}">${e.place}. ${escapeHtml(e.fio)} — ${escapeHtml(lvl)}</option>`);
  });
  const sel = $('#empSelect');
  const prev = sel.value || pick.empId;
  sel.innerHTML = opts.join('');
  if (prev && [...sel.options].some((o) => o.value === prev)) sel.value = prev;
  pick.empId = sel.value;
  const cur = D.employees.find((e) => e.id === pick.empId);
  const r = ordered.find((e) => e.id === pick.empId);
  $('#pickHint').textContent = cur
    ? (cur.isHead && state.headQueue ? 'вне очереди' : (r ? 'место ' + r.place + ' из ' + ordered.length : ''))
    : '';
}

function renderQuick() {
  const { ordered } = buildRanking();
  const cur = D.employees.find((e) => e.id === pick.empId) || ordered[0];
  if (!cur) return;
  const rec = RECS[cur.id] || monthRecommendations(cur);
  const chips = rec.good.map((g) => {
    const w = bestWindowsInMonth(g.m, 14)[0];
    return `<button data-start="${w.start}" data-end="${w.end}">${MONTHS_FULL[g.m - 1]}: ${fmtRange(w.start, w.end)}</button>`;
  }).join('');
  $('#quickRanges').innerHTML = `<span class="muted" style="font-size:11px;align-self:center">Рекомендуемые окна:</span>` + chips
    + `<button data-start="2027-07-01" data-end="2027-07-14">Июль: 1–14</button>`;
  $$('#quickRanges button').forEach((b) => b.addEventListener('click', () => {
    $('#startDate').value = b.dataset.start;
    $('#endDate').value = b.dataset.end;
    updateCalc();
  }));
}

function updateCalc() {
  const s = $('#startDate').value, e = $('#endDate').value;
  pick.start = s; pick.end = e;
  const c = calcPeriod(s, e);
  if (!c) {
    $('#calcDays').textContent = '—'; $('#calcHolidays').textContent = '—';
    $('#calcWork').textContent = '—'; $('#calcCal').textContent = '—';
    $('#calcFormula').innerHTML = 'Выберите даты — посчитаю по ст. 120 ТК РФ';
    $('#addBtn').disabled = true;
    $('#suggestSub').textContent = '';
    return;
  }
  $('#calcDays').textContent = c.vac;
  $('#calcHolidays').textContent = c.holidays;
  $('#calcWork').textContent = c.work;
  $('#calcCal').textContent = c.cal;
  $('#calcFormula').innerHTML = `<b>${c.vac} ${plural(c.vac, 'день', 'дня', 'дней')} отпуска</b>`
    + (c.holidays ? ` + ${c.holidays} пр.д` : '')
    + ` · ${c.cal} календарных · ${c.work} рабочих · ${fmtRange(s, e)}`;
  $('#addBtn').disabled = false;
  const cur = D.employees.find((x) => x.id === pick.empId);
  const sub = suggestSubstitute(pick.empId, s, e);
  $('#suggestSub').textContent = cur && sub
    ? `Замещающий (авто): ${sub.short} — не в отпуске в этот период.`
    : '';
}

function suggestSubstitute(empId, s, e) {
  const busy = new Set();
  state.entries.forEach((x) => {
    if (x.empId !== empId && !(x.end < s || e < x.start)) busy.add(x.empId);
  });
  const cand = D.employees.filter((x) => x.id !== empId && !busy.has(x.id));
  const { ordered } = buildRanking();
  const ranked = ordered.filter((x) => cand.some((c) => c.id === x.id));
  return ranked[0] || null;
}

function addEntry() {
  const s = pick.start, e = pick.end;
  const c = calcPeriod(s, e);
  if (!c) return;
  const emp = D.employees.find((x) => x.id === pick.empId);
  const sub = suggestSubstitute(pick.empId, s, e);
  state.entries.push({
    id: 'e' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    empId: pick.empId, start: s, end: e, status: 'draft',
    sub: sub ? sub.id : null, createdAt: Date.now(),
  });
  saveState();
  renderAll();
  toast(`Добавлено: ${emp.short}, ${fmtRange(s, e)} — ${c.vac} дн.${c.holidays ? ' + ' + c.holidays + ' пр.д' : ''}`);
}

function renderGantt() {
  const { ordered, head } = buildRanking();
  const rows = head ? [head, ...ordered] : ordered;
  const hol = CAL.holidays.map((h) => DAY_IN_YEAR(h) / 365 * 100);
  const html = [];
  html.push('<div class="gantt-inner">');

  // заголовок месяцев — позиции по фактическим датам (365 дней года)
  html.push('<div class="gantt-months"><div></div><div class="gantt-hdr">' +
    MONTHS_SHORT.map((m, i) => {
      const left = MONTH_START_PCT[i];
      const right = i < 11 ? MONTH_START_PCT[i + 1] : 100;
      return `<span style="position:absolute;left:${left}%;width:${right - left}%">${m}</span>`;
    }).join('') + '</div></div>');

  for (const p of rows) {
    const bars = state.entries.filter((x) => x.empId === p.id).map((x) => {
      const left = DAY_IN_YEAR(x.start) / 365 * 100;
      const width = ((dayDiff(x.start, x.end) + 1) / 365) * 100;
      const c = calcPeriod(x.start, x.end);
      const cls = x.status === 'confirmed' ? 'confirmed' : '';
      return `<div class="gantt-bar ${cls}" style="left:${left}%;width:${Math.max(width, 0.7)}%"
        title="${escapeHtml(p.short)}: ${fmtRange(x.start, x.end)} · ${c ? c.vac + ' дн.' : ''}${c && c.holidays ? ' +' + c.holidays + ' пр.д' : ''}"></div>`;
    }).join('');
    html.push(`<div class="gantt-row">
      <div class="gantt-name"><b>${escapeHtml(p.short)}</b>${p.isHead ? ' ★' : ''}</div>
      <div class="gantt-track">
        <div class="grid">${MONTH_START_PCT.map((l, i) => `<i style="position:absolute;top:0;bottom:0;left:${i === 0 ? 0 : l}%;width:1px;background:#e3e9f1"></i>`).join('')}</div>
        ${hol.map((l) => `<div class="gantt-hol" style="left:${l}%"></div>`).join('')}
        ${bars}
      </div></div>`);
  }
  html.push('</div>');
  $('#gantt').innerHTML = html.join('');
  renderMobileSchedule();
}

function renderIssues() {
  const { issues, errors, warnings } = validate();
  $('#issueBadges').innerHTML = `
    <span class="pill ${errors ? 'bad' : 'ok'}">${errors ? errors + ' ' + plural(errors, 'ошибка', 'ошибки', 'ошибок') : 'ошибок нет'}</span>
    <span class="pill ${warnings ? 'warn' : ''}">${warnings ? warnings + ' ' + plural(warnings, 'предупреждение', 'предупреждения', 'предупреждений') : 'предупреждений нет'}</span>`;
  if (!issues.length) {
    $('#issues').innerHTML = `<li class="ok">✓ Ограничения соблюдены, график можно утверждать.</li>`;
  } else {
    $('#issues').innerHTML = issues.map((i) => `<li class="${i.type === 'err' ? 'err' : 'warn'}">${i.type === 'err' ? '✕' : '!'} <span>${i.text}</span></li>`).join('');
  }
  $('#confirmBtn').disabled = errors > 0 || state.entries.filter((e) => e.status === 'draft').length === 0;
  return { errors };
}

function renderTable() {
  const byId = Object.fromEntries(D.employees.map((e) => [e.id, e]));
  const rows = state.entries.slice().sort((a, b) => a.start.localeCompare(b.start));
  $('#entriesCount').textContent = rows.length ? `(${rows.length})` : '';
  const tb = $('#entriesTable tbody');
  if (!rows.length) {
    tb.innerHTML = `<tr><td colspan="7" class="muted" style="padding:22px 10px">Пока пусто. Выберите сотрудника, даты и нажмите «Добавить в график».</td></tr>`;
  } else {
    tb.innerHTML = rows.map((x) => {
      const c = calcPeriod(x.start, x.end);
      const emp = byId[x.empId];
      const sub = x.sub ? byId[x.sub] : null;
      const bad = (c.vac < D.rules.partMin);
      return `<tr>
        <td><b>${escapeHtml(emp ? emp.short : x.empId)}</b><div class="muted" style="font-size:10.5px">${emp ? escapeHtml(emp.role.slice(0, 34) + (emp.role.length > 34 ? '…' : '')) : ''}</div></td>
        <td class="num">${fmtRange(x.start, x.end)}</td>
        <td class="num"><b>${c.vac}</b>${c.holidays ? ` <span class="plus-prod">+${c.holidays} пр.д</span>` : ''}</td>
        <td class="num muted">${c.work}</td>
        <td class="muted">${escapeHtml(sub ? sub.short : '—')}</td>
        <td><span class="badge ${x.status === 'confirmed' ? 'ok' : (bad ? 'bad' : 'draft')}">${x.status === 'confirmed' ? 'утверждён' : 'черновик'}</span></td>
        <td style="text-align:right">${x.status === 'confirmed' && window.APP_CLOUD_STATE
          ? `<button class="ghost" data-unconfirm="${escapeHtml(x.id)}">Снять утверждение</button>`
          : `<button class="del" data-del="${escapeHtml(x.id)}" title="Удалить">×</button>`}</td>
      </tr>`;
    }).join('');
  }
  $$('#entriesTable .del').forEach((b) => b.addEventListener('click', () => {
    state.entries = state.entries.filter((x) => x.id !== b.dataset.del);
    saveState(); renderAll(); toast('Период удалён');
  }));
  $$('#entriesTable [data-unconfirm]').forEach((b) => b.addEventListener('click', async () => {
    if (!window.confirm('Снять утверждение этого периода?')) return;
    b.disabled = true;
    try { await window.cloudBridge.unconfirm(b.dataset.unconfirm); }
    catch (e) { b.disabled = false; toast(e.message || 'Не удалось снять утверждение', true); }
  }));

  const { ordered, head } = buildRanking();
  const list = head ? [head, ...ordered] : ordered;
  $('#progressRows').innerHTML = list.map((p) => {
    const days = personDays(p.id);
    const pct = clamp(Math.round(days / D.rules.totalDays * 100), 0, 100);
    return `<div class="prog ${days > D.rules.totalDays ? 'over' : ''}">
      <div class="top"><span>${escapeHtml(p.short)}</span><b>${days} / ${escapeHtml(D.rules.totalDays)}</b></div>
      <div class="bar"><i style="width:${pct}%"></i></div>
    </div>`;
  }).join('');
}

/* ---------------------------------------------------------------- календарь */
function renderCalendar() {
  const entriesByDay = new Map();
  state.entries.forEach((x) => {
    let d = parse(x.start);
    const end = parse(x.end);
    while (d <= end) {
      const k = iso(d);
      if (!entriesByDay.has(k)) entriesByDay.set(k, []);
      entriesByDay.get(k).push(x.empId);
      d = addDays(d, 1);
    }
  });
  const html = [];
  for (let m = 1; m <= 12; m++) {
    const first = parse(`2027-${pad(m)}-01`);
    const daysInMonth = new Date(2027, m, 0).getDate();
    const offset = (first.getDay() + 6) % 7;
    const stat = CAL.months[m - 1];
    const cells = [];
    for (let i = 0; i < offset; i++) cells.push('<div class="day empty"></div>');
    for (let d = 1; d <= daysInMonth; d++) {
      const key = `2027-${pad(m)}-${pad(d)}`;
      const info = DAYMAP.get(key);
      const who = entriesByDay.get(key) || [];
      const dots = who.slice(0, 4).map(() => '<i></i>').join('');
      const title = `${d} ${MONTHS_GEN[m - 1]}` + (who.length ? ' · ' + who.map((id) => (D.employees.find((e) => e.id === id) || {}).short).join(', ') : '');
      cells.push(`<div class="day ${escapeHtml(info ? info.k : 'work')}${key === TODAY_ISO ? ' today' : ''}" title="${escapeHtml(title)}">${d}${who.length ? `<span class="dots">${dots}</span>` : ''}</div>`);
    }
    html.push(`<div class="month glass" style="--i:${m - 1}">
      <h4>${MONTHS_FULL[m - 1]} <span>${escapeHtml(stat.work)} раб. · ${escapeHtml(stat.off)} вых.</span></h4>
      <div class="dow"><div>пн</div><div>вт</div><div>ср</div><div>чт</div><div>пт</div><div>сб</div><div>вс</div></div>
      <div class="days">${cells.join('')}</div>
    </div>`);
  }
  $('#months').innerHTML = html.join('');

  const wins = bestWindowsYear(14, 8);
  $('#windows').innerHTML = wins.map((w, i) => `
    <div class="win" style="animation-delay:${i * 45}ms">
      <div class="dates">${fmtRange(w.start, w.end)}</div>
      <div class="meta">
        <span>${w.vac} дн. отпуска</span>
        ${w.holidays ? `<span class="gift">+${w.holidays} пр.д</span>` : ''}
        <span>${w.work} раб.</span>
        <span>${w.cal} кал.</span>
      </div>
    </div>`).join('');
}

/* ------------------------------------------------------------------ правила */
function renderRules() {
  const blocks = [
    {
      h: 'Из регламента (Confluence)',
      items: [
        'Ежегодный отпуск — <b>28 календарных дней</b>.',
        'Одновременно в отпуске — <b>не более 10%</b> сотрудников отдела.',
        'Один период — <b>14–21 день</b>, минимальная продолжительность периода — <b>3 дня</b>.',
        'С 15 по 31 декабря — только по согласованию с руководителем ОТП.',
        'График на следующий год составляется <b>с октября по ноябрь</b> и утверждается руководителем ОТП и генеральным директором.',
        'Дополнительный отпуск компенсируется при закрытии финансового года.',
      ],
    },
    {
      h: 'Комбинации, которые нельзя',
      items: [
        ...D.rules.forbiddenPairs.map(([a, b]) => {
          const names = [a, b].map((id) => D.employees.find((employee) => employee.id === id)?.short || id);
          return `${escapeHtml(names.join(' + '))} — одновременно нет.`;
        }),
        ...(D.rules.exclusiveGroup.length ? ['Сотрудники ЦО — одновременно только один.'] : []),
        ...(!D.rules.forbiddenPairs.length && !D.rules.exclusiveGroup.length ? ['Ограничения для отдельных сотрудников не заданы.'] : []),
      ],
    },
    {
      h: 'Как считается день отпуска',
      items: [
        'Дни отпуска считаются в календарных днях, <b>кроме нерабочих праздничных</b> (ст. 120 ТК РФ).',
        'Праздник внутри периода продлевает отпуск: <b>«14 дней + 1 пр.д»</b>.',
        'Перенесённые выходные (ПП РФ № 1187) праздниками не являются — входят в дни отпуска.',
        'В 2027 году 14 нерабочих праздничных дней и 247 рабочих дней.',
      ],
    },
    {
      h: 'Приоритет выбора периода',
      items: [
        'Lvl на «Мои результаты» достиг порога — 1-я очередь.',
        'Дальше — награды и KPI с того же сайта.',
        'Затем — закрытые задачи за год (JIRA HELP).',
        'Кто больше отгулял — ниже приоритет.',
        'Кто был летом 2026 — ниже шанс на лето 2027.',
        'Сотрудник, принятый в 2026 году, — последний.',
      ],
    },
  ];
  $('#rulesGrid').innerHTML = blocks.map((b) => `
    <div class="glass rule"><h4>${b.h}</h4><ul>${b.items.map((i) => `<li>${i}</li>`).join('')}</ul></div>`).join('');

  const s = D.meta.sources;
  $('#sources').innerHTML = [
    `<li>График отпусков 2026: <a href="${safeUrl(s.confluence2026)}" target="_blank" rel="noopener noreferrer">Confluence, pageId 430081574</a></li>`,
    `<li>Регламент по отпускам: <a href="${safeUrl(s.rules)}" target="_blank" rel="noopener noreferrer">Confluence, pageId 170564048</a></li>`,
    `<li>Запросы и закрытые задачи: <a href="${safeUrl(s.jira)}" target="_blank" rel="noopener noreferrer">JIRA, проект HELP</a></li>`,
    `<li>Lvl, звёзды, награды, KPI: сайт «Мои результаты» (${escapeHtml(s.otp)})</li>`,
    `<li>Производственный календарь 2027: <a href="${safeUrl(s.calendar)}" target="_blank" rel="noopener noreferrer">ПП РФ от 17.09.2026 № 1187</a>, свод — klerk.ru</li>`,
  ].join('');
}

/* ---------------------------------------------------------------- доступы */
const API_BASE = (() => {
  const cfg = (window.APP_CONFIG && window.APP_CONFIG.apiBase) || '';
  if (cfg) return cfg.replace(/\/$/, '');
  return location.protocol === 'file:' ? null : '';
})();
let apiOnline = false;
let tokensCache = [];
const issuedCloudTokens = new Map();
let accessForm = { empId: null, cycle: 1 };

async function api(path, opts = {}) {
  if (window.APP_CLOUD_STATE) {
    if (path === '/api/tokens' && !opts.method) {
      const tokens = await window.cloudBridge.rpc('list_vacation_invites');
      return { tokens: tokens.map((t) => ({ ...t, token: t.status === 'open' ? issuedCloudTokens.get(`${t.empId}:${t.cycle}`) : null })) };
    }
    if (path === '/api/tokens' && opts.method === 'POST') {
      const p = JSON.parse(opts.body);
      await window.cloudBridge.refreshRevision();
      const result = await window.cloudBridge.rpc('create_vacation_invite', {
        p_employee_id: p.empId, p_cycle: p.cycle, p_min_days: p.minDays, p_max_days: p.maxDays,
        p_months: p.months, p_comment: p.comment, p_expires_days: p.expiresDays,
      });
      issuedCloudTokens.set(`${p.empId}:${p.cycle}`, result.token);
      return result;
    }
    if (path.startsWith('/api/tokens/') && opts.method === 'DELETE') {
      return window.cloudBridge.rpc('revoke_vacation_invite', { p_id: decodeURIComponent(path.slice('/api/tokens/'.length)) });
    }
    throw new Error('Действие недоступно в облаке.');
  }
  if (API_BASE === null) throw new Error('offline');
  const r = await fetch(API_BASE + path, {
    ...opts,
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(data.error || 'Ошибка API'), { data, status: r.status });
  return data;
}

async function checkApi() {
  if (window.APP_CLOUD_STATE) { apiOnline = true; return; }
  if (D.meta.demo) return;
  try {
    await api('/api/ping');
    apiOnline = true;
  } catch (e) {
    apiOnline = false;
  }
}

function baseUrl() {
  if (window.APP_CLOUD_STATE && window.APP_CONFIG?.publicSiteUrl) {
    const publicUrl = new URL(window.APP_CONFIG.publicSiteUrl);
    if (publicUrl.protocol !== 'https:') throw new Error('Адрес сайта должен использовать HTTPS.');
    return publicUrl.origin + publicUrl.pathname.replace(/\/?$/, '/');
  }
  if (location.protocol === 'file:') return 'http://127.0.0.1:8765/';
  const p = location.pathname;
  return location.origin + p.slice(0, p.lastIndexOf('/') + 1);
}

function renderAccessForm() {
  const { ordered, head } = buildRanking();
  const opts = [];
  const list = head ? [head, ...ordered] : ordered;
  list.forEach((e) => {
    const rem = Math.max(0, D.rules.totalDays - personDays(e.id));
    const lvl = e.otp ? 'Lvl ' + e.otp.lvl : 'Lvl —';
    opts.push(`<option value="${escapeHtml(e.id)}">${e.isHead ? '★ ' : (e.place + '. ')}${escapeHtml(e.fio)} — ${escapeHtml(lvl)}, осталось ${rem} дн.</option>`);
  });
  const sel = $('#accessEmp');
  const prev = sel.value || accessForm.empId;
  sel.innerHTML = opts.join('');
  if (prev && [...sel.options].some((o) => o.value === prev)) sel.value = prev;
  accessForm.empId = sel.value;
  const cur = D.employees.find((e) => e.id === accessForm.empId);
  const ranked = ordered.find((e) => e.id === accessForm.empId);
  $('#accessQueue').textContent = cur
    ? (cur.isHead ? 'вне очереди' : (ranked ? 'очередь ' + ranked.place + ' из ' + ordered.length : ''))
    : '';

  // месяцы: рекомендации по умолчанию
  const saved = accessForm.months;
  if (!saved && cur) {
    const rec = RECS[cur.id] || monthRecommendations(cur);
    accessForm.months = rec.good.map((g) => g.m);
    const hintEl = $('#monthsHint');
    if (hintEl) hintEl.textContent = 'рекомендуем: ' + rec.good.map((g) => MONTHS_FULL[g.m - 1].toLowerCase()).join(', ');
  }
  renderMonthChips();
  if (accessForm.cycle === 1) {
    $('#accessMin').value = 14; $('#accessMax').value = 21;
  } else {
    const rem = Math.max(3, D.rules.totalDays - personDays(cur ? cur.id : ''));
    $('#accessMin').value = 3; $('#accessMax').value = rem;
  }
  const next = ordered.filter((x) => !state.entries.some((en) => en.empId === x.id)).slice(0, 4);
  $('#queueNext').innerHTML = next.length
    ? 'Ещё без периода в графике: ' + next.map((x) => `<b>${escapeHtml(x.short)}</b>`).join(' → ')
    : 'Все сотрудники уже получили хотя бы один период.';
}

function renderMonthChips() {
  const set = new Set(accessForm.months || []);
  $('#accessMonths').innerHTML = MONTHS_FULL.map((m, i) => `
    <button type="button" data-m="${i + 1}" class="${set.has(i + 1) ? 'on' : ''}">${m.slice(0, 3)}</button>`).join('')
    + `<button type="button" data-m="all" class="ghost" style="font-size:11px">Все</button>`;
  $$('#accessMonths button').forEach((b) => b.addEventListener('click', () => {
    if (b.dataset.m === 'all') {
      accessForm.months = Array.from({ length: 12 }, (_, i) => i + 1);
    } else {
      const m = +b.dataset.m;
      const s = new Set(accessForm.months || []);
      s.has(m) ? s.delete(m) : s.add(m);
      accessForm.months = [...s].sort((a, b2) => a - b2);
    }
    renderMonthChips();
  }));
}

function buildMessage(info, tokenInfo) {
  const e = D.employees.find((x) => x.id === info.empId) || { fio: info.emp.short, short: info.emp.short };
  const place = (() => {
    const { ordered, head } = buildRanking();
    if (head && head.id === info.empId) return 'вне очереди (руководитель)';
    const r = ordered.find((x) => x.id === info.empId);
    return r ? `${r.place}-я из ${ordered.length}` : '—';
  })();
  const months = (info.months || []).length === 12 ? 'любой месяц' : (info.months || []).map((m) => MONTHS_FULL[m - 1]).join(', ');
  const exp = info.expiresAt ? fmtDateRu(info.expiresAt) : '—';
  const link = baseUrl() + 'pick.html#t=' + info.token;
  const cycleText = info.cycle === 1
    ? `один период ${info.minDays}–${info.maxDays} календарных дней`
    : `остаток ${info.minDays}–${info.maxDays} дней (можно несколькими периодами, минимум 3 дня каждый)`;
  return `Здравствуйте, ${e.fio.split(' ')[1] || ''} ${e.fio.split(' ')[2] || ''}!

Составляем график отпусков на 2027 год. Ваша очередь выбора — ${place}.

Что выбрать: ${cycleText}.
Разрешённые месяцы: ${months}.${info.comment ? '\nКомментарий: ' + info.comment : ''}

Ссылка (действует до ${exp}, выбор делается один раз):
${link}

Как считаются дни: отпуск в календарных днях, нерабочие праздничные дни в него не входят и продлевают отдых — в форме это видно как «14 дней + 1 пр.д».
Одновременно в отпуске может быть не более 10% отдела, поэтому форма проверит занятость и не даст выбрать конфликтный период.

Если ссылка не открывается или период нужно поменять — напишите руководителю ОТП.`;
}

async function renderTokens() {
  if (!apiOnline) {
    $('#tokensTable tbody').innerHTML = '<tr><td colspan="7" class="muted" style="padding:18px 10px"></td></tr>';
    $('#tokensTable tbody td').textContent = D.meta.demo
      ? 'Войдите как руководитель, чтобы увидеть ссылки.'
      : 'Для работы со ссылками войдите в облако или запустите локальный сервер.';
    $('#tokensCount').textContent = '';
    return;
  }
  try {
    const data = await api('/api/tokens');
    tokensCache = data.tokens || [];
  } catch (e) {
    tokensCache = [];
    $('#tokensTable tbody').innerHTML = '<tr><td colspan="7" class="muted"></td></tr>';
    $('#tokensTable tbody td').textContent = 'Не удалось загрузить ссылки: ' + e.message;
    $('#tokensCount').textContent = '';
    return;
  }
  $('#tokensCount').textContent = tokensCache.length ? `(${tokensCache.length})` : '';
  const tb = $('#tokensTable tbody');
  if (!tokensCache.length) {
    tb.innerHTML = `<tr><td colspan="7" class="muted" style="padding:18px 10px">Ссылок пока нет — выдайте первую слева.</td></tr>`;
    return;
  }
  const byId = Object.fromEntries(D.employees.map((e) => [e.id, e]));
  tb.innerHTML = tokensCache.map((t) => {
    const emp = byId[t.empId] || t.emp || { short: t.empId, fio: t.empId };
    const months = (t.months || []).length === 12 ? 'любой' : (t.months || []).map((m) => MONTHS_SHORT[m - 1]).join(', ');
    const st = t.status === 'open' ? 'ожидает' : t.status === 'submitted' ? 'выбрал' : t.status === 'revoked' ? 'погашена' : 'истекла';
    const cls = t.status === 'open' ? 'draft' : t.status === 'submitted' ? 'ok' : 'bad';
    const sel = t.selection && t.selection.periods
      ? t.selection.periods.map((p) => fmtRange(p.start, p.end)).join('; ') + ` (${escapeHtml(t.selection.total)} дн.)`
      : '—';
    return `<tr>
      <td><b>${escapeHtml(emp.short)}</b></td>
      <td class="muted">${t.cycle === 1 ? 'осн.' : 'остаток'}</td>
      <td class="muted" style="font-size:11.5px">${t.minDays}–${t.maxDays} дн.<br>${months}</td>
      <td class="num muted">${fmtDateRu(t.expiresAt)}</td>
      <td><span class="badge ${cls}">${st}</span></td>
      <td class="muted" style="font-size:11.5px">${sel}</td>
      <td><div class="token-actions">
        ${t.status === 'open' && t.token ? `<button class="ghost" data-copy="${escapeHtml(t.token)}">ссылка</button>` : ''}
        ${t.status === 'submitted' ? `<button class="ghost" data-apply="${escapeHtml(t.id || t.token)}">в график</button>` : ''}
        ${t.status !== 'revoked' && (!window.APP_CLOUD_STATE || t.status !== 'submitted') ? `<button class="ghost danger" data-revoke="${escapeHtml(t.id || t.token)}">×</button>` : ''}
      </div></td>
    </tr>`;
  }).join('');

  $$('[data-copy]').forEach((b) => b.addEventListener('click', () => {
    const t = tokensCache.find((x) => x.token === b.dataset.copy);
    const msg = buildMessage({ ...t, token: t.token }, t);
    showMessage(msg);
    copyText(msg);
  }));
  $$('[data-apply]').forEach((b) => b.addEventListener('click', () => applyToken(b.dataset.apply)));
  $$('[data-revoke]').forEach((b) => b.addEventListener('click', () => revokeToken(b.dataset.revoke)));
}

function showMessage(text) {
  $('#messageCard').hidden = false;
  $('#messageText').textContent = text;
  $('#messageCard').scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'nearest' });
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast('Скопировано — можно отправить сотруднику');
  } catch (e) {
    toast('Выделите текст в окне сообщения и скопируйте вручную', true);
  }
}

async function issueAccess() {
  if (!apiOnline) return toast('Сначала запустите server/app.py', true);
  const empId = $('#accessEmp').value;
  const min = parseInt($('#accessMin').value, 10) || 14;
  const max = parseInt($('#accessMax').value, 10) || 21;
  const months = accessForm.months && accessForm.months.length ? accessForm.months : Array.from({ length: 12 }, (_, i) => i + 1);
  if (min > max) return toast('«Дней от» больше «дней до»', true);
  try {
    const data = await api('/api/tokens', {
      method: 'POST',
      body: JSON.stringify({
        empId, cycle: accessForm.cycle, minDays: min, maxDays: max, months,
        expiresDays: parseInt($('#accessExpires').value, 10) || 7,
        comment: $('#accessComment').value || '',
      }),
    });
    const info = { empId, cycle: accessForm.cycle, minDays: min, maxDays: max, months,
      expiresAt: data.expiresAt, comment: $('#accessComment').value || '',
      token: data.token, emp: (D.employees.find((x) => x.id === empId) || {}) };
    showMessage(buildMessage(info, data));
    await renderTokens();
    toast('Ссылка создана');
  } catch (e) {
    toast(e.message || 'Не удалось создать ссылку', true);
  }
}

async function applyToken(token) {
  const t = tokensCache.find((x) => (x.id || x.token) === token);
  if (!t || !t.selection) return;
  if (window.APP_CLOUD_STATE) {
    try { await window.cloudBridge.refreshRevision(); }
    catch (e) { toast(e.message, true); return; }
  }
  const emp = D.employees.find((x) => x.id === t.empId);
  let added = 0;
  (t.selection.periods || []).forEach((p) => {
    const dup = state.entries.some((x) => x.empId === t.empId && x.start === p.start && x.end === p.end);
    if (dup) return;
    state.entries.push({
      id: 'e' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      empId: t.empId, start: p.start, end: p.end, status: 'draft',
      sub: null, createdAt: Date.now(), source: 'employee',
    });
    added++;
  });
  saveState();
  renderAll();
  toast(`Добавлено периодов от ${emp ? emp.short : t.empId}: ${added}`);
}

async function revokeToken(token) {
  try {
    await api('/api/tokens/' + encodeURIComponent(token), { method: 'DELETE' });
    await renderTokens();
    toast('Ссылка погашена');
  } catch (e) { toast('Не удалось погасить', true); }
}

async function publishSchedule() {
  if (!apiOnline) return toast('Сначала запустите server/app.py', true);
  try {
    await api('/api/schedule', {
      method: 'POST',
      body: JSON.stringify({ entries: state.entries.map((x) => ({ empId: x.empId, start: x.start, end: x.end, status: x.status })) }),
    });
    toast('График опубликован — сотрудники видят занятые периоды');
  } catch (e) { toast('Не удалось опубликовать', true); }
}

function renderAccess() {
  renderAccessForm();
  renderTokens();
  const hint = $('#apiHint');
  $('#publishSchedule').hidden = !!window.APP_CLOUD_STATE;
  if (!apiOnline) {
    hint.className = 'hint api-off';
    hint.textContent = D.meta.demo
      ? 'Для выдачи ссылок войдите как руководитель.'
      : 'Для выдачи ссылок войдите в облачный график или запустите локальный сервер.';
    $('#issueBtn').disabled = true;
  } else {
    hint.className = 'hint';
    hint.textContent = window.APP_CLOUD_STATE
      ? 'Скопируйте ссылку сразу после выдачи. Если она потеряна, выдайте новую.'
      : 'Ссылки одноразовые: новая ссылка автоматически гасит предыдущую для этого сотрудника и цикла.';
    $('#issueBtn').disabled = false;
  }
}


function toMarkdown() {
  const byId = Object.fromEntries(D.employees.map((e) => [e.id, e]));
  const rows = state.entries.slice().sort((a, b) => a.start.localeCompare(b.start));
  let out = '||ФИО|Период|Дней|пр.д.|Рабочих|ВрИО|Статус||\n';
  rows.forEach((x) => {
    const c = calcPeriod(x.start, x.end);
    const emp = byId[x.empId];
    out += `|${emp.fio}|${fmtRange(x.start, x.end)}|${c.vac}|${c.holidays || '—'}|${c.work}|${x.sub ? byId[x.sub].fio : '—'}|${x.status === 'confirmed' ? 'утверждён' : 'черновик'}|\n`;
  });
  out += `\nИтого периодов: ${rows.length}. Праздничных дней внутри периодов: ${rows.reduce((s, x) => s + (calcPeriod(x.start, x.end)?.holidays || 0), 0)}.\n`;
  out += `\nИсточник: производственный календарь РФ 2027 (ПП РФ от 17.09.2026 № 1187). Дни отпуска — календарные, без нерабочих праздничных (ст. 120 ТК РФ).\n`;
  return out;
}

function toast(msg, isErr) {
  const t = $('#toast');
  t.textContent = msg;
  t.className = 'toast show' + (isErr ? ' err' : '');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { t.className = 'toast'; }, 3200);
}

function download(name, text, mime = 'application/json') {
  const blob = new Blob([text], { type: mime + ';charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1500);
}

/* ------------------------------------------------------------------- общее */
function renderAll() {
  renderFacts();
  renderPriority();
  renderSelect();
  renderQuick();
  updateCalc();
  renderGantt();
  renderIssues();
  renderTable();
  renderCalendar();
  renderRules();
  if ($('#panel-access')) renderAccess();
}

function bindUi() {
  // табы
  $$('#tabs .tab').forEach((b) => b.addEventListener('click', () => {
    state.tab = b.dataset.tab;
    $$('#tabs .tab').forEach((x) => x.classList.toggle('active', x === b));
    $$('.panel').forEach((p) => p.classList.toggle('active', p.id === 'panel-' + b.dataset.tab));
    saveState(false);
  }));

  // веса
  $('#resetWeights').addEventListener('click', () => {
    state.weights = { ...DEFAULT_WEIGHTS };
    renderSliders(); saveState(); renderAll();
    toast('Веса сброшены по умолчанию');
  });
  $('#minLvl').addEventListener('input', (e) => {
    state.minLvl = clamp(parseInt(e.target.value, 10) || 1, 1, 10);
    saveState(); renderAll();
  });
  $('#headQueue').addEventListener('change', (e) => { state.headQueue = e.target.checked; saveState(); renderAll(); });
  $('#deferNewHire').addEventListener('change', (e) => { state.deferNewHire = e.target.checked; saveState(); renderAll(); });

  // планировщик
  $('#empSelect').addEventListener('change', (e) => { pick.empId = e.target.value; renderQuick(); updateCalc(); });
  $('#startDate').addEventListener('change', updateCalc);
  $('#endDate').addEventListener('change', updateCalc);
  $('#previousMonth').addEventListener('click', () => { mobileMonth = (mobileMonth + 11) % 12; renderMobileSchedule(); });
  $('#nextMonth').addEventListener('click', () => { mobileMonth = (mobileMonth + 1) % 12; renderMobileSchedule(); });
  $('#addBtn').addEventListener('click', addEntry);

  $('#confirmBtn').addEventListener('click', () => {
    const { errors } = validate();
    if (errors) { toast('Есть ошибки — утвердить нельзя', true); return; }
    const drafts = state.entries.filter((e) => e.status === 'draft');
    if (!drafts.length) { toast('Нечего утверждать'); return; }
    drafts.forEach((e) => { e.status = 'confirmed'; });
    saveState(); renderAll();
    toast(`Утверждено периодов: ${drafts.length}. Теперь можно скопировать для Confluence.`);
  });

  $('#clearAll').addEventListener('click', () => {
    if (!state.entries.length) return;
    if (!window.confirm('Удалить все периоды из графика? Это действие нельзя отменить.')) return;
    state.entries = [];
    saveState(); renderAll(); toast('График очищен');
  });

  $('#exportJson').addEventListener('click', () => {
    download('otp-vacation-2027.json', JSON.stringify({
      generated: new Date().toISOString(), year: 2027,
      settings: { weights: state.weights, minLvl: state.minLvl, headQueue: state.headQueue, deferNewHire: state.deferNewHire },
      entries: state.entries.map((x) => ({ ...x, ...(calcPeriod(x.start, x.end) || {}) })),
    }, null, 2));
  });

  $('#exportMd').addEventListener('click', async () => {
    const md = toMarkdown();
    try {
      await navigator.clipboard.writeText(md);
      toast('Таблица для Confluence скопирована в буфер');
    } catch (e) {
      download('grafik-otpuskov-2027.md', md, 'text/markdown');
      toast('Буфер недоступен — файл .md скачан');
    }
  });

  // стартовые значения
  $('#startDate').value = '2027-04-05';
  $('#endDate').value = '2027-04-18';
  $('#minLvl').value = state.minLvl;
  $('#headQueue').checked = state.headQueue;
  $('#deferNewHire').checked = state.deferNewHire;

  // доступы
  if ($('#accessEmp')) {
    $('#accessEmp').addEventListener('change', (e) => {
      accessForm.empId = e.target.value;
      accessForm.months = null;
      renderAccessForm();
    });
    $$('#accessCycle button').forEach((b) => b.addEventListener('click', () => {
      accessForm.cycle = +b.dataset.cycle;
      $$('#accessCycle button').forEach((x) => x.classList.toggle('on', x === b));
      renderAccessForm();
    }));
    $('#issueBtn').addEventListener('click', issueAccess);
    $('#refreshTokens').addEventListener('click', renderTokens);
    $('#publishSchedule').addEventListener('click', publishSchedule);
    $('#copyMessage').addEventListener('click', () => copyText($('#messageText').textContent));
    $$('#accessSeasons button').forEach((b) => b.addEventListener('click', () => {
      const map = { winter: [12, 1, 2], spring: [3, 4, 5], summer: [6, 7, 8], autumn: [9, 10, 11],
        all: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] };
      accessForm.months = map[b.dataset.season].slice().sort((a, c) => a - c);
      renderMonthChips();
    }));
  }
}

/* --------------------------------------------------------------------- init */
loadState();
if (window.APP_CLOUD_STATE) {
  applySavedState(window.APP_CLOUD_STATE);
}
$('#demoNotice').hidden = !D.meta.demo;
renderSliders();
bindUi();
if (state.tab && state.tab !== 'planner') {
  const b = $(`#tabs .tab[data-tab="${state.tab}"]`);
  if (b) {
    $$('#tabs .tab').forEach((x) => x.classList.toggle('active', x === b));
    $$('.panel').forEach((p) => p.classList.toggle('active', p.id === 'panel-' + state.tab));
  }
}
renderAll();
updateCalc();

// проверяем API персональных ссылок и перерисовываем блок доступов
checkApi().then(() => renderAccess());

// первичная анимация кольца
setTimeout(() => {
  const { ordered, eligibleCount } = buildRanking();
  ringUpdate(eligibleCount, ordered.length);
}, 120);
