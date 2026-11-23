import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { Plugin } from "vite";

function releaseWorker(): Plugin {
  let output: string;
  let packagePath: string;
  return {
    name: "wowgoals-release-worker",
    apply: "build",
    configResolved(config) {
      output = resolve(config.root, config.build.outDir);
      packagePath = resolve(config.root, "package.json");
    },
    async closeBundle() {
      const paths = (await readdir(output, { recursive: true, withFileTypes: true }))
        .filter((entry) => entry.isFile())
        .map((entry) => join(entry.parentPath, entry.name).slice(output.length + 1).replaceAll("\\", "/"))
        .sort();
      const workerPath = join(output, "sw.js");
      const template = await readFile(workerPath, "utf8");
      const { version } = JSON.parse(await readFile(packagePath, "utf8"));
      const assets = paths.filter((path) => path !== "sw.js" && path !== ".nojekyll");
      const digest = createHash("sha256").update(template).update(version);
      const precache = [];
      for (const path of assets) {
        const bytes = await readFile(join(output, path));
        digest.update(JSON.stringify([path, bytes.length])).update(bytes);
        precache.push([path, `sha256-${createHash("sha256").update(bytes).digest("base64")}`]);
      }
      const release = `sha-${digest.digest("hex").slice(0, 16)}`;
      await writeFile(workerPath, template
        .replace('"__WOWGOALS_RELEASE__"', JSON.stringify(release))
        .replace('"__WOWGOALS_APP_VERSION__"', JSON.stringify(version))
        .replace('["__WOWGOALS_PRECACHE__"]', JSON.stringify(precache)));
    },
  };
}

export default defineConfig(({ command }) => ({
  base: command === "build" ? "/wow-goals/" : "/",
  plugins: [react(), releaseWorker()],
}));
