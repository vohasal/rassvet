import type { DatabaseSync } from "node:sqlite";
import type { User } from "../src/types";
export function verifiedContactPhone(
  contact: { user_id?: number; phone_number: string },
  sender: number,
) {
  if (contact.user_id !== sender) return null;
  const number = "+" + contact.phone_number.replace(/\D/g, "");
  return /^\+998\d{9}$/.test(number) ? number : null;
}
// Long polling works locally. The Mini App itself still needs HTTPS when opened in Telegram.
export function startBot({
  token,
  appUrl,
  db,
  getUser,
  saveUser,
}: {
  token: string;
  appUrl?: string;
  db: DatabaseSync;
  getUser: (id: string) => User | null;
  saveUser: (user: User) => unknown;
}) {
  let stopped = false;
  const abort = new AbortController();
  const call = async (method: string, body: unknown) => {
    const response = await fetch(
      `https://api.telegram.org/bot${token}/${method}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.any([abort.signal, AbortSignal.timeout(35000)]),
      },
    );
    const result = await response.json();
    if (!result.ok) throw new Error("Telegram request failed");
    return result.result;
  };
  void (async () => {
    let offset = Number(
      (
        db
          .prepare("SELECT value FROM meta WHERE id='telegram_offset'")
          .get() as { value: string } | undefined
      )?.value || 0,
    );
    while (!stopped) {
      try {
        const pending = db
          .prepare(
            "SELECT id, chat_id, text, attempts FROM notifications WHERE sent=0 AND next_attempt<=? LIMIT 10",
          )
          .all(Date.now()) as {
          id: string;
          chat_id: string;
          text: string;
          attempts: number;
        }[];
        for (const note of pending) {
          try {
            await call("sendMessage", {
              chat_id: note.chat_id,
              text: note.text,
            });
            db.prepare("UPDATE notifications SET sent=1 WHERE id=?").run(
              note.id,
            );
          } catch {
            db.prepare(
              "UPDATE notifications SET attempts=attempts+1,next_attempt=? WHERE id=?",
            ).run(
              Date.now() +
                Math.min(3600000, 30000 * 2 ** Math.min(note.attempts, 7)),
              note.id,
            );
          }
        }
        const updates = await call("getUpdates", {
          offset,
          timeout: 25,
          allowed_updates: ["message"],
        });
        for (const update of updates) {
          const message = update.message;
          if (message?.chat.type === "private" && message.from) {
            if (
              message.contact &&
              message.contact.user_id === message.from.id
            ) {
              const user = getUser(`tg:${message.from.id}`) || {
                id: `tg:${message.from.id}`,
                telegramId: message.from.id,
                name: message.from.first_name || "Гость",
                phone: "",
                avatar: "",
                language: "ru",
                theme: "system",
                addresses: [],
                selectedAddress: "",
              };
              const number = verifiedContactPhone(
                message.contact,
                message.from.id,
              );
              if (number) {
                user.phone = number;
                saveUser(user);
                await call("sendMessage", {
                  chat_id: message.chat.id,
                  text: "Номер подтверждён. Добро пожаловать в Рассвет! / Xush kelibsiz! / Welcome!",
                  reply_markup: appUrl
                    ? {
                        inline_keyboard: [
                          [
                            {
                              text: "Открыть Рассвет · Open",
                              web_app: { url: appUrl },
                            },
                          ],
                        ],
                      }
                    : { remove_keyboard: true },
                });
              } else
                await call("sendMessage", {
                  chat_id: message.chat.id,
                  text: "Для заказа нужен номер Узбекистана (+998). / An Uzbekistan phone number (+998) is required.",
                });
            } else if (message.text?.startsWith("/start")) {
              await call("sendMessage", {
                chat_id: message.chat.id,
                text: "Кофе, завтраки и немного счастья. Поделитесь своим номером, чтобы оформить заказ. / Share your phone number to order.",
                reply_markup: {
                  keyboard: [
                    [
                      {
                        text: "Поделиться номером / Share phone",
                        request_contact: true,
                      },
                    ],
                  ],
                  resize_keyboard: true,
                  one_time_keyboard: true,
                },
              });
              if (appUrl)
                await call("sendMessage", {
                  chat_id: message.chat.id,
                  text: "Наше меню / Our menu",
                  reply_markup: {
                    inline_keyboard: [
                      [{ text: "Рассвет", web_app: { url: appUrl } }],
                    ],
                  },
                });
            }
          }
          offset = update.update_id + 1;
          db.prepare(
            "INSERT INTO meta VALUES ('telegram_offset',?) ON CONFLICT(id) DO UPDATE SET value=excluded.value",
          ).run(String(offset));
        }
      } catch {
        if (!stopped) {
          console.error("Telegram connection unavailable; retrying in 5s.");
          await new Promise((r) => setTimeout(r, 5000));
        }
      }
    }
  })();
  return () => {
    stopped = true;
    abort.abort();
  };
}
