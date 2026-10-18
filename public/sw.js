// Local development retires old offline workers. Production builds replace this file.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil((async () => {
  await Promise.all((await caches.keys()).filter(key => key.startsWith('pmd-field-')).map(key => caches.delete(key)));
  await self.clients.claim();
  await self.registration.unregister();
})()));
