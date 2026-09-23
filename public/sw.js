// ============================================================================
// Service worker SOURA Marché — permet d'ouvrir la caisse sans internet.
// - La page /caisse est gardée en mémoire à chaque visite en ligne.
// - Les fichiers techniques de l'application (/_next/static) aussi.
// - Sans connexion, toute page demandée affiche la caisse mémorisée.
// Les échanges avec la base (Supabase) ne passent jamais par ce cache.
// ============================================================================

const CACHE = "soura-caisse-v1";

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cles) => Promise.all(cles.filter((c) => c !== CACHE).map((c) => caches.delete(c))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const requete = event.request;
  if (requete.method !== "GET") return;

  const url = new URL(requete.url);
  if (url.origin !== self.location.origin) return; // Supabase et autres : jamais en cache

  // Navigation (ouverture d'une page) : réseau d'abord, caisse mémorisée en secours.
  if (requete.mode === "navigate") {
    event.respondWith(
      fetch(requete)
        .then((reponse) => {
          if (reponse.ok && !reponse.redirected && url.pathname === "/caisse") {
            const copie = reponse.clone();
            caches.open(CACHE).then((c) => c.put("/caisse", copie));
          }
          return reponse;
        })
        .catch(async () => {
          const memorisee = await caches.match("/caisse");
          return (
            memorisee ||
            new Response(
              "<meta charset='utf-8'><p style='font-family:sans-serif;padding:24px'>Pas de connexion internet, et la caisse n'a pas encore été ouverte en ligne sur ce poste.</p>",
              { headers: { "Content-Type": "text/html; charset=utf-8" } }
            )
          );
        })
    );
    return;
  }

  // Fichiers techniques versionnés : mémoire d'abord (ils ne changent jamais).
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.match(requete).then(
        (memorise) =>
          memorise ||
          fetch(requete).then((reponse) => {
            if (reponse.ok) {
              const copie = reponse.clone();
              caches.open(CACHE).then((c) => c.put(requete, copie));
            }
            return reponse;
          })
      )
    );
    return;
  }

  // Le reste (icônes, etc.) : réseau d'abord, mémoire en secours.
  event.respondWith(
    fetch(requete)
      .then((reponse) => {
        if (reponse.ok) {
          const copie = reponse.clone();
          caches.open(CACHE).then((c) => c.put(requete, copie));
        }
        return reponse;
      })
      .catch(() => caches.match(requete).then((r) => r || Response.error()))
  );
});
