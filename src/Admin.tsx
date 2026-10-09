import { useEffect, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  LockKeyhole,
  LogOut,
  ReceiptText,
  Coffee,
  Settings2,
  Sparkles,
  Check,
  Search,
  Pencil,
  MapPin,
  Phone,
  Plus,
  X,
} from "lucide-react";
import type {
  Order,
  Product,
  Promo,
  Settings,
  Status,
  Story,
  Lang,
} from "./types";
import { useStore, api, Field, Modal, Empty } from "./lib";
import { money, type TextKey } from "./i18n";
import { PaymentStatus } from "./Orders";
import { PageTitle } from "./Orders";
type AdminData = {
  orders: Order[];
  products: Product[];
  settings: Settings;
  promos: Promo[];
  stories: Story[];
  demo: boolean;
};
export default function Admin() {
  const { t, lang, config, run, busy, notify, reload } = useStore();
  const [data, setData] = useState<AdminData | null>(null),
    [password, setPassword] = useState(""),
    [tab, setTab] = useState("orders"),
    [filter, setFilter] = useState("active"),
    [selected, setSelected] = useState(""),
    [editProduct, setEditProduct] = useState<Product | null>(null),
    [editStory, setEditStory] = useState<Story | null>(null),
    [search, setSearch] = useState(""),
    [cancelId, setCancelId] = useState(""),
    [connectionError, setConnectionError] = useState(false);
  const refresh = async () => {
    setData(await api<AdminData>("/admin"));
    setConnectionError(false);
  };
  useEffect(() => {
    void refresh().catch(() => {});
  }, []);
  useEffect(() => {
    if (!data) return;
    const timer = setInterval(() => {
      if (document.visibilityState === "visible")
        void refresh().catch(() => setConnectionError(true));
    }, 5000);
    return () => clearInterval(timer);
  }, [!!data]);
  const mutate = async (path: string, method: string, body: unknown) => {
    try {
      await api(path, method, body);
      await refresh();
      await reload();
      notify(t("saved"));
    } catch (error) {
      await refresh().catch(() => {});
      throw error;
    }
  };
  const order = data?.orders.find((o) => o.id === selected);
  const active = (o: Order) => !["completed", "cancelled"].includes(o.status);
  return (
    <div className="admin-shell">
      <header className="admin-header">
        <a href="/" className="brand">
          <img src="/bird.svg" alt="" />
          <span>
            рассвет<small>{t("adminTitle")}</small>
          </span>
        </a>
        <div className="header-actions">
          <a href="/" className="text-button">
            <ArrowLeft size={16} />
            {t("staffBack")}
          </a>
          {data && (
            <button
              className="icon-button"
              aria-label={t("logout")}
              onClick={() =>
                void run(async () => {
                  await api("/admin/logout", "POST", {});
                  setData(null);
                  setPassword("");
                })
              }
            >
              <LogOut size={19} />
            </button>
          )}
        </div>
      </header>
      {!data ? (
        <div className="admin-login panel">
          <div className="login-icon">
            <LockKeyhole size={30} />
          </div>
          <h1>{t("adminLogin")}</h1>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                await api("/admin/login", "POST", { password });
                await refresh();
              });
            }}
          >
            <Field label={t("password")}>
              <input
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </Field>
            <button className="primary full" disabled={busy}>
              {t("signIn")}
              <ArrowRight size={17} />
            </button>
          </form>
          {config.demo && <p className="small muted">{t("adminDemoHint")}</p>}
        </div>
      ) : (
        <div className="admin-body">
          <PageTitle title={t("adminTitle")} subtitle={t("adminSub")} />
          {connectionError && (
            <div className="notice warning" role="alert">
              {t("offline")}
            </div>
          )}
          <div className="admin-stats">
            <div>
              <span>{t("activeOrders")}</span>
              <strong>
                {data.orders.filter(active).length.toString().padStart(2, "0")}
              </strong>
              <ReceiptText size={26} />
            </div>
            <div>
              <span>{t("totalOrders")}</span>
              <strong>{data.orders.length.toString().padStart(2, "0")}</strong>
              <Coffee size={26} />
            </div>
            <div>
              <span>
                {t("revenue")}
                {data.demo && " · " + t("demo")}
              </span>
              <strong>
                {money(
                  data.orders
                    .filter((o) => o.payment === "paid")
                    .reduce((s, o) => s + o.total, 0),
                  lang,
                )}
              </strong>
              <Sparkles size={26} />
            </div>
          </div>
          <nav className="admin-tabs">
            {(
              [
                { id: "orders", key: "adminOrders", icon: ReceiptText },
                { id: "menu", key: "adminMenu", icon: Coffee },
                { id: "content", key: "content", icon: Sparkles },
                { id: "settings", key: "settings", icon: Settings2 },
              ] as const
            ).map(({ id, key, icon: Icon }) => (
              <button
                key={id}
                className={tab === id ? "selected" : ""}
                onClick={() => setTab(id)}
              >
                <Icon size={18} />
                {t(key)}
              </button>
            ))}
          </nav>
          {tab === "orders" && (
            <>
              <div className="admin-toolbar">
                <h2>{t("adminOrders")}</h2>
                <div className="segmented">
                  {[
                    { id: "active", key: "liveOrders" },
                    { id: "all", key: "allOrders" },
                    { id: "done", key: "finishedOrders" },
                  ].map((f) => (
                    <button
                      key={f.id}
                      className={filter === f.id ? "selected" : ""}
                      onClick={() => setFilter(f.id)}
                    >
                      {t(f.key as TextKey)}
                    </button>
                  ))}
                </div>
              </div>
              {data.orders.filter(
                (o) =>
                  filter === "all" ||
                  (filter === "active" ? active(o) : !active(o)),
              ).length ? (
                <div className="admin-order-grid">
                  {data.orders
                    .filter(
                      (o) =>
                        filter === "all" ||
                        (filter === "active" ? active(o) : !active(o)),
                    )
                    .map((o) => (
                      <button
                        className="panel staff-order"
                        key={o.id}
                        onClick={() => setSelected(o.id)}
                      >
                        <div className="order-card-head">
                          <strong>#{String(o.number).padStart(4, "0")}</strong>
                          <span className={"status-pill " + o.status}>
                            {t(o.status)}
                          </span>
                        </div>
                        <h3>{o.name}</h3>
                        <p>
                          <MapPin size={14} />
                          {o.fulfillment === "delivery"
                            ? o.address?.street
                            : t("pickupAt")}
                        </p>
                        <div className="staff-order-bottom">
                          <span>{money(o.total, lang)}</span>
                          <span>
                            {new Date(o.createdAt).toLocaleTimeString(lang, {
                              timeZone: "Asia/Tashkent",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                        </div>
                        <PaymentStatus order={o} />
                      </button>
                    ))}
                </div>
              ) : (
                <Empty title={t("adminEmpty")} />
              )}
            </>
          )}
          {tab === "menu" && (
            <>
              <div className="admin-toolbar">
                <h2>{t("adminMenu")}</h2>
                <label className="search">
                  <Search size={18} />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder={t("search")}
                    aria-label={t("search")}
                  />
                </label>
              </div>
              <div className="panel admin-product-list">
                {data.products
                  .filter((p) =>
                    p.name[lang].toLowerCase().includes(search.toLowerCase()),
                  )
                  .map((p) => (
                    <div className="admin-product" key={p.id}>
                      <img src={p.image} alt="" />
                      <span>
                        <b>{p.name[lang]}</b>
                        <small>{money(p.price, lang)}</small>
                      </span>
                      <label className="switch-label">
                        <input
                          type="checkbox"
                          role="switch"
                          checked={p.available}
                          aria-label={t("available") + " " + p.name[lang]}
                          disabled={busy}
                          onChange={(e) => {
                            const available = e.currentTarget.checked;
                            setData({
                              ...data,
                              products: data.products.map((x) =>
                                x.id === p.id ? { ...x, available } : x,
                              ),
                            });
                            void run(() =>
                              mutate("/admin/products/" + p.id, "PATCH", {
                                available,
                              }),
                            );
                          }}
                        />
                        <span>{t(p.available ? "available" : "soldOut")}</span>
                      </label>
                      <button
                        className="icon-button"
                        aria-label={t("editing") + " " + p.name[lang]}
                        onClick={() => setEditProduct(structuredClone(p))}
                      >
                        <Pencil size={17} />
                      </button>
                    </div>
                  ))}
              </div>
            </>
          )}
          {tab === "settings" && (
            <SettingsForm
              key={JSON.stringify(data.settings)}
              settings={data.settings}
              demo={data.demo}
              save={(s) => mutate("/admin/settings", "PATCH", s)}
            />
          )}
          {tab === "content" && (
            <div className="content-grid">
              <section className="panel">
                <h2>{t("myPromos")}</h2>
                <PromoForm
                  key={JSON.stringify(data.promos)}
                  promos={data.promos}
                  save={(p) => mutate("/admin/promos", "PUT", p)}
                />
              </section>
              <section className="panel">
                <h2>{t("happenings")}</h2>
                {data.stories.map((s) => (
                  <div className="admin-story" key={s.id}>
                    <span>
                      <small>{t(s.type)}</small>
                      <b>{s.title[lang]}</b>
                    </span>
                    <label className="switch-label">
                      <input
                        type="checkbox"
                        role="switch"
                        aria-label={t("enabled") + " " + s.title[lang]}
                        checked={s.active}
                        onChange={(e) =>
                          void run(() =>
                            mutate(
                              "/admin/stories",
                              "PUT",
                              data.stories.map((x) =>
                                x.id === s.id
                                  ? { ...x, active: e.target.checked }
                                  : x,
                              ),
                            ),
                          )
                        }
                      />
                    </label>
                    <button
                      className="icon-button"
                      aria-label={t("editing") + " " + s.title[lang]}
                      onClick={() => setEditStory(structuredClone(s))}
                    >
                      <Pencil size={17} />
                    </button>
                  </div>
                ))}
              </section>
            </div>
          )}
        </div>
      )}
      <Modal
        open={!!order}
        onClose={() => setSelected("")}
        title={t("order") + " #" + String(order?.number || 0).padStart(4, "0")}
        wide
      >
        {order && (
          <div className="staff-order-detail">
            <div className="order-card-head">
              <span className={"status-pill " + order.status}>
                {t(order.status)}
              </span>
              <PaymentStatus order={order} />
            </div>
            <div className="staff-customer">
              <strong>{order.name}</strong>
              <a href={"tel:" + order.phone}>
                <Phone size={15} />
                {order.phone}
              </a>
              <span>
                {t(order.fulfillment)} ·{" "}
                {order.address?.street || config.cafe.address}
              </span>
              {order.address && (
                <p>
                  {[
                    order.address.apartment &&
                      `${t("apartment")}: ${order.address.apartment}`,
                    order.address.entrance &&
                      `${t("entrance")}: ${order.address.entrance}`,
                    order.address.floor &&
                      `${t("floor")}: ${order.address.floor}`,
                    order.address.comment,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              )}
              {order.address && (
                <a
                  href={`https://yandex.uz/maps/?pt=${order.address.lon},${order.address.lat}&z=17&l=map`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {t("openYandex")}
                </a>
              )}
              {order.comment && <div className="notice">{order.comment}</div>}
            </div>
            <div className="mini-items">
              {order.items.map((i, n) => (
                <div key={n}>
                  <span>
                    {i.quantity} × {i.name[lang]}
                    {i.milk !== "regular" && " · " + t(i.milk as TextKey)}
                  </span>
                  <b>{money(i.quantity * i.unitPrice, lang)}</b>
                </div>
              ))}
            </div>
            <div className="summary-line">
              <span>
                {t("discount")} {order.promo}
              </span>
              −{money(order.discount, lang)}
            </div>
            <div className="summary-line">
              <span>{t("delivery")}</span>
              {money(order.deliveryFee, lang)}
            </div>
            <div className="summary-total">
              <span>{t("total")}</span>
              <strong>{money(order.total, lang)}</strong>
            </div>
            {order.fulfillment === "delivery" && (
              <>
                <p className="notice">{t("courierHint")}</p>
                <form
                  key={order.id + order.courierNote}
                  onSubmit={(e) => {
                    e.preventDefault();
                    const note = new FormData(e.currentTarget).get("note");
                    void run(() =>
                      mutate("/admin/orders/" + order.id, "PATCH", {
                        courierNote: note,
                      }),
                    );
                  }}
                >
                  <Field label={t("courierNote")}>
                    <textarea
                      name="note"
                      defaultValue={order.courierNote}
                      maxLength={500}
                    />
                  </Field>
                  <button className="secondary" disabled={busy}>
                    {t("save")}
                  </button>
                </form>
              </>
            )}
            <div className="modal-actions">
              {["awaiting_payment", "accepted"].includes(order.status) && (
                <button
                  className="text-button danger"
                  onClick={() => setCancelId(order.id)}
                >
                  {t("cancelOrder")}
                </button>
              )}
              {nextStatus(order) && (
                <button
                  disabled={busy}
                  className="primary"
                  onClick={() =>
                    void run(() =>
                      mutate("/admin/orders/" + order.id, "PATCH", {
                        status: nextStatus(order),
                      }),
                    )
                  }
                >
                  {t(nextStatus(order)!)}
                  <ArrowRight size={17} />
                </button>
              )}
            </div>
            <div className="order-history">
              {order.history.map((h, i) => (
                <div key={i}>
                  <span>{t(h.status)}</span>
                  <small>
                    {new Date(h.at).toLocaleString(lang, {
                      timeZone: "Asia/Tashkent",
                    })}
                  </small>
                </div>
              ))}
            </div>
          </div>
        )}
      </Modal>
      <Modal
        open={!!cancelId}
        onClose={() => setCancelId("")}
        title={t("cancelOrder")}
      >
        <div className="dialog-padding">
          <p>{t("cancelOrderConfirm")}</p>
          <div className="modal-actions">
            <button className="secondary" onClick={() => setCancelId("")}>
              {t("cancel")}
            </button>
            <button
              className="primary"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await mutate("/admin/orders/" + cancelId, "PATCH", {
                    status: "cancelled",
                  });
                  setCancelId("");
                })
              }
            >
              {t("confirm")}
            </button>
          </div>
        </div>
      </Modal>
      <Modal
        open={!!editProduct}
        onClose={() => setEditProduct(null)}
        title={t("editing")}
      >
        {editProduct && (
          <form
            className="dialog-padding"
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                await mutate("/admin/products/" + editProduct.id, "PATCH", {
                  name: editProduct.name,
                  price: editProduct.price,
                });
                setEditProduct(null);
              });
            }}
          >
            <div className="fields">
              {(["ru", "en", "uz"] as Lang[]).map((l) => (
                <Field label={t("title") + " · " + l.toUpperCase()} key={l}>
                  <input
                    required
                    value={editProduct.name[l]}
                    onChange={(e) =>
                      setEditProduct({
                        ...editProduct,
                        name: { ...editProduct.name, [l]: e.target.value },
                      })
                    }
                  />
                </Field>
              ))}
              <Field label={t("price")}>
                <input
                  required
                  min="1000"
                  max="10000000"
                  step="1000"
                  type="number"
                  value={editProduct.price}
                  onChange={(e) =>
                    setEditProduct({
                      ...editProduct,
                      price: Number(e.target.value),
                    })
                  }
                />
              </Field>
            </div>
            <button className="primary full" disabled={busy}>
              {t("save")}
            </button>
          </form>
        )}
      </Modal>
      <Modal
        open={!!editStory}
        onClose={() => setEditStory(null)}
        title={t("editing")}
        wide
      >
        {editStory && data && (
          <form
            className="dialog-padding"
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                await mutate(
                  "/admin/stories",
                  "PUT",
                  data.stories.map((s) =>
                    s.id === editStory.id ? editStory : s,
                  ),
                );
                setEditStory(null);
              });
            }}
          >
            <div className="fields">
              {(["ru", "en", "uz"] as Lang[]).map((l) => (
                <div className="fields" key={l}>
                  <Field label={t("title") + " · " + l.toUpperCase()}>
                    <input
                      maxLength={500}
                      required
                      value={editStory.title[l]}
                      onChange={(e) =>
                        setEditStory({
                          ...editStory,
                          title: { ...editStory.title, [l]: e.target.value },
                        })
                      }
                    />
                  </Field>
                  <Field label={t("text") + " · " + l.toUpperCase()}>
                    <textarea
                      maxLength={500}
                      required
                      value={editStory.text[l]}
                      onChange={(e) =>
                        setEditStory({
                          ...editStory,
                          text: { ...editStory.text, [l]: e.target.value },
                        })
                      }
                    />
                  </Field>
                </div>
              ))}
            </div>
            <button className="primary full" disabled={busy}>
              {t("save")}
            </button>
          </form>
        )}
      </Modal>
    </div>
  );
}
function nextStatus(order: Order): Status | null {
  const next: Partial<Record<Status, Status>> = {
    accepted: "preparing",
    preparing: "ready",
    ready: order.fulfillment === "pickup" ? "completed" : "delivering",
    delivering: "completed",
  };
  return next[order.status] || null;
}
function SettingsForm({
  settings,
  demo,
  save,
}: {
  settings: Settings;
  demo: boolean;
  save: (s: Settings) => Promise<void>;
}) {
  const { t, run, busy } = useStore();
  const [s, setS] = useState(settings);
  const fields = [
    ["minimum", "minimumSetting", 0, 10000000],
    ["deliveryFee", "feeSetting", 0, 1000000],
    ["radius", "radiusSetting", 0.1, 50],
    ["openHour", "opens", 0, 23],
    ["closeHour", "closes", 1, 24],
  ] as const;
  return (
    <form
      className="panel settings-form"
      onSubmit={(e) => {
        e.preventDefault();
        void run(() => save(s));
      }}
    >
      <h2>{t("settings")}</h2>
      <div className="fields two">
        {fields.map(([key, label, min, max]) => (
          <Field key={key} label={t(label)}>
            <input
              type="number"
              required
              min={min}
              max={max}
              step={key === "radius" ? 0.1 : 1}
              value={s[key]}
              onChange={(e) => setS({ ...s, [key]: Number(e.target.value) })}
            />
          </Field>
        ))}
      </div>
      {demo && (
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={s.bypassHours}
            onChange={(e) => setS({ ...s, bypassHours: e.target.checked })}
          />
          {t("bypass")}
        </label>
      )}
      <p className="notice">{t("settingsHint")}</p>
      <button className="primary" disabled={busy}>
        {t("save")}
        <Check size={17} />
      </button>
    </form>
  );
}
function PromoForm({
  promos,
  save,
}: {
  promos: Promo[];
  save: (p: Promo[]) => Promise<void>;
}) {
  const { t, run, busy } = useStore();
  const [p, setP] = useState(promos);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void run(() => save(p));
      }}
    >
      {p.map((promo, i) => (
        <div className="promo-edit" key={i}>
          <Field label={t("code")}>
            <input
              required
              pattern="[A-Z0-9]{3,30}"
              value={promo.code}
              onChange={(e) =>
                setP(
                  p.map((x, n) =>
                    i === n ? { ...x, code: e.target.value.toUpperCase() } : x,
                  ),
                )
              }
            />
          </Field>
          <Field label={t("percent")}>
            <input
              type="number"
              min="1"
              max="90"
              required
              value={promo.percent}
              onChange={(e) =>
                setP(
                  p.map((x, n) =>
                    i === n ? { ...x, percent: Number(e.target.value) } : x,
                  ),
                )
              }
            />
          </Field>
          <label className="switch-label">
            <input
              type="checkbox"
              role="switch"
              aria-label={t("enabled") + " " + promo.code}
              checked={promo.active}
              onChange={(e) =>
                setP(
                  p.map((x, n) =>
                    i === n ? { ...x, active: e.target.checked } : x,
                  ),
                )
              }
            />
          </label>
          <button
            type="button"
            className="icon-button"
            aria-label={t("remove")}
            onClick={() => setP(p.filter((_, n) => n !== i))}
          >
            <X size={16} />
          </button>
        </div>
      ))}
      <div className="modal-actions">
        <button
          type="button"
          className="text-button"
          onClick={() => setP([...p, { code: "", percent: 10, active: true }])}
        >
          <Plus size={16} />
          {t("addPromo")}
        </button>
        <button className="primary" disabled={busy}>
          {t("save")}
        </button>
      </div>
    </form>
  );
}
