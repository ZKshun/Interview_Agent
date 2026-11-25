import { defineConfig } from "@playwright/test";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { existsSync } from "node:fs";

export default defineConfig({
  testDir: "./web/e2e",
  workers: 1,
  timeout: 30000,
  outputDir: join(tmpdir(), "interview-agent-playwright-results"),
  use: {
    baseURL: "http://127.0.0.1:5174",
    headless: true,
    channel:
      process.env.PLAYWRIGHT_CHANNEL ||
      (existsSync(
        "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
      )
        ? "msedge"
        : undefined),
    viewport: { width: 1440, height: 1000 },
  },
  webServer: [
    {
      command: "node server/src/server.js",
      url: "http://127.0.0.1:3011/api/health",
      reuseExistingServer: false,
      env: {
        LLM_MODE: "demo",
        PORT: "3011",
        DATA_DIR: join(tmpdir(), `interview-agent-e2e-${process.pid}`),
      },
    },
    {
      command: "npm run dev -w web -- --port 5174 --strictPort",
      url: "http://127.0.0.1:5174",
      reuseExistingServer: false,
      env: { VITE_API_TARGET: "http://127.0.0.1:3011" },
    },
  ],
});
