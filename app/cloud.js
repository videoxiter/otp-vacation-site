/* Вход руководителя и общий график Supabase. */
(function () {
  'use strict';

  const config = window.APP_CONFIG || {};
  const base = (config.supabaseUrl || '').replace(/\/$/, '');
  const key = config.supabasePublishableKey || '';
  const storageKey = 'otp2027.cloud.session';
  const pendingKey = 'otp2027.cloud.pending';
  const backupPrefix = 'otp2027.cloud.backup.';
  const tabKey = 'otp2027.cloud.tab';
  const tabId = sessionStorage.getItem(tabKey) || Date.now().toString(36) + Math.random().toString(36).slice(2);
  sessionStorage.setItem(tabKey, tabId);
  const backupKey = backupPrefix + tabId;
  const status = document.getElementById('cloudStatus');
  const button = document.getElementById('cloudLogin');
  const resolveButton = document.getElementById('cloudResolve');
  const restoreButton = document.getElementById('cloudRestore');
  const retryButton = document.getElementById('cloudRetry');
  const dialog = document.getElementById('cloudDialog');
  const form = document.getElementById('cloudForm');
  const errorBox = document.getElementById('cloudError');
  let session = null;
  let revision = null;
  let pending = null;
  let pendingBase = null;
  let saving = false;
  let stopped = false;
  let saveTask = null;
  let lastPayload = null;

  function canonical(value) {
    if (Array.isArray(value)) return value.map(canonical);
    if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
    return value;
  }

  function backups() {
    const result = [];
    for (let i = 0; i < localStorage.length; i++) {
      const name = localStorage.key(i);
      if (!name?.startsWith(backupPrefix)) continue;
      try {
        const value = JSON.parse(localStorage.getItem(name));
        if (value?.payload?.data && value?.payload?.state) result.push({ name, ...value });
      } catch (error) { /* Неполную копию не предлагаем для восстановления. */ }
    }
    return result.sort((a, b) => b.savedAt - a.savedAt);
  }

  function storePending() {
    const record = { payload: pending, base: pendingBase, savedAt: Date.now() };
    const backup = JSON.stringify(record);
    localStorage.setItem(backupKey, backup);
    sessionStorage.setItem(pendingKey, backup);
    restoreButton.hidden = false;
  }

  function setStatus(message, error) {
    status.textContent = message;
    status.classList.toggle('cloud-error', !!error);
  }

  function storeSession(value) {
    if (value && (!value.access_token || !value.refresh_token)) throw new Error('Сервер вернул неполные данные входа.');
    if (value && !value.expires_at) value.expires_at = Math.floor(Date.now() / 1000) + (value.expires_in || 3600);
    session = value;
    if (value) sessionStorage.setItem(storageKey, JSON.stringify(value));
    else sessionStorage.removeItem(storageKey);
  }

  async function request(path, options = {}, auth = true) {
    if (!base || !key) throw new Error('Адрес Supabase не настроен.');
    const headers = { apikey: key, 'Content-Type': 'application/json', ...(options.headers || {}) };
    if (auth) {
      await refreshIfNeeded();
      if (!session) throw new Error('Войдите в учётную запись руководителя.');
      headers.Authorization = 'Bearer ' + session.access_token;
    }
    const response = await fetch(base + path, { ...options, headers, cache: 'no-store' });
    const data = await response.json().catch(() => null);
    if (!response.ok) throw new Error(data?.message || data?.error_description || data?.error || 'Не удалось связаться с Supabase.');
    return data;
  }

  async function refreshIfNeeded() {
    if (!session || session.expires_at > Date.now() / 1000 + 60) return;
    const data = await request('/auth/v1/token?grant_type=refresh_token', {
      method: 'POST', body: JSON.stringify({ refresh_token: session.refresh_token }),
    }, false);
    storeSession(data);
  }

  async function readCloud() {
    const permissions = await request('/rest/v1/vacation_managers?select=user_id');
    if (!Array.isArray(permissions) || permissions.length !== 1) throw new Error('У этой учётной записи нет доступа руководителя.');
    const rows = await request('/rest/v1/vacation_state?select=revision,payload&id=eq.true');
    if (!Array.isArray(rows)) throw new Error('Не удалось прочитать график.');
    return rows[0] || null;
  }

  async function persist(payload, expectedRevision) {
    return request('/rest/v1/rpc/save_vacation_state', {
      method: 'POST', body: JSON.stringify({ expected_revision: expectedRevision, new_payload: payload }),
    });
  }

  async function drain() {
    if (saving || stopped || !session || revision === null) return;
    saving = true;
    try {
      while (pending && !stopped) {
        const payload = pending;
        pending = null;
        setStatus('Сохраняем график…');
        try {
          const row = await readCloud();
          if (!row || JSON.stringify(canonical(row.payload)) !== JSON.stringify(canonical(lastPayload))) {
            throw new Error('График изменён в другом окне.');
          }
          revision = row.revision;
          const next = await persist(payload, revision);
          if (!Number.isSafeInteger(next)) throw new Error('Сервер вернул некорректную версию графика.');
          revision = next;
          lastPayload = payload;
          if (pending) { pendingBase = payload; storePending(); }
          if (!pending) sessionStorage.removeItem(pendingKey);
          if (!pending) setStatus('Сохранено в облаке');
        } catch (error) {
          if (!pending) pending = payload;
          stopped = true;
          resolveButton.hidden = false;
          retryButton.hidden = false;
          setStatus('Не сохранено в облаке: ' + error.message + ' Скачайте JSON перед обновлением страницы.', true);
        }
      }
    } finally {
      saving = false;
    }
  }

  window.cloudBridge = {
    save(payload) {
      if (!session || revision === null) return;
      if (!pending) pendingBase = lastPayload;
      pending = JSON.parse(JSON.stringify(payload));
      try {
        storePending();
      }
      catch (error) {
        stopped = true;
        resolveButton.hidden = false;
        retryButton.hidden = false;
        setStatus('Не удалось сохранить резервную копию изменений. Скачайте JSON.', true);
        return;
      }
      if (!saving) saveTask = drain();
    },
    rpc(name, args = {}) {
      return request('/rest/v1/rpc/' + name, { method: 'POST', body: JSON.stringify(args) });
    },
    async refreshRevision() {
      if (saveTask) await saveTask;
      if (stopped) throw new Error('Есть изменения, не сохранённые в облаке. Скачайте JSON.');
      const row = await readCloud();
      if (saving || pending || !row || JSON.stringify(canonical(row.payload)) !== JSON.stringify(canonical(lastPayload))) {
        throw new Error('График изменён в другом окне. Скачайте JSON и обновите страницу.');
      }
      revision = row.revision;
    },
  };

  function startApp() {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'app.js';
      script.onload = resolve;
      script.onerror = () => reject(new Error('Не удалось загрузить приложение.'));
      document.body.append(script);
    });
  }

  async function start() {
    try {
      const stored = sessionStorage.getItem(storageKey);
      if (stored) session = JSON.parse(stored);
      if (session) {
        const row = await readCloud();
        if (!row?.payload?.data || !row?.payload?.state) throw new Error('Облачный график не найден.');
        revision = row.revision;
        lastPayload = JSON.parse(JSON.stringify(row.payload));
        restoreButton.hidden = backups().length === 0;
        const backup = sessionStorage.getItem(pendingKey);
        if (backup) {
          const saved = JSON.parse(backup);
          if (!saved.payload?.data || !saved.payload?.state) throw new Error('Не удалось прочитать резервную копию изменений.');
          pending = saved.payload;
          pendingBase = saved.base;
          stopped = true;
          resolveButton.hidden = false;
          retryButton.hidden = false;
          window.APP_DATA = JSON.parse(JSON.stringify(saved.payload.data));
          window.APP_CLOUD_STATE = JSON.parse(JSON.stringify(saved.payload.state));
          setStatus('Есть неподтверждённые изменения. Скачайте JSON перед открытием облачного графика.', true);
        } else {
          window.APP_DATA = JSON.parse(JSON.stringify(row.payload.data));
          window.APP_CLOUD_STATE = JSON.parse(JSON.stringify(row.payload.state));
          setStatus('График из облака');
        }
        button.textContent = 'Выйти';
      }
    } catch (error) {
      storeSession(null);
      setStatus('Облако недоступно: ' + error.message, true);
    }
    await startApp();
  }

  button.addEventListener('click', () => {
    if (session && revision !== null) {
      if (pending || saving || stopped) {
        setStatus('Сначала скачайте JSON: есть изменения, не подтверждённые облаком.', true);
        return;
      }
      storeSession(null);
      location.reload();
      return;
    }
    errorBox.textContent = '';
    dialog.showModal();
  });
  resolveButton.addEventListener('click', () => {
    if (!window.confirm('Несохранённые изменения в этом окне будут удалены. Вы уже скачали JSON с резервной копией?')) return;
    sessionStorage.removeItem(pendingKey);
    location.reload();
  });
  restoreButton.addEventListener('click', () => {
    const available = backups();
    if (!available.length) return;
    const list = available.map((backup, index) => `${index + 1}. ${new Date(backup.savedAt).toLocaleString('ru-RU')}`).join('\n');
    const choice = window.prompt('Введите номер локальной копии. Облачный график пока не изменится:\n' + list, '1');
    if (choice === null) return;
    const index = Number(choice) - 1;
    if (!Number.isInteger(index) || index < 0 || index >= available.length) {
      setStatus('Неверный номер локальной копии.', true);
      return;
    }
    sessionStorage.setItem(pendingKey, JSON.stringify(available[index]));
    location.reload();
  });
  retryButton.addEventListener('click', async () => {
    if (!pending || !pendingBase) return setStatus('Для этой копии скачайте JSON и сравните с облачным графиком.', true);
    try {
      const row = await readCloud();
      if (!row || JSON.stringify(canonical(row.payload)) !== JSON.stringify(canonical(pendingBase))) {
        throw new Error('График в облаке изменился. Скачайте JSON и сравните записи.');
      }
      revision = row.revision;
      lastPayload = row.payload;
      stopped = false;
      resolveButton.hidden = true;
      retryButton.hidden = true;
      saveTask = drain();
    } catch (error) {
      setStatus(error.message, true);
    }
  });
  window.addEventListener('beforeunload', (event) => {
    if (!pending && !saving && !stopped) return;
    event.preventDefault();
    event.returnValue = '';
  });
  document.getElementById('cloudCancel').addEventListener('click', () => dialog.close());
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const submit = form.querySelector('button[type=submit]');
    submit.disabled = true;
    errorBox.textContent = '';
    try {
      const fields = new FormData(form);
      const data = await request('/auth/v1/token?grant_type=password', {
        method: 'POST', body: JSON.stringify({ email: fields.get('email'), password: fields.get('password') }),
      }, false);
      form.elements.password.value = '';
      storeSession(data);
      let row = await readCloud();
      if (!row) {
        if (window.APP_DATA.meta.demo) throw new Error('Для первого переноса откройте приложение на компьютере с рабочими данными.');
        if (!window.confirm('В облаке ещё нет графика. Перенести туда данные и график с этого компьютера?')) {
          storeSession(null);
          return;
        }
        const snapshot = window.getVacationSnapshot();
        try { localStorage.setItem('otp2027.precloud.backup', JSON.stringify(snapshot)); }
        catch (error) { throw new Error('Не удалось создать локальную резервную копию.'); }
        const next = await persist(snapshot, 0);
        if (!Number.isSafeInteger(next)) throw new Error('Сервер вернул некорректную версию графика.');
        row = { revision: next, payload: snapshot };
      }
      location.reload();
    } catch (error) {
      form.elements.password.value = '';
      storeSession(null);
      errorBox.textContent = error.message || 'Не удалось войти.';
    } finally {
      submit.disabled = false;
    }
  });

  start().catch((error) => setStatus(error.message, true));
})();
