/* ============================================================================
   Персональная страница выбора периода отпуска (2027)
   ============================================================================ */
'use strict';

const MONTHS_SHORT = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
const MONTHS_FULL = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
const MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const parse = (s) => new Date(s + 'T00:00:00');
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const dayDiff = (a, b) => Math.round((parse(b) - parse(a)) / 86400000);
const fmtDay = (s) => { const d = parse(s); return d.getDate() + ' ' + MONTHS_GEN[d.getMonth()]; };
const fmtRange = (a, b) => fmtDay(a) + ' — ' + fmtDay(b);
function intersectsMonth(range, month) {
  const prefix = `2027-${String(month).padStart(2, '0')}-`;
  const first = prefix + '01';
  const last = prefix + String(new Date(2027, month, 0).getDate()).padStart(2, '0');
  return range.start <= last && range.end >= first;
}
const fmtDateRu = (s) => (!s ? '—' : /(?:Z|[+-]\d{2}:\d{2})$/.test(s) ? new Intl.DateTimeFormat('ru-RU', { timeZone: 'Europe/Moscow', day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(s)) : s.slice(0, 10).split('-').reverse().join('.'));
const plural = (n, one, few, many) => {
  const a = Math.abs(n) % 100, b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  if (b === 1) return one;
  return many;
};

let INFO = null;
let DAYMAP = new Map();
let periods = [{ start: '', end: '' }];

function token() {
  const h = location.hash.replace(/^#/, '');
  if (h.startsWith('t=')) return h.slice(2);
  if (h.startsWith('/t/')) return h.slice(3);
  return new URLSearchParams(h).get('t') || '';
}

function toast(msg, err) {
  const t = $('#toast');
  t.textContent = msg;
  t.className = 'toast show' + (err ? ' err' : '');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { t.className = 'toast'; }, 3200);
}

async function load() {
  const t = token();
  if (!t) return renderError('Ссылка неполная', 'В адресе нет кода доступа. Попросите руководителя отправить ссылку заново.');
  $('#screen').innerHTML = `<div class="glass center-card"><div class="spin"></div><h2>Проверяем ссылку…</h2><p>Секунду.</p></div>`;
  try {
    const r = await window.pickRequest(t, 'info');
    const data = await r.json();
    if (!r.ok) return renderError('Ссылка недействительна', data.error || data.message || 'Ссылка погашена или истекла.');
    INFO = data;
    if (data.calendar && data.calendar.days) {
      DAYMAP = new Map(data.calendar.days.map((x) => [x.d, x.k]));
    }
    render();
  } catch (e) {
    renderError('Сервер недоступен', 'Не удалось связаться с сервером графика. Проверьте подключение или попросите новую ссылку.');
  }
}

function renderError(title, text) {
  $('#screen').innerHTML = `<div class="glass center-card">
    <div class="done-mark error">!</div>
    <h2>${escapeHtml(title)}</h2><p>${escapeHtml(text)}</p></div>`;
}

function calc(start, end) {
  if (!start || !end || parse(end) < parse(start)) return null;
  let cal = 0, hol = 0, work = 0;
  let d = parse(start);
  const stop = parse(end);
  while (d <= stop) {
    const k = DAYMAP.get(iso(d));
    cal++;
    if (!k || k === 'holiday') hol++;
    else if (k === 'work' || k === 'workSaturday') work++;
    d = addDays(d, 1);
    if (cal > 60) break;
  }
  return { cal, hol, work, vac: cal - hol };
}

function busyCountFor(start, end) {
  let worst = 0;
  let d = parse(start);
  const stop = parse(end);
  while (d <= stop) {
    const k = iso(d);
    let cnt = 0;
    (INFO.ranges || []).forEach((r) => { if (k >= r.start && k <= r.end) cnt = Math.max(cnt, r.count); });
    worst = Math.max(worst, cnt);
    d = addDays(d, 1);
  }
  return worst;
}

function totalDays() {
  return periods.reduce((s, p) => {
    const c = calc(p.start, p.end);
    return s + (c ? c.vac : 0);
  }, 0);
}
function totalHolidays() {
  return periods.reduce((s, p) => {
    const c = calc(p.start, p.end);
    return s + (c ? c.hol : 0);
  }, 0);
}

function allowedRanges() {
  const ranges = [];
  let start = null;
  for (let d = parse('2027-01-01'); d <= parse('2027-12-31'); d = addDays(d, 1)) {
    const key = iso(d);
    const allowed = (INFO.months || []).includes(d.getMonth() + 1)
      && !(INFO.forbiddenPeriods || []).some(p => key >= p.start && key <= p.end);
    if (allowed && !start) start = key;
    if (start && (!allowed || key === '2027-12-31')) {
      ranges.push({ start, end: allowed ? key : iso(addDays(d, -1)) });
      start = null;
    }
  }
  return ranges;
}

/* ---------------------------------------------------------------- рендер */
function render() {
  $('#pickFacts').innerHTML = [
    `<div class="fact">Норма: <b>28 дн.</b></div>`,
    `<div class="fact">Ссылка до: <b>${fmtDateRu(INFO.expiresAt)}</b></div>`,
    `<div class="fact">Статус: <b>${INFO.status === 'submitted' ? 'период выбран' : 'ожидает выбора'}</b></div>`,
  ].join('');

  if (INFO.status === 'submitted') return renderDone();
  if (INFO.status === 'revoked') return renderError('Ссылка погашена', 'Руководитель отозвал эту ссылку или выдал новую. Запросите актуальную.');
  if (INFO.status === 'expired') return renderError('Срок ссылки истёк', `Ссылка действовала до ${fmtDateRu(INFO.expiresAt)}. Попросите руководителя выдать новую.`);

  const cycle = INFO.cycle;
  const months = INFO.months || [];
  const monthsTxt = months.length === 12 ? 'любой месяц' : months.map((m) => MONTHS_FULL[m - 1]).join(', ');
  const busy = (INFO.ranges || []).filter((r) => r.count > 0);
  const limit = INFO.limit || 1;
  const allowed = allowedRanges();

  $('#screen').innerHTML = `
  <div class="glass pick-hero">
    <div class="who">
      <h2>${escapeHtml(INFO.emp.short)}</h2>
      <p>${cycle === 1
        ? `Первый цикл: выберите <b>один</b> период отпуска — <b>${INFO.minDays}–${INFO.maxDays} дней</b>.`
        : `Второй цикл: распределите остаток — <b>${INFO.minDays}–${INFO.maxDays} дней</b>, можно несколькими периодами (минимум 3 дня каждый).`}
        <br>Разрешённые месяцы: <b>${monthsTxt}</b>.${INFO.comment ? '<br>Комментарий руководителя: ' + escapeHtml(INFO.comment) : ''}</p>
      <p>Доступные даты: <b>${allowed.length ? allowed.map(p => fmtRange(p.start, p.end)).join('; ') : 'нет доступных дат — обратитесь к руководителю'}</b>.</p>
    </div>
    <div class="limits">
      <div class="limit"><b>${INFO.minDays}–${INFO.maxDays}</b><span>дней отпуска</span></div>
      <div class="limit"><b>${limit}</b><span>чел. одновременно</span></div>
      <div class="limit"><b>1</b><span>отправка</span></div>
    </div>
  </div>

  <div class="pick-grid">
    <div class="glass form-block pick-form" id="formBlock">
      <h3>${cycle === 1 ? 'Ваш период' : 'Ваши периоды'}</h3>
      <p class="sub">Праздничные дни не входят в отпуск: внутри периода они «продлевают» отдых — показываем как «14 дней + 1 пр.д».</p>
      <div id="rows"></div>
      ${cycle === 1 ? '' : '<button class="ghost add-period" id="addPeriod">+ Добавить ещё период</button>'}
      <div class="totals">
        <div><div class="big"><span id="totalVac">0</span> <small>дней отпуска</small></div>
          <div class="gift" id="totalHol"></div></div>
        <div class="muted" id="totalHint"></div>
      </div>
      <div class="feedback" id="feedback"></div>
      <button class="primary" id="submitBtn" disabled>Отправить выбор</button>
      <div class="locked-note">После отправки выбор можно сбросить до утверждения графика, пока ссылка действует.</div>
    </div>

    <aside>
      <div class="glass side-block">
        <h4>Месяцы</h4>
        <div class="months-strip">
          ${MONTHS_SHORT.map((m, i) => {
            const mNum = i + 1;
            const allow = months.includes(mNum);
            const busyMonth = (INFO.ranges || []).some((r) => intersectsMonth(r, mNum));
            return `<div class="${allow ? 'allow' : ''}${busyMonth ? ' busy' : ''}" title="${MONTHS_FULL[i]}">${m}</div>`;
          }).join('')}
        </div>
        <p class="muted" style="font-size:11.5px;margin:0">Синий — разрешённые месяцы, красная полоса — уже есть отпускники.</p>
      </div>

      <div class="glass side-block">
        <h4>Уже занято коллегами (${busy.length})</h4>
        <div class="busy-list">
          ${busy.length ? busy.map((r) => `<div class="busy-item"><span>${fmtRange(r.start, r.end)}</span><i>${r.count} чел.</i></div>`).join('')
            : '<div class="muted" style="font-size:11.5px">Пока пусто — можно выбирать любой разрешённый период.</div>'}
        </div>
      </div>

      <div class="glass side-block">
        <h4>Что учесть</h4>
        <ul class="rules-mini">
          <li>Минимальный период — <b>3 дня</b>, основной — <b>14–21 день</b>.</li>
          <li>Всего <b>28 календарных дней</b> в год (этот цикл — ${cycle === 1 ? 'первая часть' : 'остаток'}).</li>
          <li>Одновременно в отпуске не более <b>${INFO.rules ? INFO.rules.minPercent : 10}%</b> отдела.</li>
          <li>С 15 по 31 декабря — только по согласованию.</li>
        </ul>
      </div>
    </aside>
  </div>`;

  if (cycle === 2) {
    $('#addPeriod').addEventListener('click', () => {
      if (periods.length >= 6) return toast('Максимум 6 периодов', true);
      periods.push({ start: '', end: '' });
      renderRows();
    });
  }
  renderRows();
  $('#submitBtn').addEventListener('click', submit);
  renderReference();
}

function renderReference() {
  const target = document.createElement('section');
  target.className = 'pick-reference';
  const rules = INFO.rules || {};
  const allowed = allowedRanges();
  target.innerHTML = `<div class="glass reference-card"><h3>Доступные даты для выбора</h3><p>${allowed.length ? allowed.map(p => fmtRange(p.start, p.end)).join('; ') : 'Нет доступных дат — обратитесь к руководителю.'}</p><p class="muted">Занятость коллег и правила отдела могут дополнительно ограничивать выбор.</p></div>
    <div class="glass reference-card"><h3>График отпусков коллег</h3><p class="muted">Показаны выбранные и внесённые периоды. Используйте + и − для перехода от года к месяцу и дню.</p><div id="employeeTimeline"></div></div>
    <details class="glass reference-card"><summary>Правила выбора отпуска</summary><ul>
      <li>Годовая норма — ${escapeHtml(rules.totalDays ?? 28)} дней; праздничные дни в отпуск не входят.</li>
      <li>Основной период — ${escapeHtml(rules.mainMin ?? 14)}–${escapeHtml(rules.mainMax ?? 21)} дней; минимальная часть — ${escapeHtml(rules.partMin ?? 3)} дня.</li>
      <li>Одновременно могут отдыхать не более ${escapeHtml(INFO.limit)} сотрудников. Возможны дополнительные ограничения для отдельных коллег.</li>
      <li>Выбирайте даты только в разрешённых месяцах. После отправки выбор можно сбросить до утверждения, пока ссылка действует.</li>
      <li>С 15 по 31 декабря — только по согласованию.</li>
    </ul></details>
    <details class="glass reference-card"><summary>Производственный календарь 2027</summary><p class="muted">Красный — праздник, синий — выходной или перенос, жёлтый — рабочая суббота, белый — рабочий день.</p><div class="reference-months">${MONTHS_FULL.map((name, m) => {
      const offset = (new Date(2027,m,1).getDay()+6)%7, count = new Date(2027,m+1,0).getDate();
      const cells = Array(offset).fill('<span></span>');
      for (let d=1; d<=count; d++) {
        const key = `2027-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
        const k = DAYMAP.get(key) || 'work';
        cells.push(`<span class="calendar-${escapeHtml(k)}" title="${key}: ${escapeHtml(k)}">${d}</span>`);
      }
      return `<div class="reference-month"><h4>${name}</h4><div class="reference-days">${['пн','вт','ср','чт','пт','сб','вс'].map(x => `<b>${x}</b>`).join('')}${cells.join('')}</div></div>`;
    }).join('')}</div></details>`;
  $('#screen').appendChild(target);
  window.vacationTimeline(target.querySelector('#employeeTimeline'), () => INFO.colleagues || []);
}

function renderRows() {
  const box = $('#rows');
  if (!box) return;
  box.innerHTML = periods.map((p, i) => `
    <div class="period-row" data-i="${i}">
      <label class="field"><span>Начало</span><input type="date" min="2027-01-01" max="2027-12-31" value="${p.start}" data-k="start"></label>
      <label class="field"><span>Конец</span><input type="date" min="2027-01-01" max="2027-12-31" value="${p.end}" data-k="end"></label>
      <div class="calc-inline" data-calc="${i}"></div>
      ${periods.length > 1 ? `<button class="rm" data-rm="${i}" title="Убрать">×</button>` : ''}
    </div>`).join('');

  $$('.period-row input').forEach((inp) => inp.addEventListener('change', () => {
    const i = +inp.closest('.period-row').dataset.i;
    periods[i][inp.dataset.k] = inp.value;
    update();
  }));
  $$('.rm').forEach((b) => b.addEventListener('click', () => {
    periods.splice(+b.dataset.rm, 1);
    renderRows();
    update();
  }));
  update();
}

function setCalc(i) {
  const el = $(`[data-calc="${i}"]`);
  if (!el) return;
  const c = calc(periods[i].start, periods[i].end);
  el.innerHTML = c ? `<b>${c.vac}</b> дн.${c.hol ? ` + ${c.hol} пр.д` : ''} <span style="color:#64748b;margin-left:6px">${c.work} раб.</span>` : '<span style="color:#64748b">выберите даты</span>';
}

function validateLocal() {
  const issues = [];
  const filled = periods.filter((p) => p.start && p.end);
  const cycle = INFO.cycle;
  const months = INFO.months || [];
  const limit = INFO.limit || 1;

  if (!filled.length) return { ok: false, issues: [{ t: 'Выберите даты периода.', cls: '' }], total: 0 };

  for (const p of filled) {
    if (!p.start.startsWith('2027') || !p.end.startsWith('2027')) issues.push({ t: `Даты должны быть в 2027 году: ${fmtRange(p.start, p.end)}.`, cls: 'err' });
    if (parse(p.end) < parse(p.start)) issues.push({ t: `Конец раньше начала: ${fmtRange(p.start, p.end)}.`, cls: 'err' });
    const first = parse(p.start), last = parse(p.end);
    let outsideAllowed = false;
    for (let day = first; day <= last; day = addDays(day, 1)) {
      if (!months.includes(day.getMonth() + 1)) { outsideAllowed = true; break; }
    }
    if (outsideAllowed) {
      issues.push({ t: `${fmtRange(p.start, p.end)} — вне разрешённых месяцев (${months.map((m) => MONTHS_FULL[m - 1]).join(', ')}).`, cls: 'err' });
    }
    if ((INFO.forbiddenPeriods || []).some(blocked => p.start <= blocked.end && p.end >= blocked.start)) {
      issues.push({ t: `${fmtRange(p.start, p.end)} — пересекается с датами, запрещёнными руководителем.`, cls: 'err' });
    }
    const c = calc(p.start, p.end);
    if (c && c.vac < 3) issues.push({ t: `Период ${fmtRange(p.start, p.end)} — ${c.vac} дн., минимум 3 дня.`, cls: 'err' });
  }

  for (let i = 0; i < filled.length; i++) {
    for (let j = i + 1; j < filled.length; j++) {
      if (!(filled[i].end < filled[j].start || filled[j].end < filled[i].start)) {
        issues.push({ t: 'Периоды пересекаются между собой.', cls: 'err' });
      }
    }
  }

  const total = totalDays();
  if (cycle === 2) {
    if (total !== INFO.maxDays) issues.push({ t: `Нужно распределить весь остаток: ${INFO.maxDays} дн. Сейчас ${total}.`, cls: 'err' });
  } else if (total < INFO.minDays || total > INFO.maxDays) {
    issues.push({ t: `Сумма ${total} дн. — вне диапазона ${INFO.minDays}–${INFO.maxDays}.`, cls: 'err' });
  }
  if (cycle === 1 && filled.length > 1) issues.push({ t: 'В первом цикле — один период.', cls: 'err' });

  for (const p of filled) {
    const cnt = busyCountFor(p.start, p.end);
    if (cnt >= limit) issues.push({ t: `${fmtRange(p.start, p.end)} — уже ${cnt} ${plural(cnt, 'человек', 'человека', 'человек')} в отпуске, лимит ${limit}. Выберите другие даты.`, cls: 'err' });
  }

  if (!issues.length) issues.push({ t: 'Период подходит: ограничения соблюдены.', cls: 'ok' });
  const ok = !issues.some((i) => i.cls === 'err');
  return { ok, issues, total };
}

function update() {
  periods.forEach((_, i) => setCalc(i));
  const v = validateLocal();
  $('#totalVac').textContent = v.total;
  const hol = totalHolidays();
  $('#totalHol').innerHTML = hol ? `+ ${hol} праздничных (продлевают отдых)` : '';
  $('#totalHint').textContent = INFO.cycle === 2
    ? `нужно распределить ${INFO.maxDays} дн.`
    : `допустимо ${INFO.minDays}–${INFO.maxDays} дн.`;
  $('#feedback').innerHTML = v.issues.map((i) => `<div class="${i.cls}">${i.cls === 'err' ? '✕' : (i.cls === 'ok' ? '✓' : '›')} ${i.t}</div>`).join('');
  $('#submitBtn').disabled = !v.ok;
}

async function submit() {
  const v = validateLocal();
  if (!v.ok) return toast('Исправьте замечания', true);
  const payload = periods.filter((p) => p.start && p.end).map((p) => ({ start: p.start, end: p.end }));
  const btn = $('#submitBtn');
  btn.disabled = true;
  btn.textContent = 'Отправляем…';
  try {
    const r = await window.pickRequest(token(), 'submit', payload);
    const data = await r.json();
    if (!r.ok) {
      toast(data.error || data.message || 'Не удалось отправить', true);
      btn.disabled = false;
      btn.textContent = 'Отправить выбор';
      return;
    }
    INFO.status = 'submitted';
    INFO.selection = data.selection;
    INFO.submittedAt = new Date().toISOString();
    renderDone();
  } catch (e) {
    toast('Сервер недоступен', true);
    btn.disabled = false;
    btn.textContent = 'Отправить выбор';
  }
}

function renderDone() {
  const sel = INFO.selection || { periods: [], total: 0 };
  const rows = (sel.periods || []).map((p) => {
    const c = calc(p.start, p.end);
    return `<div>${fmtRange(p.start, p.end)} — <b>${c ? c.vac : '?'} дн.</b>${c && c.hol ? ` + ${c.hol} пр.д` : ''}</div>`;
  }).join('');
  $('#pickFacts').innerHTML = [
    `<div class="fact">Норма: <b>28 дн.</b></div>`,
    `<div class="fact">Статус: <b>период выбран</b></div>`,
    `<div class="fact">Отправлено: <b>${fmtDateRu(INFO.submittedAt)}</b></div>`,
  ].join('');
  $('#screen').innerHTML = `<div class="glass done-card">
    <div class="done-mark">✓</div>
    <h2>Готово, ${escapeHtml(INFO.emp.short.split(' ')[0])}</h2>
    <p>Выбор отправлен руководителю. Он попадёт в график после проверки ограничений.</p>
    <div class="summary">${rows}</div>
    <p class="muted">Итого: <b>${sel.total || 0} ${plural(sel.total || 0, 'день', 'дня', 'дней')}</b> отпуска.</p>
    <button class="ghost" id="resetBtn" style="margin-top:8px">Сбросить и выбрать заново</button>
    <div class="locked-note">Одна ссылка = один окончательный выбор. Сброс доступен, пока руководитель не утвердил график.</div>
  </div>`;
  renderReference();
  $('#resetBtn').addEventListener('click', async () => {
    try {
      const r = await window.pickRequest(token(), 'reset');
      if (!r.ok) {
        const data = await r.json().catch(() => ({}));
        throw new Error(data.error || data.message || 'Не удалось сбросить выбор');
      }
      INFO.status = 'open';
      INFO.selection = null;
      periods = [{ start: '', end: '' }];
      render();
      toast('Можно выбрать заново');
    } catch (e) { toast(e.message || 'Не удалось сбросить', true); }
  });
}

window.addEventListener('hashchange', load);
load();
