import { test, expect } from "@playwright/test";
test("menu, contact, address, cart, failed payment, retry, staff fulfilment and profile", async ({
  page,
  context,
}, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "У каждого дня есть свой рассвет." }),
  ).toBeVisible();
  await expect(page.locator(".product-card")).toHaveCount(24);
  await page.screenshot({
    path: `test-results/${testInfo.project.name}-menu.png`,
  });
  await page
    .getByRole("button", { name: "Добавить адрес", exact: false })
    .first()
    .click();
  await page.getByRole("button", { name: "Войти как тестовый гость" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Добавить адрес", exact: false })
    .first()
    .click();
  await page
    .getByRole("button", { name: "Подставить тестовый адрес рядом с кофейней" })
    .click();
  await page.getByLabel("Квартира / офис").fill("12");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Сохранить", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Добавить Капучино", exact: true })
    .click();
  await page.getByRole("button", { name: "Овсяное", exact: false }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: /Добавить.*60/ })
    .click();
  await page
    .getByRole("button", {
      name: "Добавить Булочка с кардамоном и корицей",
      exact: true,
    })
    .click();
  await page.goto("/#cart");
  await expect(page.locator(".cart-item")).toHaveCount(2);
  await page
    .locator(".cart-item")
    .last()
    .getByRole("button", { name: "Добавить", exact: true })
    .click();
  await page.reload();
  await expect(
    page.locator(".cart-item").last().locator(".quantity>span"),
  ).toHaveText("2");
  await page
    .getByRole("button", { name: "Оформить заказ", exact: true })
    .click();
  await page.getByLabel("Ваше имя").fill("Гость Проверка");
  await page.getByPlaceholder("Попробуйте RASSVET10").fill("RASSVET10");
  await page.getByRole("button", { name: "Применить", exact: true }).click();
  await page.getByRole("radio").nth(1).check();
  await page
    .getByRole("button", { name: "Перейти к оплате", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Отказ банка", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Оплата не прошла" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Повторить оплату" }).click();
  await page
    .getByRole("button", { name: "Успешная оплата", exact: true })
    .click();
  await expect(page.locator(".tracking-heading .payment-status")).toHaveText(
    "Оплачено",
  );
  const orderId = new URL(page.url()).hash.split("/")[1];
  const staff = await context.newPage();
  await staff.goto("/admin");
  await staff.getByLabel("Пароль", { exact: true }).fill("rassvet-demo");
  await staff.getByRole("button", { name: "Войти", exact: true }).click();
  await expect(
    staff.getByRole("heading", { name: "Команда Рассвета" }),
  ).toBeVisible();
  await staff
    .locator(".staff-order")
    .filter({ hasText: "Гость Проверка" })
    .first()
    .click();
  for (const name of [
    "Готовим с любовью",
    "Готов к выдаче",
    "Уже в пути",
    "Заказ получен",
  ]) {
    await staff
      .getByRole("dialog")
      .getByRole("button", { name, exact: true })
      .click();
  }
  await expect(
    page.getByRole("heading", { name: "Доставлен", exact: true }),
  ).toBeVisible({ timeout: 10000 });
  await page.screenshot({
    path: `test-results/${testInfo.project.name}-order.png`,
    fullPage: true,
  });
  await staff.close();
  await page.goto("/#profile");
  await page.getByRole("button", { name: "English", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Your little corner" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Dark", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Your little corner" }),
  ).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByRole("button", { name: "O‘zbekcha", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Sizning burchagingiz" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Русский", exact: true }).click();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(overflow).toBe(false);
  expect(errors).toEqual([]);
});

test("search, stock changes and clear cart", async ({ page, context }) => {
  await page.goto("/");
  await page
    .getByRole("textbox", { name: "Найти любимое в меню" })
    .fill("капучино");
  await expect(page.locator(".product-card")).toHaveCount(1);
  const staff = await context.newPage();
  await staff.goto("/admin");
  await staff.getByLabel("Пароль", { exact: true }).fill("rassvet-demo");
  await staff.getByRole("button", { name: "Войти", exact: true }).click();
  await staff.getByRole("button", { name: "Меню", exact: true }).click();
  const stock = staff.getByRole("switch", {
    name: "В наличии Капучино",
    exact: true,
  });
  await stock.click();
  await expect(stock).not.toBeChecked();
  await expect(stock).toBeEnabled();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Добавить Капучино", exact: true }),
  ).toBeDisabled();
  await stock.click();
  await expect(stock).toBeChecked();
  await expect(stock).toBeEnabled();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Добавить Капучино", exact: true }),
  ).toBeEnabled();
  await page
    .getByRole("button", { name: "Добавить Булочка с корицей", exact: true })
    .click();
  await page.goto("/#cart");
  await page.getByRole("button", { name: "Очистить", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Очистить", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Здесь пока тихо" }),
  ).toBeVisible();
  await staff.close();
});
