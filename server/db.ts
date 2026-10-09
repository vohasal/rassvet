import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import menu from "./menu.json";
import type { Settings, Story } from "../src/types";
export function openDatabase(path: string) {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
    CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, user_id TEXT NOT NULL, role TEXT NOT NULL, expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS products (id TEXT PRIMARY KEY, data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS config (id TEXT PRIMARY KEY, data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS orders (number INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT UNIQUE NOT NULL, user_id TEXT NOT NULL, request_key TEXT NOT NULL, request_hash TEXT NOT NULL, data TEXT NOT NULL, UNIQUE(user_id, request_key));
    CREATE INDEX IF NOT EXISTS orders_user ON orders(user_id);
    CREATE TABLE IF NOT EXISTS meta (id TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS notifications (id TEXT PRIMARY KEY, chat_id TEXT NOT NULL, text TEXT NOT NULL, sent INTEGER NOT NULL DEFAULT 0, attempts INTEGER NOT NULL DEFAULT 0, next_attempt INTEGER NOT NULL DEFAULT 0);`);
  const insert = db.prepare(
    "INSERT OR IGNORE INTO products (id, data) VALUES (?, ?)",
  );
  for (const { source: _source, ...p } of menu)
    insert.run(p.id, JSON.stringify(p));
  const settings: Settings = {
    minimum: 50000,
    deliveryFee: 15000,
    radius: 5,
    openHour: 12,
    closeHour: 20,
    bypassHours: true,
  };
  const stories: Story[] = [
    {
      id: "morning",
      type: "offer",
      active: true,
      title: {
        ru: "Ваш первый Рассвет",
        en: "Your first Rassvet",
        uz: "Birinchi Rassvetingiz",
      },
      text: {
        ru: "−10% по коду RASSVET10. Тестовая акция для знакомства с приложением.",
        en: "10% off with RASSVET10. A demo offer to explore the app.",
        uz: "RASSVET10 kodi bilan −10%. Ilova uchun namoyish aksiyasi.",
      },
    },
    {
      id: "weekend",
      type: "event",
      active: true,
      title: {
        ru: "Встречаемся за кофе",
        en: "Let’s meet over coffee",
        uz: "Qahva ustida uchrashamiz",
      },
      text: {
        ru: "Здесь будут анонсы встреч и событий кофейни. Демонстрационный анонс, дата пока не назначена.",
        en: "Café gatherings and events will appear here. Demo announcement; no date scheduled.",
        uz: "Qahvaxona uchrashuvlari va tadbirlari shu yerda. Namoyish e’loni, sana hali belgilanmagan.",
      },
    },
  ];
  for (const [id, data] of Object.entries({
    settings,
    stories,
    promos: [{ code: "RASSVET10", percent: 10, active: true }],
  }))
    db.prepare("INSERT OR IGNORE INTO config VALUES (?, ?)").run(
      id,
      JSON.stringify(data),
    );
  return db;
}
