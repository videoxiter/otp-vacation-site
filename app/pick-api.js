(function () {
  'use strict';
  const config = window.APP_CONFIG || {};
  const apiBase = (config.apiBase || '').replace(/\/$/, '');
  const cloudBase = (config.supabaseUrl || '').replace(/\/$/, '');
  const methods = { info: 'vacation_pick_info', submit: 'submit_vacation_pick', reset: 'reset_vacation_pick' };

  window.pickRequest = (token, action, periods) => {
    if (!methods[action]) throw new Error('Неизвестное действие');
    if (/^[0-9a-f]{64}$/.test(token) && cloudBase && config.supabasePublishableKey) {
      const body = { p_token: token };
      if (action === 'submit') body.p_periods = periods;
      return fetch(`${cloudBase}/rest/v1/rpc/${methods[action]}`, {
        method: 'POST', cache: 'no-store',
        headers: { apikey: config.supabasePublishableKey, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    }
    const suffix = action === 'info' ? '' : '/' + action;
    const options = { method: action === 'info' ? 'GET' : 'POST', cache: 'no-store' };
    if (action === 'submit') {
      options.headers = { 'Content-Type': 'application/json' };
      options.body = JSON.stringify({ periods });
    }
    return fetch(`${apiBase}/api/pick/${encodeURIComponent(token)}${suffix}`, options);
  };
})();
