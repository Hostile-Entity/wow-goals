# Today startup and offline releases

## Reproduce the startup check

Build and serve the production output, then run the benchmark in another terminal:

```bash
npm run build
node tests/serve-production.mjs
node tests/benchmark-startup.mjs
```

Use the same machine for both builds, and avoid running other browser tests during a measurement. The script uses Pixel 7 emulation in Chromium, 4× CPU slowdown, and five samples per scenario. It generates fixtures with 20 or 12,000 audit events **and** the same number of older completions. `TEST_DIST=/path/to/dist PORT=4175 node tests/serve-production.mjs` can serve a prior build alongside the current one; pass the full app URL to the benchmark to select it. `PREINDEX=0` also measures the one-time index upgrade on the first launch.

- **First visit:** fresh browser context and no installed worker; the fixture is preloaded without opening the app.
- **Installed-worker launch:** new page in the same context, with the worker already installed, online and offline. This simulates a new document, not a cold phone OS process or tapping a home-screen icon.
- **Running-page resume:** dispatch a visible-page event and time the first animation frame with controls already mounted. A separate browser test checks that resume reconciles a missed write and a changed logical day.
- **Timing:** navigation ends at the HTML response; script startup runs to the IndexedDB open; the database phase ends on the read transaction; render ends when the Today control enters the DOM. Values are medians, so rounded phases may not add to the median total.
- **Notes and install:** first Notes navigation ends when a Markdown note is visible. The test server separately counts response body bytes sent through first installation (including repeat requests, without compression) and the benchmark measures the bytes retained in the worker's cache.

The local acceptance target is under **300 ms** to Today controls for the large fixture in all new-document scenarios, with **zero full audit-log scans**. Full history remains available from Review, chart history, Complete Log, and JSON export.

## Local results

Medians in milliseconds, P0 build → P1 build:

| Scenario | 20 events + 20 completions | 12,000 events + 12,000 completions |
| --- | ---: | ---: |
| First visit, online | 179 → 147 | 1,023 → 145 |
| Installed worker, new page, online | 185 → 162 | 1,043 → 161 |
| Installed worker, new page, offline | 199 → 150 | 1,050 → 149 |
| Running page, visibility resume, online | 5 → 6 | 2 → 7 |
| Running page, visibility resume, offline | 2 → 6 | 7 → 7 |
| First Notes navigation including Markdown | 187 → 257 | 204 → 254 |

On the large first visit, navigation took **1 → 1 ms**, JavaScript startup **125 → 124 ms**, IndexedDB **843 → 11 ms**, and rendering **56 → 9 ms**. The large installed-worker launches dropped from **848–855 ms** of IndexedDB time to **16–17 ms**. All six new-document cases went from one full audit-log read to zero.

Startup JavaScript, including the statically imported DB chunk, shrank from **426 kB to 258 kB** (about **130 kB to 81 kB gzip**). First Notes navigation costs more because its Markdown renderer now loads on demand. The worker retains **886 kB**, up from **463 kB**, because the cache now includes lazy chunks, icons, and audio. Despite the larger cache, the local origin sent **1.18 MB** through first install, down from **1.39 MB** over three additional runs: the worker no longer fetches the full startup bundle for both shell aliases. Production compression and browser caches can change transfer sizes.

Existing schema-5 databases may perform a one-time physical upgrade to add the day and week indexes. This changes neither the logical schema marker nor the records or recovery snapshots.

## Physical-device release checks

These are still manual. Use the phone where startup felt slow. Before updating, export an off-device backup. For both fixtures, time first visit, an already-running resume, and a home-screen launch after closing the installed app; use online and airplane mode where applicable. Repeat on the same device after updating. Verify Today counts after resuming across a logical day change.

On iOS, add the app to the Home Screen from Safari, allow the initial cache to finish online, and close and reopen it in airplane mode. Open Notes, weekly Review, and Goal chart history without going online first. Then reconnect, stage a newer release, confirm the installed version remains unchanged until applying the update, and verify the new release launches offline. Browser emulation does not replace these checks.
