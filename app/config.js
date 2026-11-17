/* Настройки окружения.
   apiBase = ''            — API на том же адресе, что и страница (обычный режим: python server/app.py)
   apiBase = 'https://…'   — внешний адрес сервера (туннель/VM), нужен, если страница открыта
                             с GitHub Pages или из файла, а ссылки должны собирать ответы.
*/
window.APP_CONFIG = {
  apiBase: '',
  supabaseUrl: 'https://ghmdavywolqtrivqlqkz.supabase.co',
  supabasePublishableKey: 'sb_publishable_qDhEc4wyNNB9vTxKRIYCrg_d1vHy6cN',
};
