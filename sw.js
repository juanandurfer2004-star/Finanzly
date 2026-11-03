// =============================================
// SERVICE WORKER
// Un script que el navegador ejecuta "por detrás" de la página.
// Guarda una copia de los archivos de la app para que funcione
// sin internet.
//
// Estrategia "primero la red": si hay conexión se usan siempre los
// archivos nuevos (así ves tus cambios al programar) y se guarda una
// copia; si no hay conexión se usa la copia guardada.
// =============================================

// Cambia la versión si añades archivos nuevos a la lista
const VERSION = "mis-finanzas-v1";

const ARCHIVOS = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png",
  "./icons/apple-touch-icon.png",
];

// 1. Instalación: descargamos y guardamos todos los archivos
self.addEventListener("install", (evento) => {
  evento.waitUntil(caches.open(VERSION).then((cache) => cache.addAll(ARCHIVOS)));
  self.skipWaiting(); // la versión nueva empieza a funcionar sin esperar
});

// 2. Activación: borramos las copias de versiones anteriores
self.addEventListener("activate", (evento) => {
  evento.waitUntil(
    caches
      .keys()
      .then((claves) => Promise.all(claves.filter((clave) => clave !== VERSION).map((clave) => caches.delete(clave))))
      .then(() => self.clients.claim()) // controla ya las pestañas abiertas
  );
});

// 3. Cada vez que la página pide un archivo
self.addEventListener("fetch", (evento) => {
  const peticion = evento.request;
  // Solo lo nuestro: nada de otras webs ni de envíos (POST)
  if (peticion.method !== "GET" || new URL(peticion.url).origin !== location.origin) return;

  evento.respondWith(
    fetch(peticion)
      .then((respuesta) => {
        // Hay red: guardamos una copia actualizada y devolvemos la respuesta
        if (respuesta.ok) {
          const copia = respuesta.clone(); // una respuesta solo se puede leer una vez
          caches.open(VERSION).then((cache) => cache.put(peticion, copia));
        }
        return respuesta;
      })
      .catch(async () => {
        // Sin red: usamos la copia guardada (y si es una página, el index)
        const guardada = await caches.match(peticion, { ignoreSearch: true });
        if (guardada) return guardada;
        if (peticion.mode === "navigate") return caches.match("./index.html");
        return Response.error();
      })
  );
});
