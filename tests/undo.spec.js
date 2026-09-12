import { test, expect } from "@playwright/test";

const STORAGE_KEY = "zfl-14-repairs";

const seedRepairs = [
  { id: "a", location: "厨房", title: "水槽渗水", priority: "high", cost: 100, status: "todo", photo: "", note: "" },
  { id: "b", location: "卫生间", title: "花洒漏水", priority: "medium", cost: 200, status: "doing", photo: "", note: "" },
  { id: "c", location: "阳台", title: "纱窗破损", priority: "low", cost: 50, status: "todo", photo: "", note: "" }
];

async function seedPage(page) {
  await page.goto("/");
  await page.evaluate(
    ([key, repairs]) => localStorage.setItem(key, JSON.stringify({ filter: "all", repairs })),
    [STORAGE_KEY, seedRepairs]
  );
  await page.reload();
  await expect(page.locator(".repair")).toHaveCount(3);
}

test.beforeEach(async ({ page }) => {
  await seedPage(page);
});

test("单个移除后可以撤销恢复", async ({ page }) => {
  // 删除中间的「卫生间」事项
  await page.locator(".repair").filter({ hasText: "卫生间" }).locator("button[data-delete]").click();
  await expect(page.locator(".repair")).toHaveCount(2);
  await expect(page.locator(".undobar")).toContainText("已删除「卫生间」");
  await expect(page.locator(".stat").nth(1).locator("strong")).toHaveText("0");

  // 撤销：按原位置恢复，统计同步还原
  await page.click("#undo-delete");
  await expect(page.locator(".undobar")).toHaveCount(0);
  await expect(page.locator(".repair")).toHaveCount(3);
  await expect(page.locator(".repair h3").nth(0)).toHaveText("厨房");
  await expect(page.locator(".repair h3").nth(1)).toHaveText("卫生间");
  await expect(page.locator(".repair h3").nth(2)).toHaveText("阳台");
  await expect(page.locator(".stat").nth(1).locator("strong")).toHaveText("1");

  const saved = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), STORAGE_KEY);
  expect(saved.repairs.map((item) => item.id)).toEqual(["a", "b", "c"]);
});

test("撤销后刷新：恢复的事项保持，入口不再出现", async ({ page }) => {
  await page.locator(".repair").filter({ hasText: "卫生间" }).locator("button[data-delete]").click();
  await page.click("#undo-delete");
  await expect(page.locator(".repair")).toHaveCount(3);

  await page.reload();
  await expect(page.locator(".repair")).toHaveCount(3);
  await expect(page.locator(".undobar")).toHaveCount(0);

  const saved = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), STORAGE_KEY);
  expect(saved.repairs.map((item) => item.id)).toEqual(["a", "b", "c"]);
});

test("移除后未撤销直接刷新：入口消失且删除生效", async ({ page }) => {
  await page.locator(".repair").filter({ hasText: "卫生间" }).locator("button[data-delete]").click();
  await expect(page.locator(".undobar")).toHaveCount(1);

  await page.reload();
  await expect(page.locator(".undobar")).toHaveCount(0);
  await expect(page.locator(".repair")).toHaveCount(2);

  const saved = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), STORAGE_KEY);
  expect(saved.repairs.map((item) => item.id)).toEqual(["a", "c"]);
});

test("批量移除后撤销入口清空", async ({ page }) => {
  // 先单个删除，撤销入口出现
  await page.locator(".repair").filter({ hasText: "阳台" }).locator("button[data-delete]").click();
  await expect(page.locator(".undobar")).toHaveCount(1);

  // 再批量删除，撤销入口被清空，批量行为不受影响
  await page.check('input[data-select="a"]');
  page.once("dialog", (dialog) => dialog.accept());
  await page.click("#batch-delete");

  await expect(page.locator(".undobar")).toHaveCount(0);
  await expect(page.locator(".repair")).toHaveCount(1);
  await expect(page.locator(".repair h3")).toHaveText("卫生间");
});
