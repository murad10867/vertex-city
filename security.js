(() => {
  'use strict';
  const production = location.hostname.endsWith('github.io');
  if (production && location.protocol !== 'https:') {
    location.replace('https://' + location.host + location.pathname + location.search + location.hash);
    return;
  }
  try { if (window.opener) window.opener = null; } catch {}
  document.addEventListener('DOMContentLoaded', () => {
    if (window.top !== window.self) {
      document.body.replaceChildren();
      const m = document.createElement('main');
      m.style.cssText = 'min-height:100vh;display:grid;place-items:center;background:#050812;color:white;font-family:Arial;padding:24px;text-align:center';
      m.textContent = 'افتح اللعبة مباشرةً لحماية الصفحة من التضمين الخارجي.';
      document.body.appendChild(m);
    }
  });
})();