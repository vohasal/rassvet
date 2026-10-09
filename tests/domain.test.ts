import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { distanceKm, isOpen, validateTelegram } from "../server/domain";
import { verifiedContactPhone } from "../server/telegram";
const settings = {
  minimum: 50000,
  deliveryFee: 15000,
  radius: 5,
  openHour: 12,
  closeHour: 20,
  bypassHours: false,
};
test("Tashkent ordering window opens at 12:00 and closes at 20:00", () => {
  assert.equal(isOpen(settings, new Date("2026-10-09T06:59:59Z")), false);
  assert.equal(isOpen(settings, new Date("2026-10-09T07:00:00Z")), true);
  assert.equal(isOpen(settings, new Date("2026-10-09T14:59:59Z")), true);
  assert.equal(isOpen(settings, new Date("2026-10-09T15:00:00Z")), false);
  assert.equal(
    isOpen(
      { ...settings, bypassHours: true },
      new Date("2026-10-09T22:00:00Z"),
      false,
    ),
    false,
  );
  assert.equal(
    isOpen(
      { ...settings, bypassHours: true },
      new Date("2026-10-09T22:00:00Z"),
      true,
    ),
    true,
  );
});
test("5 km boundary and distant address checks", () => {
  assert.ok(distanceKm(41.305414, 69.2729) < 0.001);
  assert.ok(distanceKm(41.3061, 69.2729) < 1);
  assert.ok(distanceKm(41.36, 69.2729) > 5);
  assert.ok(distanceKm(41.35, 69.2729) < 5);
});
test("only the sender’s own Telegram contact can verify a phone", () => {
  assert.equal(
    verifiedContactPhone({ user_id: 123, phone_number: "998901234567" }, 123),
    "+998901234567",
  );
  assert.equal(
    verifiedContactPhone({ user_id: 999, phone_number: "998901234567" }, 123),
    null,
  );
  assert.equal(
    verifiedContactPhone({ phone_number: "998901234567" }, 123),
    null,
  );
  assert.equal(
    verifiedContactPhone({ user_id: 123, phone_number: "+12025550100" }, 123),
    null,
  );
});
test("Telegram signature, expiration, tampering and duplicate fields", () => {
  const now = Date.now(),
    token = "test-bot-token";
  const params = new URLSearchParams({
    auth_date: String(Math.floor(now / 1000)),
    query_id: "test",
    user: JSON.stringify({ id: 123, first_name: "Guest" }),
  });
  const check = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");
  const secret = createHmac("sha256", "WebAppData").update(token).digest();
  params.set("hash", createHmac("sha256", secret).update(check).digest("hex"));
  assert.equal(validateTelegram(params.toString(), token, now).id, 123);
  assert.throws(() =>
    validateTelegram(params.toString(), token, now + 3601000),
  );
  assert.throws(() => validateTelegram(params.toString(), token, now - 60000));
  assert.throws(() =>
    validateTelegram(params.toString() + "&user={}", token, now),
  );
  params.set("user", JSON.stringify({ id: 999 }));
  assert.throws(() => validateTelegram(params.toString(), token, now));
});
