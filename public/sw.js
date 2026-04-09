const CACHE_NAME = "wow-goals-v10";

const scopeUrl = new URL(self.registration.scope);
const BASE_PATH = scopeUrl.pathname;

const APP_SHELL_URLS = [BASE_PATH, `${BASE_PATH}index.html`];

function isSameOrigin(url) {
  return url.origin === self.location.origin;
}

function isServiceWorkerRequest(url) {
  return url.pathname.endsWith("/sw.js");
}

function isNavigationRequest(request) {
  if (request.mode === "navigate") return true;
  const accept = request.headers.get("accept") || "";
  return accept.includes("text/html");
}

function canRuntimeCache(url) {
  if (!isSameOrigin(url)) return false;
  if (isServiceWorkerRequest(url)) return false;
  return true;
}

async function cacheAppShell(cache) {
  await Promise.all(
    APP_SHELL_URLS.map(async (url) => {
      const req = new Request(url, { cache: "reload" });
      const resp = await fetch(req);
      if (resp.ok) {
        await cache.put(req, resp.clone());
      }
    }),
  );
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok && canRuntimeCache(new URL(request.url))) {
      await cache.put(request, response.clone());
    }
    return response;
  } catch {
    if (isNavigationRequest(request)) {
      const appShell = (await cache.match(`${BASE_PATH}index.html`)) ?? (await cache.match(BASE_PATH));
      if (appShell) return appShell;
    }

    throw new Error("Offline and not cached");
  }
}

async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);

  try {
    const response = await fetch(request, { cache: "no-store" });
    if (response.ok && canRuntimeCache(new URL(request.url))) {
      await cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;

    if (isNavigationRequest(request)) {
      const appShell = (await cache.match(`${BASE_PATH}index.html`)) ?? (await cache.match(BASE_PATH));
      if (appShell) return appShell;
    }

    throw new Error("Offline and not cached");
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      await cacheAppShell(cache);
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.map((key) => {
          if (key === CACHE_NAME) return null;
          return caches.delete(key);
        }),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("message", (event) => {
  const message = event.data;
  if (!message || typeof message !== "object") return;

  if (message.type === "GET_VERSION") {
    const replyPort = event.ports?.[0];
    if (replyPort) {
      const match = CACHE_NAME.match(/-v(\d+)/i);
      replyPort.postMessage({
        cacheName: CACHE_NAME,
        version: match ? Number(match[1]) : null,
      });
    }
    return;
  }

  if (message.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const requestUrl = new URL(request.url);
  if (isServiceWorkerRequest(requestUrl)) {
    event.respondWith(fetch(request));
    return;
  }

  event.respondWith(networkFirst(request));
});
