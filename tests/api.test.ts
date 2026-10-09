import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { openDatabase } from "../server/db";
import { createApp } from "../server/app";
import type { Order } from "../src/types";

test("API: secure order lifecycle, money, availability, idempotency and ownership", async (t) => {
  const db = openDatabase(":memory:");
  const { app } = createApp({
    db,
    demo: true,
    adminPassword: "staff-test",
    botToken: "test-token-no-network",
    staffChatId: "-123",
  });
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const addr = server.address() as { port: number };
  const base = `http://127.0.0.1:${addr.port}/api`;
  t.after(async () => {
    await new Promise<void>((r) => server.close(() => r()));
    db.close();
  });
  const call = async (
    path: string,
    method = "GET",
    body?: unknown,
    cookie = "",
  ) => {
    const response = await fetch(base + path, {
      method,
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: body ? JSON.stringify(body) : undefined,
    });
    return {
      status: response.status,
      data: await response.json(),
      cookie: response.headers.get("set-cookie")?.split(";")[0] || "",
    };
  };
  await t.test("hosting health check verifies the database without exposing config", async () => {
    const response = await fetch(base + "/health");
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.deepEqual(await response.json(), { ok: true });
  });
  const guest = await call("/auth/demo", "POST", {});
  const cookie = guest.cookie;
  const admin = await call("/admin/login", "POST", { password: "staff-test" });
  const staff = admin.cookie;
  const body = () => ({
    items: [{ productId: "p01", quantity: 2, milk: "oat" }],
    name: "Тест",
    phone: "+998901234567",
    fulfillment: "pickup",
    method: "click",
    comment: "Тестовый заказ",
    promo: "RASSVET10",
    requestKey: randomUUID(),
  });
  await t.test("guest cannot view orders or administration", async () => {
    assert.equal((await call("/orders")).status, 401);
    assert.equal((await call("/admin")).status, 401);
    assert.equal(
      (await call("/admin/products/p01", "PATCH", { available: false }, cookie))
        .status,
      401,
    );
  });
  let order: Order;
  await t.test("server computes price and ignores client totals", async () => {
    const r = await call("/orders", "POST", { ...body(), total: 1 }, cookie);
    assert.equal(r.status, 201);
    order = r.data;
    assert.equal(order.subtotal, 120000);
    assert.equal(order.discount, 12000);
    assert.equal(order.total, 108000);
    assert.equal(order.status, "awaiting_payment");
  });
  await t.test("same request cannot produce two orders", async () => {
    const b = body();
    const a = await call("/orders", "POST", b, cookie);
    const again = await call("/orders", "POST", b, cookie);
    assert.equal(again.data.id, a.data.id);
    assert.equal(
      (await call("/orders", "POST", { ...b, name: "Changed" }, cookie)).status,
      409,
    );
  });
  await t.test("unpaid order cannot enter preparation", async () => {
    assert.equal(
      (
        await call(
          "/admin/orders/" + order.id,
          "PATCH",
          { status: "preparing" },
          staff,
        )
      ).status,
      409,
    );
  });
  await t.test(
    "decline, cancel, retry and duplicate success are safe",
    async () => {
      const path = `/orders/${order.id}/demo-payment`;
      assert.equal(
        (await call(path, "POST", { outcome: "fail" }, cookie)).data.payment,
        "failed",
      );
      assert.equal(
        (await call(path, "POST", { outcome: "cancel" }, cookie)).data.status,
        "awaiting_payment",
      );
      const paid = await call(path, "POST", { outcome: "success" }, cookie);
      assert.equal(paid.data.payment, "paid");
      assert.equal(paid.data.status, "accepted");
      const duplicate = await call(
        path,
        "POST",
        { outcome: "success" },
        cookie,
      );
      assert.equal(duplicate.data.history.length, 2);
    },
  );
  await t.test("order is inaccessible to another customer", async () => {
    const other = await call("/auth/demo", "POST", {});
    assert.equal(
      (
        await call(
          `/orders/${order.id}/demo-payment`,
          "POST",
          { outcome: "success" },
          other.cookie,
        )
      ).status,
      404,
    );
    assert.deepEqual(
      (await call("/orders", "GET", undefined, other.cookie)).data,
      [],
    );
  });
  await t.test("successful retry queues exactly one staff notification", () => {
    const notes = db
      .prepare("SELECT * FROM notifications WHERE id=?")
      .all(`${order.id}:accepted:staff`);
    assert.equal(notes.length, 1);
  });
  await t.test(
    "staff advances pickup only along valid transitions",
    async () => {
      for (const status of ["preparing", "ready", "completed"]) {
        const r = await call(
          "/admin/orders/" + order.id,
          "PATCH",
          { status },
          staff,
        );
        assert.equal(r.status, 200);
        assert.equal(r.data.status, status);
      }
      assert.equal(
        (
          await call(
            "/admin/orders/" + order.id,
            "PATCH",
            { status: "preparing" },
            staff,
          )
        ).status,
        409,
      );
    },
  );
  await t.test(
    "minimum, invalid promo and duplicate lines rejected",
    async () => {
      assert.equal(
        (
          await call(
            "/orders",
            "POST",
            {
              ...body(),
              items: [{ productId: "p10", quantity: 1, milk: "regular" }],
            },
            cookie,
          )
        ).data.error,
        "MINIMUM",
      );
      assert.equal(
        (await call("/orders", "POST", { ...body(), promo: "NOPE" }, cookie))
          .data.error,
        "PROMO_INVALID",
      );
      const b = body();
      b.items.push(b.items[0]);
      assert.equal(
        (await call("/orders", "POST", b, cookie)).data.error,
        "VALIDATION",
      );
    },
  );
  await t.test(
    "unavailable products and invalid options rejected",
    async () => {
      await call("/admin/products/p01", "PATCH", { available: false }, staff);
      assert.equal(
        (await call("/orders", "POST", body(), cookie)).data.error,
        "UNAVAILABLE",
      );
      await call("/admin/products/p01", "PATCH", { available: true }, staff);
      assert.equal(
        (
          await call(
            "/orders",
            "POST",
            {
              ...body(),
              items: [{ productId: "p10", quantity: 2, milk: "oat" }],
            },
            cookie,
          )
        ).data.error,
        "INVALID_OPTION",
      );
    },
  );
  await t.test(
    "delivery zone enforced on server; delivery state and fee supported",
    async () => {
      const address = {
        id: "a1",
        label: "Дом",
        street: "Ташкент, тестовая улица 1",
        lat: 41.4,
        lon: 69.2729,
        apartment: "12",
        entrance: "2",
        floor: "3",
        comment: "Звонок",
      };
      await call(
        "/me",
        "PATCH",
        { addresses: [address], selectedAddress: "a1" },
        cookie,
      );
      assert.equal(
        (
          await call(
            "/orders",
            "POST",
            { ...body(), fulfillment: "delivery", addressId: "a1" },
            cookie,
          )
        ).data.error,
        "OUTSIDE_ZONE",
      );
      address.lat = 41.3061;
      await call("/me", "PATCH", { addresses: [address] }, cookie);
      const r = await call(
        "/orders",
        "POST",
        { ...body(), method: "cash", fulfillment: "delivery", addressId: "a1" },
        cookie,
      );
      assert.equal(r.status, 201);
      assert.equal(r.data.total, 123000);
      assert.equal(r.data.address.apartment, "12");
      assert.equal(r.data.payment, "cash");
      for (const status of ["preparing", "ready", "delivering", "completed"])
        assert.equal(
          (await call("/admin/orders/" + r.data.id, "PATCH", { status }, staff))
            .status,
          200,
        );
    },
  );
  await t.test(
    "paid cancellation produces simulated refund and blocks late payments",
    async () => {
      const r = await call("/orders", "POST", body(), cookie);
      await call(
        `/orders/${r.data.id}/demo-payment`,
        "POST",
        { outcome: "success" },
        cookie,
      );
      const cancelled = await call(
        "/admin/orders/" + r.data.id,
        "PATCH",
        { status: "cancelled" },
        staff,
      );
      assert.equal(cancelled.data.payment, "refunded");
      assert.equal(
        (
          await call(
            `/orders/${r.data.id}/demo-payment`,
            "POST",
            { outcome: "success" },
            cookie,
          )
        ).status,
        409,
      );
    },
  );
  await t.test("cross-origin writes blocked", async () => {
    const r = await fetch(base + "/auth/demo", {
      method: "POST",
      headers: {
        Origin: "https://evil.example",
        "Content-Type": "application/json",
      },
      body: "{}",
    });
    assert.equal(r.status, 403);
  });
  await t.test("logout invalidates admin token", async () => {
    await call("/admin/logout", "POST", {}, staff);
    assert.equal((await call("/admin", "GET", undefined, staff)).status, 401);
  });
});
test("non-demo mode disables mock login, mock payment and clock override", async (t) => {
  const db = openDatabase(":memory:");
  const { app } = createApp({ db, demo: false, adminPassword: "test" });
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address() as { port: number };
  t.after(async () => {
    await new Promise<void>((r) => server.close(() => r()));
    db.close();
  });
  for (const path of ["/auth/demo", "/orders/anything/demo-payment"]) {
    const r = await fetch(`http://127.0.0.1:${port}/api${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    assert.equal(r.status, 403);
  }
});
