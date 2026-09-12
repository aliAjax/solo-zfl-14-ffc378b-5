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
  await expect(page.locator(".batch-count")).toHaveText("已选 0 项");
}

test.beforeEach(async ({ page }) => {
  await seedPage(page);
});

test("批量切换状态", async ({ page }) => {
  await page.check('input[data-select="a"]');
  await page.check('input[data-select="c"]');
  await expect(page.locator(".batch-count")).toHaveText("已选 2 项");

  await page.click('[data-batch-status="done"]');

  // 勾选已清空，状态与统计同步更新
  await expect(page.locator(".batch-count")).toHaveText("已选 0 项");
  await expect(page.locator(".repair").filter({ hasText: "厨房" }).locator(".status")).toHaveText("已完成");
  await expect(page.locator(".repair").filter({ hasText: "阳台" }).locator(".status")).toHaveText("已完成");
  await expect(page.locator(".repair").filter({ hasText: "卫生间" }).locator(".status")).toHaveText("处理中");
  await expect(page.locator(".stat").nth(0).locator("strong")).toHaveText("1");
  await expect(page.locator(".stat").nth(2).locator("strong")).toHaveText("¥200");

  const saved = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), STORAGE_KEY);
  expect(saved.repairs.find((item) => item.id === "a").status).toBe("done");
  expect(saved.repairs.find((item) => item.id === "c").status).toBe("done");
  expect(saved.repairs.find((item) => item.id === "b").status).toBe("doing");

  // 再批量切回待处理
  await page.check('input[data-select="a"]');
  await page.check('input[data-select="b"]');
  await page.click('[data-batch-status="todo"]');
  await expect(page.locator(".repair").filter({ hasText: "厨房" }).locator(".status")).toHaveText("待处理");
  await expect(page.locator(".repair").filter({ hasText: "卫生间" }).locator(".status")).toHaveText("待处理");
  await expect(page.locator(".stat").nth(0).locator("strong")).toHaveText("2");
});

test("批量移除：取消保留数据，确认后删除", async ({ page }) => {
  // 取消确认：数据与勾选都保留
  await page.check('input[data-select="c"]');
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.click("#batch-delete");
  await expect(page.locator(".repair")).toHaveCount(3);
  await expect(page.locator(".batch-count")).toHaveText("已选 1 项");

  // 确认删除：勾选项被移除并写入 localStorage
  await page.check('input[data-select="a"]');
  let dialogMessage = "";
  page.once("dialog", (dialog) => {
    dialogMessage = dialog.message();
    dialog.accept();
  });
  await page.click("#batch-delete");

  expect(dialogMessage).toBe("确定删除选中的 2 条事项吗？");
  await expect(page.locator(".repair")).toHaveCount(1);
  await expect(page.locator(".repair h3")).toHaveText("卫生间");
  await expect(page.locator(".batch-count")).toHaveText("已选 0 项");

  const saved = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), STORAGE_KEY);
  expect(saved.repairs.map((item) => item.id)).toEqual(["b"]);
});

test("未勾选时提示先选择", async ({ page }) => {
  await page.click('[data-batch-status="done"]');
  await expect(page.locator(".batch-message")).toHaveText("请先勾选要操作的事项");

  await page.click("#batch-delete");
  await expect(page.locator(".batch-message")).toHaveText("请先勾选要操作的事项");

  // 数据未被改动
  await expect(page.locator(".repair")).toHaveCount(3);
  const saved = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), STORAGE_KEY);
  expect(saved.repairs).toHaveLength(3);

  // 勾选后提示消失
  await page.check('input[data-select="a"]');
  await expect(page.locator(".batch-message")).toHaveCount(0);
});

test("刷新后选择状态清空", async ({ page }) => {
  await page.check('input[data-select="a"]');
  await page.check('input[data-select="b"]');
  await expect(page.locator(".batch-count")).toHaveText("已选 2 项");

  await page.reload();

  await expect(page.locator(".batch-count")).toHaveText("已选 0 项");
  await expect(page.locator('input[data-select="a"]')).not.toBeChecked();
  await expect(page.locator('input[data-select="b"]')).not.toBeChecked();
  // 数据本身不受影响
  await expect(page.locator(".repair")).toHaveCount(3);
});
