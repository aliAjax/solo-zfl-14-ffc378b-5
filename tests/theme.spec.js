import { test, expect } from "@playwright/test";

const STORAGE_KEY = "zfl-14-repairs";

async function freshPage(page) {
  await page.goto("/");
  await page.evaluate((key) => localStorage.removeItem(key), STORAGE_KEY);
  await page.reload();
  await expect(page.locator(".repair")).toHaveCount(1);
}

const htmlBg = (page) => page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor);

test.beforeEach(async ({ page }) => {
  await freshPage(page);
});

test("切换深色模式：背景、卡片、文字变深", async ({ page }) => {
  await expect(page.locator("html")).not.toHaveClass(/dark/);
  expect(await htmlBg(page)).toBe("rgb(245, 245, 241)");
  await expect(page.locator("#theme-toggle")).toHaveText("深色模式");

  await page.click("#theme-toggle");

  await expect(page.locator("html")).toHaveClass(/dark/);
  expect(await htmlBg(page)).toBe("rgb(24, 27, 24)");
  await expect(page.locator("#theme-toggle")).toHaveText("浅色模式");
  // 卡片与文字同步变深
  const cardBg = await page.locator(".panel").evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(cardBg).toBe("rgb(36, 40, 36)");
  const cardColor = await page.locator(".panel").evaluate((el) => getComputedStyle(el).color);
  expect(cardColor).toBe("rgb(230, 232, 227)");

  const saved = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), STORAGE_KEY);
  expect(saved.theme).toBe("dark");

  // 再切回浅色
  await page.click("#theme-toggle");
  await expect(page.locator("html")).not.toHaveClass(/dark/);
  expect(await htmlBg(page)).toBe("rgb(245, 245, 241)");
});

test("深色选择刷新后保留", async ({ page }) => {
  await page.click("#theme-toggle");
  await expect(page.locator("html")).toHaveClass(/dark/);

  await page.reload();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await expect(page.locator("#theme-toggle")).toHaveText("浅色模式");
  expect(await htmlBg(page)).toBe("rgb(24, 27, 24)");

  // 切回浅色同样持久化
  await page.click("#theme-toggle");
  await page.reload();
  await expect(page.locator("html")).not.toHaveClass(/dark/);
  const saved = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), STORAGE_KEY);
  expect(saved.theme).toBe("light");
});

test("深色模式下原有功能正常", async ({ page }) => {
  await page.click("#theme-toggle");
  await expect(page.locator("html")).toHaveClass(/dark/);

  // 新增
  await page.locator("input[name=location]").fill("客厅");
  await page.locator("textarea[name=title]").fill("吊灯闪烁");
  await page.locator("input[name=cost]").fill("120");
  await page.locator("button[type=submit]").click();
  await expect(page.locator(".repair")).toHaveCount(2);
  await expect(page.locator(".stat").nth(0).locator("strong")).toHaveText("2");
  await expect(page.locator(".stat").nth(2).locator("strong")).toHaveText("¥380");

  // 状态切换
  await page.locator("select[data-status]").first().selectOption("done");
  await expect(page.locator(".stat").nth(0).locator("strong")).toHaveText("1");

  // 筛选
  await page.click("[data-filter=done]");
  await expect(page.locator(".repair")).toHaveCount(1);
  await expect(page.locator(".repair h3")).toHaveText("客厅");

  // 批量操作：勾选并批量设为待处理
  await page.click("[data-filter=all]");
  await page.locator('input[data-select]').first().check();
  await page.click('[data-batch-status="todo"]');
  await expect(page.locator(".stat").nth(0).locator("strong")).toHaveText("2");

  // 深色模式全程保持开启
  await expect(page.locator("html")).toHaveClass(/dark/);
});
