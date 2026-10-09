import "dotenv/config";
import express from "express";
import { resolve } from "node:path";
import { existsSync } from "node:fs";
import { openDatabase } from "./db";
import { createApp } from "./app";
import { startBot } from "./telegram";
const demo = process.env.DEMO_MODE !== "false";
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
  appUrl: process.env.MINI_APP_URL,
  staffChatId: process.env.STAFF_CHAT_ID,
});
if (existsSync(resolve("dist/index.html"))) {
  app.use(express.static(resolve("dist")));
  app.get("/{*path}", (_req, res) => res.sendFile(resolve("dist/index.html")));
}
const server = app.listen(
  Number(process.env.PORT || 3001),
  process.env.HOST || "127.0.0.1",
  () =>
    console.log(
      `Rassvet API: http://${process.env.HOST || "127.0.0.1"}:${process.env.PORT || 3001} (${demo ? "DEMO" : "LIVE CASH ONLY"})`,
    ),
);
const stopBot = process.env.TELEGRAM_BOT_TOKEN
  ? startBot({
      token: process.env.TELEGRAM_BOT_TOKEN,
      appUrl: process.env.MINI_APP_URL,
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
