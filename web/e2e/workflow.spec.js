import { test, expect } from "@playwright/test";

test("upload, inspect evidence, generate, edit, validate, delete and restore after reload", async ({
  page,
}, testInfo) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`${message.text()} (${message.location().url})`);
  });
  await page.goto("/");
  await expect(page).toHaveTitle(/Interview Studio/);
  await expect(
    page.getByRole("heading", { name: "从资料到好问题" }),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("upload-desktop.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "填入示例" }).click();
  await page.getByLabel("题目数量").fill("2");
  await page.getByRole("button", { name: "开始解析资料" }).click();
  await expect(
    page.getByRole("heading", { name: "资料解析与出题规划" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "开始规划" })).toBeEnabled();
  await page.getByRole("button", { name: "开始规划" }).click();
  await expect(page.getByText("原文依据").first()).toBeVisible();
  await page.getByRole("button", { name: "确认蓝图，生成题目" }).click();
  await expect(
    page.getByRole("heading", { name: "你的题目工作台" }),
  ).toBeVisible();
  await expect(page.locator(".question-card")).toHaveCount(2);
  await expect(
    page.getByText("评分通过", { exact: true }).first(),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("cards-desktop.png"),
    fullPage: true,
  });
  await page
    .locator(".question-card")
    .first()
    .getByRole("button", { name: "编辑", exact: true })
    .click();
  await page
    .getByLabel("题干")
    .fill("解释 Vue 组件之间的单向数据流，以及如何避免直接修改属性。");
  await page.getByRole("button", { name: "保存修改" }).click();
  await expect(page.getByText("待确认", { exact: true }).first()).toBeVisible();
  await page
    .locator(".question-card")
    .first()
    .getByRole("button", { name: "重新评分" })
    .click();
  await expect(page.getByText("评分通过", { exact: true })).toHaveCount(2);
  await page.reload();
  await expect(
    page.getByText("解释 Vue 组件之间的单向数据流，以及如何避免直接修改属性。"),
  ).toBeVisible();
  await page
    .locator(".question-card")
    .first()
    .getByRole("button", { name: "删除", exact: true })
    .click();
  await expect(page.locator(".question-card")).toHaveCount(1);
  const download = page.waitForEvent("download");
  await page.getByRole("link", { name: "导出 Markdown" }).click();
  expect((await download).suggestedFilename()).toMatch(/\.md$/);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBeTruthy();
  await page.screenshot({
    path: testInfo.outputPath("cards-mobile.png"),
    fullPage: true,
  });
  expect(errors).toEqual([]);
});

test("written mode accepts a real text file and generated cards survive refresh", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: /笔试题/ }).click();
  await page.getByLabel("任务名称").fill("笔试上传验收");
  await page.getByLabel("上传资料文件").setInputFiles({
    name: "resume.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("使用 Vue 3 实现组件通信。"),
  });
  await expect(page.locator(".file-row")).toContainText("resume.txt");
  await page.getByLabel("题目数量").fill("2");
  await page.getByRole("button", { name: "开始解析资料" }).click();
  await page.getByRole("button", { name: "开始规划" }).click();
  await page.getByRole("button", { name: "确认蓝图，生成题目" }).click();
  await expect(page.locator(".question-card")).toHaveCount(2);
  await expect(page.getByText("生成与校验已完成")).toBeVisible();
  await page.reload();
  await expect(page.locator(".question-card")).toHaveCount(2);
});
