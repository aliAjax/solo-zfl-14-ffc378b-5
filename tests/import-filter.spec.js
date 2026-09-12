import { test, expect } from "@playwright/test";

const STORAGE_KEY = "zfl-14-repairs";

// 种子数据：一条已完成事项，便于导入前把筛选切到「已完成」
const seedRepairs = [
  { id: "a", location: "厨房", title: "水槽渗水", priority: "high", cost: 100, status: "done", photo: "", note: "" }
];

// 备份内容：均为非已完成状态
const backupRepairs = [
  { id: "n1", location: "卫生间", title: "花洒漏水", priority: "high", cost: 180, status: "todo", photo: "", note: "" },
  { id: "n2", location: "阳台", title: "纱窗破损", priority: "low", cost: 60, status: "doing", photo: "", note: "" }
];

function backupFile(repairs = backupRepairs) {
  return {
    name: "backup.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ app: "zfl-14-home-repair", version: 1, repairs }))
  };
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(
    ([key, repairs]) => localStorage.setItem(key, JSON.stringify({ filter: "all", repairs })),
    [STORAGE_KEY, seedRepairs]
  );
  await page.reload();
  // 导入前把筛选切到「已完成」
  await page.click('[data-filter="done"]');
  await expect(page.locator('[data-filter="done"]')).toHaveClass(/active/);
  await expect(page.locator(".repair")).toHaveCount(1);
});

test("导入成功时回到全部视图并显示成功提示", async ({ page }) => {
  await page.setInputFiles("#import-file", backupFile());

  // 成功提示可见，且自动回到「全部」视图，导入内容直接可见
  await expect(page.locator(".backup-message.ok")).toHaveText("导入成功，已恢复 2 条事项");
  await expect(page.locator('[data-filter="all"]')).toHaveClass(/active/);
  await expect(page.locator(".repair")).toHaveCount(2);
  await expect(page.locator(".repair h3").first()).toHaveText("卫生间");
});

test("导入后刷新：视图与数据保持一致", async ({ page }) => {
  await page.setInputFiles("#import-file", backupFile());
  await expect(page.locator(".repair")).toHaveCount(2);

  await page.reload();

  await expect(page.locator('[data-filter="all"]')).toHaveClass(/active/);
  await expect(page.locator(".repair")).toHaveCount(2);
  await expect(page.locator(".repair h3").first()).toHaveText("卫生间");

  const saved = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), STORAGE_KEY);
  expect(saved.filter).toBe("all");
  expect(saved.repairs.map((item) => item.id)).toEqual(["n1", "n2"]);
});

test("导入失败时保留当前筛选与原数据", async ({ page }) => {
  await page.setInputFiles("#import-file", {
    name: "broken.json",
    mimeType: "application/json",
    buffer: Buffer.from("这不是 JSON {{{")
  });

  await expect(page.locator(".backup-message.error")).toContainText("导入失败");
  // 筛选与数据都保持原样
  await expect(page.locator('[data-filter="done"]')).toHaveClass(/active/);
  await expect(page.locator(".repair")).toHaveCount(1);
  await expect(page.locator(".repair h3")).toHaveText("厨房");

  const saved = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), STORAGE_KEY);
  expect(saved.filter).toBe("done");
  expect(saved.repairs.map((item) => item.id)).toEqual(["a"]);
});
