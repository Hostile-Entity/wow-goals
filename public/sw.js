// Replaced by the production build after all output files have been written.
const RELEASE = "__WOWGOALS_RELEASE__";
const APP_VERSION = "__WOWGOALS_APP_VERSION__";
const PRECACHE = ["__WOWGOALS_PRECACHE__"];

const PREFIX = "wow-goals-";
const CACHE_NAME = `${PREFIX}${RELEASE}`;
const scope = new URL(self.registration.scope);
const releaseAssets = new Map(PRECACHE.map(([asset, integrity]) => [new URL(asset, scope).href, integrity]));
const index = new URL("index.html", scope);

async function installRelease() {
  const cache = await caches.open(CACHE_NAME);
  // Wait for every request to settle before deleting an incomplete cache.
  const results = await Promise.allSettled([...releaseAssets].map(async ([url, integrity]) => {
    const request = new Request(url, { cache: "reload", integrity });
    const response = await fetch(request);
    if (!response.ok || response.redirected)
      throw new Error(`Could not cache release asset: ${url}`);
    await cache.put(request, response);
  }));
  if (results.some((result) => result.status === "rejected")) {
    await caches.delete(CACHE_NAME);
    throw new Error("The new WowGoals release could not be cached.");
  }
}

self.addEventListener("install", (event) => event.waitUntil(installRelease()));

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const previous = (await caches.keys()).filter((key) => key.startsWith(PREFIX) && key !== CACHE_NAME);
    // Old open clients can still request a previous release's lazy chunks
    // between controllerchange and their next navigation.
    await Promise.all(previous.slice(0, -1).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener("message", (event) => {
  const message = event.data;
  if (message?.type === "GET_VERSION") {
    event.ports?.[0]?.postMessage({ cacheName: CACHE_NAME, version: RELEASE, appVersion: APP_VERSION });
  } else if (message?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

async function serve(request, key, previousAsset = false) {
  // Prefer the active release's shell even online: a freshly deployed shell
  // could otherwise refer to chunks that have not been staged yet.
  try {
    const cached = await caches.match(key, { cacheName: CACHE_NAME });
    if (cached) return cached;
    if (previousAsset) {
      const previous = (await caches.keys()).filter((name) => name !== CACHE_NAME && name.startsWith(PREFIX));
      for (const name of previous.reverse()) {
        const cached = await caches.match(key, { cacheName: name });
        if (cached) return cached;
      }
    }
  } catch {
    // Cache storage can be unavailable; never discard a usable network response.
  }
  return fetch(request);
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== scope.origin || !url.pathname.startsWith(scope.pathname))
    return;
  if (request.mode === "navigate" && (url.pathname === scope.pathname || url.pathname === index.pathname)) {
    event.respondWith(serve(request, index.href));
  } else if (releaseAssets.has(url.href)) {
    event.respondWith(serve(request, url.href));
  } else if (url.pathname.startsWith(`${scope.pathname}assets/`)) {
    event.respondWith(serve(request, url.href, true));
  }
});
