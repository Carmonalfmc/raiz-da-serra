// Guarda a "casca" do app para abrir rápido e sem internet. Os dados sempre vêm da rede.
const VERSAO = 'raiz-v5';
const CASCA = ['./', 'index.html', 'styles.css', 'app.js', 'config.js', 'vendor/supabase.js',
  'fonts/playfair-700.woff2', 'fonts/jakarta-400.woff2', 'fonts/jakarta-600.woff2', 'fonts/jakarta-700.woff2',
  'icons/logo.png', 'icons/icon-192.png', 'manifest.webmanifest'];
self.addEventListener('install', e => e.waitUntil(caches.open(VERSAO).then(c => c.addAll(CASCA)).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSAO).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  // Rede primeiro, para pegar atualizações; cache quando estiver sem internet.
  e.respondWith(fetch(e.request).then(r => {
    if (r.ok) { const copia = r.clone(); caches.open(VERSAO).then(c => c.put(e.request, copia)); }
    return r;
  }).catch(() => caches.match(e.request, {ignoreSearch: true}).then(r => r || caches.match('index.html'))));
});
