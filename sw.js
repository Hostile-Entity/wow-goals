// Replaced by the production build after all output files have been written.
const RELEASE = "sha-592d649cf09c631b";
const APP_VERSION = "0.1.3";
const PRECACHE = [["assets/GoalMetricChartsModal-DxnTEqvA.js","sha256-oTkC3Bkewdpch+Yna4FwOLKx6scYtfr8BjPoDEcRlZM="],["assets/NoteMarkdown-CMsoB-Z9.js","sha256-H09m4rzKRFqZiGnSPluPVWCwrDFgor31T7WUizzbwmk="],["assets/ReviewTab-BCWnsCTN.js","sha256-vqnCjXvLAfqUrTLbVhQ3Eb2uzZb/0u+WjNcOuOV/+cg="],["assets/index-BBcNDGZG.css","sha256-IbeQf9lA/93Mguqba05ZVLOzSrX9TKg2BWjxQF1sJ6U="],["assets/index-CR8smwnc.js","sha256-1pzfd8LGBIv8N2nrYeENvCoF99TA+JNgkNTsFnyAlrs="],["icons/icon-192.png","sha256-ZJ3+y8Y48wNVNihAgcV93+2GC0Me9TC9gLI/Ay5k/qU="],["icons/icon-512.png","sha256-7CmiOSmVzLqTfBWkddj/Pwr8T6o6CLM7JgEx/vB24cE="],["icons/icon.svg","sha256-SyandXCdfgWZ59iCR1j/dPs83Q6ikEHz+54ZXyykrvw="],["index.html","sha256-azCeBdErwn4yrP5ycj4sFYEk7HHzzA4wZbxSZIJfPfA="],["manifest.webmanifest","sha256-G7z8OOXnuKA+3AtABJlqeULxrjfTM0xDqdRj6DiaTNs="],["sounds/iUiInterfaceButtonA.ogg","sha256-zIQjmbgMDxR28VNce7AMr60BPe3KAUQCdVehECBKivE="],["sounds/uChatScrollButton.ogg","sha256-ypOUzAJYuAmkIF2/Rn84uX7YBgIdLGEu0g5UfM4l6aM="]];

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
