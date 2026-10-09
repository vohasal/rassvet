import "dotenv/config";
import express from "express";
import { resolve } from "node:path";
import { existsSync } from "node:fs";
import { openDatabase } from "./db";
import { createApp } from "./app";
import { startBot } from "./telegram";
const demo = process.env.DEMO_MODE !== "false";
const production = process.env.NODE_ENV === "production";
const appUrl = process.env.MINI_APP_URL || process.env.RENDER_EXTERNAL_URL;
const host = process.env.HOST || (production ? "0.0.0.0" : "127.0.0.1");
if (
  production &&
  (!process.env.ADMIN_PASSWORD || process.env.ADMIN_PASSWORD === "rassvet-demo")
)
  throw new Error("Set a unique ADMIN_PASSWORD before publishing the app.");
if (production && !existsSync(resolve("dist/index.html")))
  throw new Error("Frontend build missing. Run npm run build before npm start.");
if (
  !demo &&
  (!process.env.ADMIN_PASSWORD ||
    process.env.ADMIN_PASSWORD === "rassvet-demo" ||
    !process.env.TELEGRAM_BOT_TOKEN)
)
  throw new Error(
    "Set TELEGRAM_BOT_TOKEN and a new ADMIN_PASSWORD before disabling DEMO_MODE.",
  );
const db = openDatabase(process.env.DATABASE_PATH || "./data/rassvet.sqlite");
const { app, getUser, saveUser } = createApp({
  db,
  demo,
  adminPassword: process.env.ADMIN_PASSWORD || "rassvet-demo",
  botToken: process.env.TELEGRAM_BOT_TOKEN,
  mapsKey: process.env.YANDEX_MAPS_API_KEY,
  appUrl,
  staffChatId: process.env.STAFF_CHAT_ID,
});
if (existsSync(resolve("dist/index.html"))) {
  app.use(express.static(resolve("dist")));
  app.get("/{*path}", (_req, res) => res.sendFile(resolve("dist/index.html")));
}
const server = app.listen(
  Number(process.env.PORT || 3001),
  host,
  () =>
    console.log(
      `Rassvet API: http://${host}:${process.env.PORT || 3001} (${demo ? "DEMO" : "LIVE CASH ONLY"})`,
    ),
);
const stopBot = process.env.TELEGRAM_BOT_TOKEN
  ? startBot({
      token: process.env.TELEGRAM_BOT_TOKEN,
      appUrl,
      db,
      getUser,
      saveUser,
    })
  : () => {};
for (const signal of ["SIGINT", "SIGTERM"])
  process.once(signal, () => {
    stopBot();
    server.close(() => {
      db.close();
      process.exit(0);
    });
  });
