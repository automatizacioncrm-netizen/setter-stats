// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { loadEnv } from "vite";
import vercelConfig from "./vercel.json";

// Keep Nitro's prebuilt output and Vercel's project configuration in sync.
const nitroConfig = {
  preset: "vercel",
  vercel: { config: { ...("crons" in vercelConfig ? { crons: vercelConfig.crons } : {}) } },
};

export default defineConfig({
  vite: {
    plugins: [
      {
        name: "private-report-env",
        configResolved(config) {
          if (config.command !== "serve") return;
          const env = loadEnv(config.mode, config.envDir, ["APPS_SCRIPT_", "CRON_SECRET"]);
          for (const key of [
            "APPS_SCRIPT_URL",
            "APPS_SCRIPT_SECRET",
            "CRON_SECRET",
            "APPS_SCRIPT_CITAS_URL",
          ]) {
            if (process.env[key] === undefined && env[key]) process.env[key] = env[key];
          }
        },
      },
    ],
  },
  nitro: nitroConfig,
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
});
