// Mi Portapapeles: permite instalar la app, abrirla sin conexión y recibir lo
// que se comparte desde otras apps (menú Compartir de Android).
const CACHE = 'pp-v1';
const SHELL = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './firebase-sdk.js'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).catch(() => {}));
  self.skipWaiting();
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if(url.origin !== location.origin) return;             // Firebase y fuentes van directo a la red
  if(e.request.method === 'POST' && url.pathname.endsWith('/compartir')){ e.respondWith(recibirCompartido(e.request)); return; }
  if(e.request.method !== 'GET' || url.pathname.startsWith('/__/')) return;
  // primero la red (así las actualizaciones llegan al tiro); sin conexión, lo guardado
  e.respondWith(
    fetch(e.request).then(resp => {
      if(resp.ok) { const copy = resp.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
      return resp;
    }).catch(() => caches.match(e.request, {ignoreSearch: e.request.mode === 'navigate'}).then(r => r || caches.match('./index.html')))
  );
});

function idb(){
  return new Promise((ok, fail) => {
    const r = indexedDB.open('pp-compartir', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('pendientes', {autoIncrement: true});
    r.onsuccess = () => ok(r.result); r.onerror = () => fail(r.error);
  });
}
async function recibirCompartido(req){
  try{
    const fd = await req.formData();
    // Android suele repetir el enlace dentro del texto: se dejan solo las partes distintas
    const partes = [];
    for(const v of [fd.get('title'), fd.get('text'), fd.get('url')]){
      const p = typeof v === 'string' ? v.trim() : '';
      if(!p || partes.some(q => q.includes(p))) continue;
      for(let i = partes.length - 1; i >= 0; i--) if(p.includes(partes[i])) partes.splice(i, 1);
      partes.push(p);
    }
    const files = fd.getAll('files').filter(f => f && typeof f === 'object' && f.size > 0);
    if(partes.length || files.length){
      const db = await idb();
      await new Promise((ok, fail) => {
        const tx = db.transaction('pendientes', 'readwrite');
        tx.objectStore('pendientes').add({text: partes.join('\n'), files, at: Date.now()});
        tx.oncomplete = ok; tx.onerror = () => fail(tx.error);
      });
    }
  }catch(e){ /* si algo falla igual se abre la app */ }
  return Response.redirect(new URL('./?compartido=1', self.registration.scope).href, 303);
}
