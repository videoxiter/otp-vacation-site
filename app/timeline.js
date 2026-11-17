(function () {
  'use strict';
  const months = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const date = n => new Date(2027, 0, 1 + n);
  const day = value => Math.round((new Date(value + 'T00:00:00') - new Date(2027, 0, 1)) / 86400000);
  window.vacationTimeline = function (root, getPeriods) {
    let zoom = 0, selected = 0;
    root.innerHTML = '<div class="zoom-content"></div><label class="zoom-slider"><span>Перемещение по графику</span><input type="range" min="0" max="364" value="0" step="1" aria-label="Перемещение по датам 2027 года"><span class="zoom-slider-ends"><span>1 янв.</span><span>31 дек.</span></span></label>';
    const content = root.querySelector('.zoom-content');
    const slider = root.querySelector('input[type=range]');
    function draw() {
      const current = date(selected), month = current.getMonth();
      const first = zoom === 0 ? 0 : selected;
      const length = zoom === 0 ? 365 : zoom === 1 ? Math.min(31, 365 - first) : 1;
      const end = date(first + length - 1);
      const shortDate = d => d.toLocaleDateString('ru-RU', {day:'numeric', month:'short'});
      const title = zoom === 0 ? 'Весь 2027 год' : zoom === 1 ? (current.getDate() === 1 && end.getMonth() === month && end.getDate() === new Date(2027, month + 1, 0).getDate() ? months[month] + ' 2027' : `${shortDate(current)} — ${shortDate(end)} 2027`) : current.toLocaleDateString('ru-RU', {day:'numeric', month:'long', year:'numeric'});
      const data = getPeriods().filter(p => /^2027-\d\d-\d\d$/.test(p.start) && /^2027-\d\d-\d\d$/.test(p.end));
      const names = [...new Set(data.map(p => p.name))];
      const headings = zoom === 0 ? months.map((m, i) => `<span style="left:${day(`2027-${String(i+1).padStart(2,'0')}-01`)/365*100}%">${m.slice(0,3)}</span>`).join('') : zoom === 1 ? Array.from({length}, (_,i) => { const d = date(first+i); return `<span style="left:${i/length*100}%" title="${shortDate(d)}">${d.getDate() === 1 ? shortDate(d) : d.getDate()}</span>`; }).join('') : '<span>Занятость за день</span>';
      const rows = names.map(name => {
        const bars = data.filter(p => p.name === name && day(p.end) >= first && day(p.start) < first + length).map(p => {
          const start = Math.max(first, day(p.start)), end = Math.min(first + length - 1, day(p.end));
          const label = `${name}: ${p.start.split('-').reverse().join('.')} — ${p.end.split('-').reverse().join('.')}`;
          return `<span class="zoom-bar ${p.status === 'confirmed' ? 'confirmed' : ''}" style="left:${(start-first)/length*100}%;width:${(end-start+1)/length*100}%" title="${esc(label)}" aria-label="${esc(label)}"></span>`;
        }).join('');
        return bars ? `<div class="zoom-row"><div class="zoom-name">${esc(name)}</div><div class="zoom-track">${bars}</div></div>` : '';
      }).join('');
      const visible = data.filter(p => day(p.end) >= first && day(p.start) < first + length);
      const list = visible.map(p => `<li>${esc(p.name)}: ${esc(p.start.split('-').reverse().join('.'))} — ${esc(p.end.split('-').reverse().join('.'))}</li>`).join('');
      content.innerHTML = `<div class="zoom-controls"><button type="button" data-action="out" aria-label="Уменьшить масштаб" ${zoom===0?'disabled':''}>−</button><button type="button" data-action="in" aria-label="Увеличить масштаб" ${zoom===2?'disabled':''}>+</button><button type="button" data-action="prev" aria-label="Предыдущий период" ${zoom===0 || first===0?'disabled':''}>‹</button><strong aria-live="polite">${title}</strong><button type="button" data-action="next" aria-label="Следующий период" ${zoom===0 || first+length>=365?'disabled':''}>›</button><span>Год / месяц / день</span></div><div class="zoom-scroll"><div class="zoom-chart"><div class="zoom-row zoom-heading"><div>Сотрудник</div><div class="zoom-axis">${headings}</div></div>${rows || '<p class="muted">На выбранный период отпусков пока нет.</p>'}</div></div>${list ? `<details><summary>Даты выбранных периодов</summary><ul>${list}</ul></details>` : ''}`;
      slider.value = selected;
      slider.setAttribute('aria-valuetext', current.toLocaleDateString('ru-RU', {day:'numeric', month:'long', year:'numeric'}));
      content.querySelectorAll('button').forEach(button => button.addEventListener('click', () => {
        const action = button.dataset.action;
        if (action === 'in') zoom++; if (action === 'out') zoom--;
        if (action === 'prev') selected = zoom === 1 ? Math.max(0, first - 31) : selected - 1;
        if (action === 'next') selected = zoom === 1 ? first + length : selected + 1;
        selected = Math.max(0, Math.min(364, selected)); draw();
      }));
    }
    slider.addEventListener('input', () => { selected = Number(slider.value); if (zoom === 0) zoom = 1; draw(); });
    draw();
    return draw;
  };
})();
