import { defineConfig } from "@playwright/test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// 容器内无 root 权限时，浏览器系统库解压在本目录，通过 LD_LIBRARY_PATH 加载
const localLibDirs = [
  path.join(os.homedir(), ".local/pw-libs/root/lib/aarch64-linux-gnu"),
  path.join(os.homedir(), ".local/pw-libs/root/usr/lib/aarch64-linux-gnu")
].filter((dir) => fs.existsSync(dir));
const ldLibraryPath = [...localLibDirs, process.env.LD_LIBRARY_PATH].filter(Boolean).join(":");

export default defineConfig({
  testDir: "./tests",
  timeout: 30000,
  retries: 0,
  use: {
    baseURL: "http://localhost:5114",
    headless: true,
    launchOptions: {
      env: { ...process.env, LD_LIBRARY_PATH: ldLibraryPath }
    }
  },
  webServer: {
    command: "npm run dev",
    port: 5114,
    reuseExistingServer: !process.env.CI
  }
});
