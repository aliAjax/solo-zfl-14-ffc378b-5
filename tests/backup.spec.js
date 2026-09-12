import { test, expect } from "@playwright/test";
import fs from "node:fs";

const STORAGE_KEY = "zfl-14-repairs";

async function freshPage(page) {
  await page.goto("/");
  await page.evaluate((key) => localStorage.removeItem(key), STORAGE_KEY);
  await page.reload();
  await expect(page.locator(".repair")).toHaveCount(1);
}

function validBackup(repairs) {
  return JSON.stringify({ app: "zfl-14-home-repair", version: 1, repairs });
}

const sampleRepairs = [
  {
    id: "r-1",
    location: "卫生间",
    title: "花洒漏水",
    priority: "high",
    cost: 180,
    status: "todo",
    photo: "",
    note: "周末处理"
  },
  {
    id: "r-2",
    location: "阳台",
    title: "纱窗破损",
    priority: "low",
    cost: 60,
    status: "done",
    photo: "https://example.com/screen.png",
    note: ""
  }
];

test.beforeEach(async ({ page }) => {
  await freshPage(page);
});

test("导出全部事项到本地文件", async ({ page }) => {
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.click("#export-btn")
  ]);
  expect(download.suggestedFilename()).toMatch(/^home-repairs-backup-.*\.json$/);

  const content = JSON.parse(fs.readFileSync(await download.path(), "utf-8"));
  expect(content.app).toBe("zfl-14-home-repair");
  expect(content.version).toBe(1);
  expect(content.repairs).toHaveLength(1);
  expect(content.repairs[0].title).toBe("水槽下方渗水");
  expect(content.repairs[0].location).toBe("厨房");

  await expect(page.locator(".backup-message.ok")).toHaveText("已导出 1 条事项到本地文件");
});

test("选择文件导入并恢复事项", async ({ page }) => {
  await page.setInputFiles("#import-file", {
    name: "backup.json",
    mimeType: "application/json",
    buffer: Buffer.from(validBackup(sampleRepairs))
  });

  await expect(page.locator(".backup-message.ok")).toHaveText("导入成功，已恢复 2 条事项");
  await expect(page.locator(".repair")).toHaveCount(2);
  await expect(page.locator(".repair h3").first()).toHaveText("卫生间");
  await expect(page.locator(".stat").nth(0).locator("strong")).toHaveText("1");
  await expect(page.locator(".stat").nth(2).locator("strong")).toHaveText("¥180");

  const saved = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), STORAGE_KEY);
  expect(saved.repairs).toHaveLength(2);
  expect(saved.repairs.map((item) => item.title)).toEqual(["花洒漏水", "纱窗破损"]);
});

test("导入无效文件时保留原数据并提示", async ({ page }) => {
  await page.setInputFiles("#import-file", {
    name: "broken.json",
    mimeType: "application/json",
    buffer: Buffer.from("这不是 JSON {{{")
  });
  await expect(page.locator(".backup-message.error")).toContainText("导入失败");
  await expect(page.locator(".backup-message.error")).toContainText("已保留原有数据");
  await expect(page.locator(".repair")).toHaveCount(1);
  await expect(page.locator(".repair h3")).toHaveText("厨房");

  // 结构无效（缺少必填字段）同样被拒绝
  await page.setInputFiles("#import-file", {
    name: "invalid.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ repairs: [{ location: "书房" }] }))
  });
  await expect(page.locator(".backup-message.error")).toContainText("导入失败");
  await expect(page.locator(".repair")).toHaveCount(1);

  const saved = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) || "null"), STORAGE_KEY);
  // 无效导入不写入：localStorage 未被触碰，或仍是原有事项
  const repairs = saved ? saved.repairs : null;
  expect(repairs === null || (repairs.length === 1 && repairs[0].title === "水槽下方渗水")).toBe(true);
});

test("刷新后数据保持一致", async ({ page }) => {
  await page.locator("input[name=location]").fill("卧室");
  await page.locator("textarea[name=title]").fill("空调不制冷");
  await page.locator("input[name=cost]").fill("350");
  await page.locator("button[type=submit]").click();
  await expect(page.locator(".repair")).toHaveCount(2);

  await page.reload();
  await expect(page.locator(".repair")).toHaveCount(2);
  await expect(page.locator(".repair h3").first()).toHaveText("卧室");

  await page.setInputFiles("#import-file", {
    name: "backup.json",
    mimeType: "application/json",
    buffer: Buffer.from(validBackup(sampleRepairs))
  });
  await expect(page.locator(".repair")).toHaveCount(2);

  await page.reload();
  await expect(page.locator(".repair")).toHaveCount(2);
  await expect(page.locator(".repair h3").first()).toHaveText("卫生间");
});

test("原有功能回归：新增、筛选、状态切换、删除、费用统计、照片链接", async ({ page }) => {
  // 新增（含照片链接）
  await page.locator("input[name=location]").fill("客厅");
  await page.locator("textarea[name=title]").fill("吊灯闪烁");
  await page.locator("select[name=priority]").selectOption("low");
  await page.locator("input[name=cost]").fill("120");
  await page.locator("select[name=status]").selectOption("doing");
  await page.locator("input[name=photo]").fill("https://example.com/lamp.png");
  await page.locator("button[type=submit]").click();

  await expect(page.locator(".repair")).toHaveCount(2);
  await expect(page.locator(".repair img").first()).toHaveAttribute("src", "https://example.com/lamp.png");
  // 费用统计：未完成 = 260 + 120
  await expect(page.locator(".stat").nth(0).locator("strong")).toHaveText("2");
  await expect(page.locator(".stat").nth(1).locator("strong")).toHaveText("1");
  await expect(page.locator(".stat").nth(2).locator("strong")).toHaveText("¥380");

  // 状态切换为已完成，费用统计随之更新
  await page.locator("select[data-status]").first().selectOption("done");
  await expect(page.locator(".stat").nth(0).locator("strong")).toHaveText("1");
  await expect(page.locator(".stat").nth(2).locator("strong")).toHaveText("¥260");

  // 状态筛选
  await page.click("[data-filter=done]");
  await expect(page.locator(".repair")).toHaveCount(1);
  await expect(page.locator(".repair h3")).toHaveText("客厅");
  await page.click("[data-filter=todo]");
  await expect(page.locator(".repair")).toHaveCount(1);
  await expect(page.locator(".repair h3")).toHaveText("厨房");
  await page.click("[data-filter=all]");
  await expect(page.locator(".repair")).toHaveCount(2);

  // 删除
  await page.locator("button[data-delete]").first().click();
  await expect(page.locator(".repair")).toHaveCount(1);
  await expect(page.locator(".repair h3")).toHaveText("厨房");
});
