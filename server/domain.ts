import { createHmac, timingSafeEqual } from "node:crypto";
import type { Settings } from "../src/types";
export const CAFE = {
  lat: 41.305414,
  lon: 69.2729,
  address: "Ташкент, ул. Чимкент, 17",
  phone: "+998509005011",
};
export function distanceKm(lat: number, lon: number) {
  const rad = Math.PI / 180;
  const a =
    Math.sin(((lat - CAFE.lat) * rad) / 2) ** 2 +
    Math.cos(CAFE.lat * rad) *
      Math.cos(lat * rad) *
      Math.sin(((lon - CAFE.lon) * rad) / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
export function isOpen(settings: Settings, now = new Date(), demo = false) {
  if (demo && settings.bypassHours) return true;
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Tashkent",
      hour: "2-digit",
      hourCycle: "h23",
    }).format(now),
  );
  return hour >= settings.openHour && hour < settings.closeHour;
}
export function validateTelegram(
  data: string,
  token: string,
  now = Date.now(),
) {
  const params = new URLSearchParams(data);
  if (new Set(params.keys()).size !== [...params.keys()].length)
    throw new Error("AUTH_INVALID");
  const hash = params.get("hash");
  if (!hash || !/^[a-f0-9]{64}$/.test(hash)) throw new Error("AUTH_INVALID");
  params.delete("hash");
  const check = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");
  const key = createHmac("sha256", "WebAppData").update(token).digest();
  const expected = createHmac("sha256", key).update(check).digest();
  if (!timingSafeEqual(expected, Buffer.from(hash, "hex")))
    throw new Error("AUTH_INVALID");
  const age = now / 1000 - Number(params.get("auth_date"));
  if (!Number.isFinite(age) || age < -30 || age > 3600)
    throw new Error("AUTH_EXPIRED");
  const user = JSON.parse(params.get("user") || "{}");
  if (!Number.isSafeInteger(user.id) || user.id <= 0)
    throw new Error("AUTH_INVALID");
  return user as { id: number; first_name?: string; last_name?: string };
}
