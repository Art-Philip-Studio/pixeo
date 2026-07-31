// Service Worker mínimo de Pixeo — necesario para que Chrome/Android
// muestre el botón "Instalar app". Estrategia simple: red primero,
// caché como respaldo si no hay internet.

const CACHE_NAME = 'pixeo-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  // No interceptamos llamadas a tu Worker de IA (Replicate/remove.bg)
  // ni a Firebase, solo los archivos propios de la web (html/css/js/img).
  const url = new URL(event.request.url);
  const esArchivoPropio = url.origin === self.location.origin;

  if (!esArchivoPropio) return; // deja pasar directo a la red

  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});
