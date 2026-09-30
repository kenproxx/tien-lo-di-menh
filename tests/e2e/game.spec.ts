import { test, expect, type Page } from "@playwright/test";
import { authFixture } from "../helpers/auth-fixture.js";
import { randomUUID } from "node:crypto";
async function register(page: Page, name: string, throughUi = false) {
  if (!throughUi) {
    const fixture = await authFixture(name);
    await page.context().addCookies(fixture.cookies);
    await page.goto("/");
  } else {
    await page.goto("/");
    await page
      .getByRole("button", { name: "Chưa có tài khoản? Kết tiên duyên" })
      .click();
    await page.getByLabel("Danh xưng").fill(name);
    await page
      .getByLabel("Email", { exact: true })
      .fill(`${randomUUID()}@example.com`);
    await page.getByLabel("Mật khẩu").fill("Test-password-1234");
    await page
      .getByRole("button", { name: "Tạo tài khoản", exact: false })
      .click();
  }
  await expect(page.getByText("Người sẽ bước tiếp là ai?")).toBeVisible();
  await page.getByPlaceholder("Đặt tên nhân vật").fill(name);
  await page.getByRole("button", { name: "Tạo nhân vật", exact: true }).click();
  await page.getByRole("button", { name: "Tiếp tục tu hành" }).click();
  await expect(page.locator("#char-name")).toHaveText(name);
  await expect(page.locator("canvas")).toBeVisible();
}
test("auth, character, live world, movement, combat, inventory and reconnect", async ({
  page,
}) => {
  let latest: any;
  page.on("websocket", (ws) =>
    ws.on("framereceived", (frame) => {
      const m = JSON.parse(String(frame.payload));
      if (m.type === "snapshot") latest = m;
    }),
  );
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await register(page, "Thanh Vân", true);
  await page.screenshot({
    path: "docs/evidence/game-desktop.png",
    fullPage: true,
  });
  await expect(page.locator("#hp-text")).toContainText("/");
  await page.keyboard.down("d");
  await page.waitForTimeout(2450);
  await page.keyboard.up("d");
  await page.keyboard.press("Space");
  await page.waitForTimeout(500);
  await page.getByRole("button", { name: "Hành trang" }).first().click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(
    page.getByRole("dialog").getByText("Hồi Huyết Đan", { exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "docs/evidence/inventory-desktop.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Đóng", exact: true }).click();
  await page.reload();
  await page.getByRole("button", { name: "Tiếp tục tu hành" }).click();
  await expect(page.locator("#char-name")).toHaveText("Thanh Vân");
  const reconnectX = latest.you.x;
  await page.keyboard.down("d");
  await page.waitForTimeout(650);
  await page.keyboard.up("d");
  await expect.poll(() => latest.you.x).toBeGreaterThan(reconnectX + 50);
  expect(errors).toEqual([]);
});
test("two authenticated browser contexts share actual monster damage", async ({
  browser,
}) => {
  const contextA = await browser.newContext(),
    contextB = await browser.newContext();
  const a = await contextA.newPage(),
    b = await contextB.newPage();
  let latestA: any, latestB: any;
  for (const [page, set] of [
    [a, (s: any) => (latestA = s)],
    [b, (s: any) => (latestB = s)],
  ] as const)
    page.on("websocket", (ws) =>
      ws.on("framereceived", (frame) => {
        try {
          const m = JSON.parse(String(frame.payload));
          if (m.type === "snapshot") set(m);
        } catch {}
      }),
    );
  await register(a, "Kiếm Khách");
  await register(b, "Pháp Khách");
  await expect
    .poll(() =>
      Boolean(
        latestA?.players.some((p: any) => p.id === latestB?.you.id) &&
          latestB?.players.some((p: any) => p.id === latestA?.you.id),
      ),
    )
    .toBe(true);
  await a.keyboard.down("d");
  await a.waitForTimeout(2450);
  await a.keyboard.up("d");
  let hit: any;
  await expect
    .poll(
      async () => {
        await a.keyboard.press("Space");
        await a.waitForTimeout(120);
        hit = latestA?.events.find(
          (event: any) =>
            event.type === "hit" && event.actor === latestA.you.id,
        );
        return Boolean(hit);
      },
      { timeout: 20000, intervals: [850] },
    )
    .toBe(true);
  await expect
    .poll(() => {
      const ma = latestA?.monsters.find((m: any) => m.id === hit?.target),
        mb = latestB?.monsters.find((m: any) => m.id === hit?.target);
      return Boolean(
        ma && mb && ma.hp === mb.hp && BigInt(ma.hp) < BigInt(ma.maxHp),
      );
    })
    .toBe(true);
  await a.screenshot({ path: "docs/evidence/two-players.png", fullPage: true });
  await contextA.close();
  await contextB.close();
});
test("mobile viewport retains world, navigation and touch input", async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  await register(page, "Linh Nhi");
  await expect(page.getByRole("button", { name: "Sang phải" })).toBeVisible();
  await expect(page.locator(".mobile-nav")).toBeVisible();
  await page.screenshot({
    path: "docs/evidence/game-mobile.png",
    fullPage: true,
  });
  await page
    .locator(".mobile-nav")
    .getByRole("button", { name: "Thiên mệnh" })
    .click();
  await expect(page.getByRole("dialog")).toContainText("Đạt cấp 18");
  await context.close();
});

test("manual crafting validates server timing and commits improved output", async ({
  page,
}) => {
  let latest: any;
  page.on("websocket", (ws) =>
    ws.on("framereceived", (frame) => {
      const m = JSON.parse(String(frame.payload));
      if (m.type === "snapshot") latest = m;
    }),
  );
  await register(page, "Đan Sư");
  await page.getByRole("button", { name: "Đan & Rèn" }).first().click();
  await page
    .getByRole("button", { name: "Kết luyện trực tiếp" })
    .first()
    .click();
  await expect(
    page.getByRole("button", { name: "Kết luyện", exact: true }),
  ).toBeVisible();
  await page.waitForTimeout(1850);
  await page.getByRole("button", { name: "Kết luyện", exact: true }).click();
  await expect.poll(() => latest.you.coins).toBe("180");
  await expect
    .poll(
      () =>
        latest.you.inventory.find((i: any) => i.template === "pill-0").quantity,
    )
    .toBe(12);
});
