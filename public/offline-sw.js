/* Offline shell for the screening room.
 * Hashed build assets are cache-first (immutable), navigations are
 * network-first so a re-deploy is picked up, and film media is never stored
 * here — each offline package owns its own copy. */
const SHELL = "tidal-shell-v3";
const SHELL_URLS = ["/", "/index.html"];

async function precache() {
  const cache = await caches.open(SHELL);
  for (const url of SHELL_URLS) {
    try {
      const response = await fetch(url, { cache: "reload" });
      if (response.ok) await cache.put(url, response);
    } catch {
      /* offline during install: keep whatever is already cached */
    }
  }
  const index = await cache.match("/index.html", { ignoreVary: true });
  if (!index) return;
  const html = await index.text();
  for (const match of html.matchAll(/src="([^"]+)"|href="([^"]+)"/g)) {
    const url = match[1] || match[2];
    if (!url || !url.startsWith("/") || url.startsWith("//")) continue;
    if (url.startsWith("/media/")) continue;
    if (await cache.match(url, { ignoreVary: true })) continue;
    try {
      const response = await fetch(url);
      if (response.ok) await cache.put(url, response);
    } catch {
      /* non-essential shell file */
    }
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      await precache();
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "skip") void self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([SHELL, "tidal-offline-assets-v1"]);
      for (const name of await caches.keys())
        if (!keep.has(name)) await caches.delete(name);
      await self.clients.claim();
    })(),
  );
});

async function cacheFirst(cache, request) {
  const hit = await cache.match(request, { ignoreVary: true });
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok && response.status === 200) {
    try {
      await cache.put(request, response.clone());
    } catch {
      /* range or opaque responses cannot be stored */
    }
  }
  return response;
}

async function navigation(cache, request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      await cache.put("/index.html", response.clone());
      await cache.put("/", response.clone());
    }
    return response;
  } catch {
    for (const fallback of ["/index.html", "/"]) {
      const page = await cache.match(fallback, { ignoreVary: true });
      if (page) return page;
    }
    return new Response("离线", { status: 503 });
  }
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/media/")) return; // packages / network handle media
  event.respondWith(
    (async () => {
      const cache = await caches.open(SHELL);
      if (request.mode === "navigate") return navigation(cache, request);
      try {
        return await cacheFirst(cache, request);
      } catch {
        return new Response("离线", { status: 503 });
      }
    })(),
  );
});
