import express, {
  type Request,
  type Response,
  type NextFunction,
} from "express";
import {
  randomBytes,
  randomUUID,
  createHash,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import { z } from "zod";
import type { DatabaseSync } from "node:sqlite";
import type {
  User,
  Product,
  Settings,
  Promo,
  Story,
  Order,
  Status,
} from "../src/types";
import { CAFE, distanceKm, isOpen, validateTelegram } from "./domain";

type Options = {
  db: DatabaseSync;
  demo: boolean;
  adminPassword: string;
  botToken?: string;
  mapsKey?: string;
  appUrl?: string;
  staffChatId?: string;
};
class ApiError extends Error {
  constructor(
    public code: string,
    public status = 400,
  ) {
    super(code);
  }
}
const phone = z.string().regex(/^\+998\d{9}$/);
const addressSchema = z.object({
  id: z.string().min(1).max(80),
  label: z.string().trim().min(1).max(40),
  street: z.string().trim().min(5).max(250),
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  apartment: z.string().max(30),
  entrance: z.string().max(30),
  floor: z.string().max(20),
  comment: z.string().max(500),
});
const cartSchema = z
  .array(
    z.object({
      productId: z.string().max(50),
      quantity: z.number().int().min(1).max(50),
      milk: z.enum(["regular", "oat", "almond"]),
    }),
  )
  .min(1)
  .max(100);
const localized = z.object({
  ru: z.string().trim().min(1).max(500),
  en: z.string().trim().min(1).max(500),
  uz: z.string().trim().min(1).max(500),
});

export function createApp(opts: Options) {
  const { db, demo } = opts;
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "1mb" }));
  const getConfig = <T>(id: string): T =>
    JSON.parse(
      (
        db.prepare("SELECT data FROM config WHERE id=?").get(id) as {
          data: string;
        }
      ).data,
    );
  const setConfig = (id: string, value: unknown) =>
    db
      .prepare("UPDATE config SET data=? WHERE id=?")
      .run(JSON.stringify(value), id);
  const getUser = (id: string): User | null => {
    const row = db.prepare("SELECT data FROM users WHERE id=?").get(id) as
      | { data: string }
      | undefined;
    return row ? JSON.parse(row.data) : null;
  };
  const saveUser = (user: User) =>
    db
      .prepare(
        "INSERT INTO users VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET data=excluded.data",
      )
      .run(user.id, JSON.stringify(user));
  const products = (): Product[] =>
    (db.prepare("SELECT data FROM products").all() as { data: string }[]).map(
      (r) => JSON.parse(r.data),
    );
  const saveOrder = (order: Order) =>
    db
      .prepare("UPDATE orders SET data=? WHERE id=?")
      .run(JSON.stringify(order), order.id);
  const enqueueNotification = (order: Order) => {
    if (!opts.botToken) return;
    const insert = (role: string, chat: string, text: string) =>
      db
        .prepare(
          "INSERT OR IGNORE INTO notifications (id,chat_id,text) VALUES (?,?,?)",
        )
        .run(`${order.id}:${order.status}:${role}`, chat, text.slice(0, 4000));
    if (order.status === "accepted" && opts.staffChatId)
      insert(
        "staff",
        opts.staffChatId,
        `${order.demo ? "[ДЕМО] " : ""}Новый заказ #${order.number}\n${order.name}, ${order.phone}\n${order.fulfillment === "delivery" ? "Доставка: " + order.address?.street : "Самовывоз"}\n${order.address ? [order.address.apartment && "Кв.: " + order.address.apartment, order.address.entrance && "Подъезд: " + order.address.entrance, order.address.floor && "Этаж: " + order.address.floor, order.address.comment].filter(Boolean).join(", ") : ""}\n${order.items.map((i) => `${i.quantity} × ${i.name.ru} (${i.milk})`).join("\n")}\nИтого: ${order.total} сум; ${order.method}, ${order.payment}\n${order.comment}`,
      );
    const customer = getUser(order.userId);
    if (customer?.telegramId && order.status !== "awaiting_payment") {
      const labels: Record<string, string[]> = {
        accepted: ["Заказ принят", "Order accepted", "Buyurtma qabul qilindi"],
        preparing: [
          "Готовим ваш заказ",
          "Preparing your order",
          "Buyurtmangiz tayyorlanmoqda",
        ],
        ready: ["Заказ готов", "Order is ready", "Buyurtma tayyor"],
        delivering: ["Курьер в пути", "Courier is on the way", "Kuryer yo‘lda"],
        completed: [
          "Заказ получен. Спасибо!",
          "Order received. Thank you!",
          "Buyurtma olindi. Rahmat!",
        ],
        cancelled: [
          "Заказ отменён",
          "Order cancelled",
          "Buyurtma bekor qilindi",
        ],
      };
      const label =
        labels[order.status]?.[
          customer.language === "ru" ? 0 : customer.language === "en" ? 1 : 2
        ];
      insert(
        "customer",
        String(customer.telegramId),
        `${order.demo ? "[DEMO] " : ""}Рассвет #${order.number}\n${label}${order.courierNote ? "\n" + order.courierNote : ""}`,
      );
    }
  };
  const session = (req: Request, role = "user") => {
    const cookie = req.headers.cookie
      ?.split(";")
      .map((s) => s.trim())
      .find((s) => s.startsWith(`rassvet_${role}=`))
      ?.split("=")[1];
    if (!cookie) return null;
    return db
      .prepare(
        "SELECT user_id FROM sessions WHERE token=? AND role=? AND expires>?",
      )
      .get(
        createHash("sha256").update(cookie).digest("hex"),
        role,
        Date.now(),
      ) as { user_id: string } | undefined;
  };
  const auth = (req: Request) => {
    const s = session(req);
    if (!s) throw new ApiError("AUTH_REQUIRED", 401);
    const u = getUser(s.user_id);
    if (!u) throw new ApiError("AUTH_REQUIRED", 401);
    return u;
  };
  const admin = (req: Request) => {
    if (!session(req, "admin")) throw new ApiError("ADMIN_REQUIRED", 401);
  };
  const issueSession = (
    req: Request,
    res: Response,
    id: string,
    role = "user",
  ) => {
    const token = randomBytes(32).toString("hex");
    db.prepare("DELETE FROM sessions WHERE expires<?").run(Date.now());
    db.prepare("INSERT INTO sessions VALUES (?, ?, ?, ?)").run(
      createHash("sha256").update(token).digest("hex"),
      id,
      role,
      Date.now() + 7 * 86400000,
    );
    res.cookie(`rassvet_${role}`, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: opts.appUrl?.startsWith("https://") || req.secure,
      maxAge: 7 * 86400000,
    });
  };
  const ownedOrder = (req: Request) => {
    const user = auth(req);
    const row = db
      .prepare("SELECT data FROM orders WHERE id=? AND user_id=?")
      .get(String(req.params.id), user.id) as { data: string } | undefined;
    if (!row) throw new ApiError("NOT_FOUND", 404);
    return JSON.parse(row.data) as Order;
  };
  app.use("/api", (req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    if (!["GET", "HEAD"].includes(req.method)) {
      const origin = req.headers.origin;
      const allowed = new Set([
        `http://${req.headers.host}`,
        `https://${req.headers.host}`,
        "http://127.0.0.1:5173",
        "http://localhost:5173",
        ...(opts.appUrl ? [new URL(opts.appUrl).origin] : []),
      ]);
      if (
        (origin && !allowed.has(origin)) ||
        req.headers["sec-fetch-site"] === "cross-site"
      )
        return res.status(403).json({ error: "ORIGIN_DENIED" });
    }
    next();
  });
  const attempts = new Map<string, { count: number; until: number }>();
  app.use(
    ["/api/admin/login", "/api/auth/telegram", "/api/auth/demo"],
    (req, _res, next) => {
      const key = `${req.ip}:${req.path}`;
      const current = attempts.get(key);
      if (attempts.size > 10000)
        for (const [k, v] of attempts)
          if (v.until < Date.now()) attempts.delete(k);
      const state =
        current && current.until > Date.now()
          ? current
          : { count: 0, until: Date.now() + 60000 };
      attempts.set(key, state);
      if (++state.count > 20) throw new ApiError("RATE_LIMIT", 429);
      next();
    },
  );
  app.get("/api/health", (_req, res) => {
    db.prepare("SELECT 1").get();
    res.json({ ok: true });
  });
  app.get("/api/catalog", (_req, res) =>
    res.json({
      products: products(),
      config: {
        demo,
        mapsKey: opts.mapsKey || "",
        cafe: CAFE,
        settings: getConfig<Settings>("settings"),
        promos: getConfig<Promo[]>("promos").filter((p) => p.active),
        stories: getConfig<Story[]>("stories").filter((s) => s.active),
        open: isOpen(getConfig("settings"), new Date(), demo),
      },
    }),
  );
  app.get("/api/me", (req, res) => {
    const s = session(req);
    res.json({ user: s ? getUser(s.user_id) : null });
  });
  app.post("/api/auth/demo", (req, res) => {
    if (!demo) throw new ApiError("DEMO_DISABLED", 403);
    const existing = session(req);
    if (existing) return res.json({ user: getUser(existing.user_id) });
    const user: User = {
      id: randomUUID(),
      name: "Гость Рассвета",
      phone: "+998900000000",
      avatar: "",
      language: "ru",
      theme: "system",
      addresses: [],
      selectedAddress: "",
    };
    saveUser(user);
    issueSession(req, res, user.id);
    res.json({ user });
  });
  app.post("/api/auth/telegram", (req, res) => {
    if (!opts.botToken) throw new ApiError("TELEGRAM_NOT_CONFIGURED", 503);
    const { initData } = z
      .object({ initData: z.string().min(1).max(10000) })
      .parse(req.body);
    let tg;
    try {
      tg = validateTelegram(initData, opts.botToken);
    } catch {
      throw new ApiError("AUTH_INVALID", 401);
    }
    const id = `tg:${tg.id}`;
    const user = getUser(id) || {
      id,
      telegramId: tg.id,
      name: [tg.first_name, tg.last_name].filter(Boolean).join(" ") || "Гость",
      phone: "",
      avatar: "",
      language: "ru" as const,
      theme: "system" as const,
      addresses: [],
      selectedAddress: "",
    };
    saveUser(user);
    issueSession(req, res, id);
    res.json({ user });
  });
  app.patch("/api/me", (req, res) => {
    const user = auth(req);
    const patch = z
      .object({
        name: z.string().trim().min(1).max(80).optional(),
        avatar: z
          .string()
          .max(700000)
          .refine(
            (s) =>
              !s ||
              /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/.test(s),
          )
          .optional(),
        language: z.enum(["ru", "en", "uz"]).optional(),
        theme: z.enum(["light", "dark", "system"]).optional(),
        phone: phone.optional(),
        addresses: z.array(addressSchema).max(20).optional(),
        selectedAddress: z.string().max(80).optional(),
      })
      .parse(req.body);
    if (patch.phone && user.telegramId && patch.phone !== user.phone)
      throw new ApiError("PHONE_TELEGRAM");
    if (patch.phone && !demo) throw new ApiError("PHONE_TELEGRAM");
    Object.assign(user, patch);
    if (new Set(user.addresses.map((a) => a.id)).size !== user.addresses.length)
      throw new ApiError("VALIDATION");
    if (
      user.selectedAddress &&
      !user.addresses.some((a) => a.id === user.selectedAddress)
    )
      user.selectedAddress = user.addresses[0]?.id || "";
    saveUser(user);
    res.json({ user });
  });
  app.get("/api/orders", (req, res) => {
    const u = auth(req);
    res.json(
      (
        db
          .prepare(
            "SELECT data FROM orders WHERE user_id=? ORDER BY number DESC",
          )
          .all(u.id) as { data: string }[]
      ).map((r) => JSON.parse(r.data)),
    );
  });
  app.post("/api/orders", (req, res) => {
    const user = auth(req);
    const body = z
      .object({
        items: cartSchema,
        fulfillment: z.enum(["pickup", "delivery"]),
        method: z.enum(["cash", "click", "payme"]),
        addressId: z.string().max(80).optional(),
        name: z.string().trim().min(1).max(80),
        phone,
        comment: z.string().max(500),
        promo: z.string().trim().max(40),
        requestKey: z.string().uuid(),
      })
      .parse(req.body);
    const hash = createHash("sha256")
      .update(JSON.stringify(body))
      .digest("hex");
    const duplicate = db
      .prepare(
        "SELECT data, request_hash FROM orders WHERE user_id=? AND request_key=?",
      )
      .get(user.id, body.requestKey) as
      | { data: string; request_hash: string }
      | undefined;
    if (duplicate) {
      if (duplicate.request_hash !== hash)
        throw new ApiError("IDEMPOTENCY_CONFLICT", 409);
      return res.json(JSON.parse(duplicate.data));
    }
    if (!user.phone) throw new ApiError("PHONE_REQUIRED");
    if (user.telegramId && body.phone !== user.phone)
      throw new ApiError("PHONE_TELEGRAM");
    if (!demo && body.method !== "cash")
      throw new ApiError("PAYMENT_NOT_CONFIGURED", 503);
    const settings = getConfig<Settings>("settings");
    if (!isOpen(settings, new Date(), demo)) throw new ApiError("CLOSED");
    const all = products();
    const seen = new Set<string>();
    const items = body.items.map((i) => {
      const key = `${i.productId}:${i.milk}`;
      if (seen.has(key)) throw new ApiError("VALIDATION");
      seen.add(key);
      const product = all.find((p) => p.id === i.productId);
      if (!product || !product.available)
        throw new ApiError("UNAVAILABLE", 409);
      if (!product.options && i.milk !== "regular")
        throw new ApiError("INVALID_OPTION");
      return {
        ...i,
        name: product.name,
        unitPrice: product.price + (i.milk !== "regular" ? 10000 : 0),
        image: product.image,
      };
    });
    const subtotal = items.reduce((s, i) => s + i.unitPrice * i.quantity, 0);
    if (subtotal < settings.minimum) throw new ApiError("MINIMUM");
    const promo = body.promo.toUpperCase();
    const promotion = getConfig<Promo[]>("promos").find(
      (p) => p.active && p.code === promo,
    );
    if (promo && !promotion) throw new ApiError("PROMO_INVALID");
    const discount = promotion
      ? Math.floor((subtotal * promotion.percent) / 100)
      : 0;
    let address = null;
    if (body.fulfillment === "delivery") {
      address = user.addresses.find((a) => a.id === body.addressId) || null;
      if (!address) throw new ApiError("ADDRESS_REQUIRED");
      if (distanceKm(address.lat, address.lon) > settings.radius)
        throw new ApiError("OUTSIDE_ZONE");
    }
    const deliveryFee =
      body.fulfillment === "delivery" ? settings.deliveryFee : 0;
    const status = body.method === "cash" ? "accepted" : "awaiting_payment";
    const now = new Date().toISOString();
    const order: Order = {
      id: randomUUID(),
      number: 0,
      userId: user.id,
      name: body.name,
      phone: body.phone,
      items,
      subtotal,
      discount,
      deliveryFee,
      total: subtotal - discount + deliveryFee,
      promo,
      method: body.method,
      fulfillment: body.fulfillment,
      address,
      comment: body.comment,
      status,
      payment: body.method === "cash" ? "cash" : "pending",
      history: [{ status, at: now }],
      createdAt: now,
      demo,
      courierNote: "",
    };
    db.exec("BEGIN IMMEDIATE");
    try {
      const result = db
        .prepare(
          "INSERT INTO orders (id,user_id,request_key,request_hash,data) VALUES (?,?,?,?,?)",
        )
        .run(order.id, user.id, body.requestKey, hash, JSON.stringify(order));
      order.number = Number(result.lastInsertRowid);
      saveOrder(order);
      enqueueNotification(order);
      db.exec("COMMIT");
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
    res.status(201).json(order);
  });
  app.post("/api/orders/:id/demo-payment", (req, res) => {
    if (!demo) throw new ApiError("DEMO_DISABLED", 403);
    const order = ownedOrder(req);
    const { outcome } = z
      .object({ outcome: z.enum(["success", "fail", "cancel"]) })
      .parse(req.body);
    if (order.payment === "paid") return res.json(order);
    if (
      !order.demo ||
      order.method === "cash" ||
      order.status !== "awaiting_payment"
    )
      throw new ApiError("INVALID_TRANSITION", 409);
    if (outcome === "success") {
      order.payment = "paid";
      order.status = "accepted";
      order.history.push({ status: "accepted", at: new Date().toISOString() });
    } else order.payment = outcome === "fail" ? "failed" : "pending";
    saveOrder(order);
    enqueueNotification(order);
    res.json(order);
  });
  app.post("/api/admin/login", (req, res) => {
    const { password } = z
      .object({ password: z.string().min(1).max(200) })
      .parse(req.body);
    if (
      !timingSafeEqual(
        scryptSync(password, "rassvet-admin", 32),
        scryptSync(opts.adminPassword, "rassvet-admin", 32),
      )
    )
      throw new ApiError("PASSWORD_INVALID", 401);
    issueSession(req, res, "staff", "admin");
    res.json({ ok: true });
  });
  app.post("/api/admin/logout", (req, res) => {
    const cookie = req.headers.cookie
      ?.split(";")
      .map((s) => s.trim())
      .find((s) => s.startsWith("rassvet_admin="))
      ?.split("=")[1];
    if (cookie)
      db.prepare("DELETE FROM sessions WHERE token=?").run(
        createHash("sha256").update(cookie).digest("hex"),
      );
    res.clearCookie("rassvet_admin");
    res.json({ ok: true });
  });
  app.get("/api/admin", (req, res) => {
    admin(req);
    res.json({
      orders: (
        db.prepare("SELECT data FROM orders ORDER BY number DESC").all() as {
          data: string;
        }[]
      ).map((r) => JSON.parse(r.data)),
      products: products(),
      settings: getConfig("settings"),
      promos: getConfig("promos"),
      stories: getConfig("stories"),
      demo,
    });
  });
  app.patch("/api/admin/products/:id", (req, res) => {
    admin(req);
    const patch = z
      .object({
        available: z.boolean().optional(),
        price: z.number().int().min(1000).max(10000000).optional(),
        name: localized.optional(),
      })
      .parse(req.body);
    const p = products().find((p) => p.id === req.params.id);
    if (!p) throw new ApiError("NOT_FOUND", 404);
    Object.assign(p, patch);
    db.prepare("UPDATE products SET data=? WHERE id=?").run(
      JSON.stringify(p),
      p.id,
    );
    res.json(p);
  });
  app.patch("/api/admin/settings", (req, res) => {
    admin(req);
    const settings = z
      .object({
        minimum: z.number().int().min(0).max(10000000),
        deliveryFee: z.number().int().min(0).max(1000000),
        radius: z.number().min(0.1).max(50),
        openHour: z.number().int().min(0).max(23),
        closeHour: z.number().int().min(1).max(24),
        bypassHours: z.boolean(),
      })
      .refine((s) => s.closeHour > s.openHour)
      .parse(req.body);
    if (!demo) settings.bypassHours = false;
    setConfig("settings", settings);
    res.json(settings);
  });
  app.put("/api/admin/promos", (req, res) => {
    admin(req);
    const promos = z
      .array(
        z.object({
          code: z.string().regex(/^[A-Z0-9]{3,30}$/),
          percent: z.number().int().min(1).max(90),
          active: z.boolean(),
        }),
      )
      .max(50)
      .parse(req.body);
    if (new Set(promos.map((p) => p.code)).size !== promos.length)
      throw new ApiError("VALIDATION");
    setConfig("promos", promos);
    res.json(promos);
  });
  app.put("/api/admin/stories", (req, res) => {
    admin(req);
    const stories = z
      .array(
        z.object({
          id: z.string().max(50),
          title: localized,
          text: localized,
          type: z.enum(["offer", "event"]),
          active: z.boolean(),
        }),
      )
      .max(20)
      .parse(req.body);
    setConfig("stories", stories);
    res.json(stories);
  });
  app.patch("/api/admin/orders/:id", (req, res) => {
    admin(req);
    const { status, courierNote } = z
      .object({
        status: z
          .enum([
            "accepted",
            "preparing",
            "ready",
            "delivering",
            "completed",
            "cancelled",
          ])
          .optional(),
        courierNote: z.string().max(500).optional(),
      })
      .parse(req.body);
    const row = db
      .prepare("SELECT data FROM orders WHERE id=?")
      .get(String(req.params.id)) as { data: string } | undefined;
    if (!row) throw new ApiError("NOT_FOUND", 404);
    const order: Order = JSON.parse(row.data);
    if (status && status !== order.status) {
      const transitions: Record<Status, Status[]> = {
        awaiting_payment: ["cancelled"],
        accepted: ["preparing", "cancelled"],
        preparing: ["ready"],
        ready: [order.fulfillment === "delivery" ? "delivering" : "completed"],
        delivering: ["completed"],
        completed: [],
        cancelled: [],
      };
      if (!transitions[order.status].includes(status))
        throw new ApiError("INVALID_TRANSITION", 409);
      if (order.payment === "paid" && status === "cancelled") {
        if (!order.demo) throw new ApiError("REFUND_REQUIRED");
        order.payment = "refunded";
      }
      order.status = status;
      order.history.push({ status, at: new Date().toISOString() });
    }
    if (courierNote !== undefined) order.courierNote = courierNote;
    saveOrder(order);
    enqueueNotification(order);
    res.json(order);
  });
  app.use("/api", (_req, res) => res.status(404).json({ error: "NOT_FOUND" }));
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof z.ZodError)
      return res.status(400).json({ error: "VALIDATION" });
    if (err instanceof ApiError)
      return res.status(err.status).json({ error: err.code });
    if (err instanceof SyntaxError)
      return res.status(400).json({ error: "VALIDATION" });
    console.error(err instanceof Error ? err.message : "Server error");
    res.status(500).json({ error: "SERVER_ERROR" });
  });
  return { app, saveUser, getUser };
}
