import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Trash2,
  ShoppingBag,
  MapPin,
  Check,
  CreditCard,
  Banknote,
  PackageCheck,
  Coffee,
  Bike,
  Phone,
  Clock3,
  AlertCircle,
  ReceiptText,
} from "lucide-react";
import { useStore, navigate, Modal, Quantity, Empty, Field, api } from "./lib";
import { money, type TextKey } from "./i18n";
import type { Order, Status } from "./types";
import { FulfillmentSwitch } from "./App";
export function PageTitle({
  title,
  subtitle,
  back = false,
}: {
  title: string;
  subtitle?: string;
  back?: boolean;
}) {
  const { t } = useStore();
  return (
    <div className="page-title">
      {back && (
        <button className="back-link" onClick={() => navigate("cart")}>
          <ArrowLeft size={16} />
          {t("back")}
        </button>
      )}
      <div className="eyebrow">RASSVET, WITH LOVE</div>
      <h1>{title}</h1>
      {subtitle && <p>{subtitle}</p>}
    </div>
  );
}
export function Cart() {
  const { t, lang, cart, setCart, products, config, user, setLoginOpen } =
    useStore();
  const [clear, setClear] = useState(false);
  const lines = cart.map((i) => ({
    ...i,
    p: products.find((p) => p.id === i.productId),
  }));
  const subtotal = lines.reduce(
    (s, i) =>
      s + ((i.p?.price || 0) + (i.milk === "regular" ? 0 : 10000)) * i.quantity,
    0,
  );
  const missing = lines.some((i) => !i.p?.available);
  const update = (index: number, quantity: number) =>
    setCart(
      cart
        .map((i, n) => (n === index ? { ...i, quantity } : i))
        .filter((i) => i.quantity > 0),
    );
  return (
    <div className="page narrow">
      <PageTitle title={t("cart")} />
      {!cart.length ? (
        <Empty
          title={t("emptyCart")}
          text={t("emptyCartText")}
          action={
            <button className="primary" onClick={() => navigate("menu")}>
              {t("toMenu")}
              <ArrowRight size={18} />
            </button>
          }
        />
      ) : (
        <div className="checkout-layout">
          <section className="panel cart-panel">
            <div className="panel-heading">
              <h3>
                {t("yourOrder")}{" "}
                <span className="count-tag">
                  {cart.reduce((s, i) => s + i.quantity, 0)}
                </span>
              </h3>
              <button
                className="text-button danger"
                onClick={() => setClear(true)}
              >
                <Trash2 size={15} />
                {t("clear")}
              </button>
            </div>
            {lines.map((item, index) => (
              <div className="cart-item" key={item.productId + item.milk}>
                <img src={item.p?.image || "/bird.svg"} alt="" />
                <div className="cart-item-info">
                  <h3>{item.p?.name[lang] || item.productId}</h3>
                  {item.p?.options && (
                    <p>
                      {t("milk")}: {t(item.milk as TextKey)}
                    </p>
                  )}
                  {!item.p?.available && (
                    <small className="danger">{t("soldOut")}</small>
                  )}
                  <strong>
                    {money(
                      ((item.p?.price || 0) +
                        (item.milk === "regular" ? 0 : 10000)) *
                        item.quantity,
                      lang,
                    )}
                  </strong>
                </div>
                <div className="cart-item-controls">
                  <button
                    className="icon-button muted"
                    aria-label={t("remove") + " " + item.p?.name[lang]}
                    onClick={() => update(index, 0)}
                  >
                    <Trash2 size={16} />
                  </button>
                  <Quantity
                    value={item.quantity}
                    onChange={(n) => update(index, n)}
                  />
                </div>
              </div>
            ))}
          </section>
          <aside className="panel summary">
            <h3>{t("yourOrder")}</h3>
            <div className="summary-line">
              <span>{t("subtotal")}</span>
              <span>{money(subtotal, lang)}</span>
            </div>
            <div className="summary-total">
              <span>{t("total")}</span>
              <strong>{money(subtotal, lang)}</strong>
            </div>
            {subtotal < config.settings.minimum && (
              <div className="notice">
                {t("left")}:{" "}
                <b>{money(config.settings.minimum - subtotal, lang)}</b>
                <progress value={subtotal} max={config.settings.minimum} />
              </div>
            )}
            {missing && (
              <p className="notice warning">{t("unavailableCart")}</p>
            )}
            <button
              className="primary full"
              disabled={subtotal < config.settings.minimum || missing}
              onClick={() => {
                navigate("checkout");
                if (!user) setLoginOpen(true);
              }}
            >
              {t("checkout")}
              <ArrowRight size={17} />
            </button>
            <p className="small muted">
              {t("minimum")}: {money(config.settings.minimum, lang)}
            </p>
            <button className="text-button" onClick={() => navigate("menu")}>
              + {t("toMenu")}
            </button>
          </aside>
        </div>
      )}
      <Modal
        open={clear}
        onClose={() => setClear(false)}
        title={t("clearConfirm")}
      >
        <div className="modal-actions">
          <button className="secondary" onClick={() => setClear(false)}>
            {t("cancel")}
          </button>
          <button
            className="primary"
            onClick={() => {
              setCart([]);
              setClear(false);
            }}
          >
            {t("clear")}
          </button>
        </div>
      </Modal>
    </div>
  );
}
export function Checkout() {
  const {
    t,
    lang,
    user,
    config,
    products,
    cart,
    setCart,
    fulfillment,
    setAddressOpen,
    setLoginOpen,
    run,
    reload,
    cacheOrder,
    setPayment,
    busy,
    notify,
  } = useStore();
  const [name, setName] = useState(user?.name || ""),
    [phone, setPhone] = useState(user?.phone || ""),
    [comment, setComment] = useState(""),
    [method, setMethod] = useState<Order["method"]>("cash"),
    [promo, setPromo] = useState(""),
    [applied, setApplied] = useState("");
  const lock = useRef(false);
  useEffect(() => {
    setName(user?.name || "");
    setPhone(user?.phone || "");
  }, [user?.id, user?.phone]);
  const address = user?.addresses.find((a) => a.id === user.selectedAddress);
  const subtotal = cart.reduce(
    (s, i) =>
      s +
      ((products.find((p) => p.id === i.productId)?.price || 0) +
        (i.milk === "regular" ? 0 : 10000)) *
        i.quantity,
    0,
  );
  const promotion = config.promos.find((p) => p.code === applied && p.active);
  const discount = Math.floor((subtotal * (promotion?.percent || 0)) / 100);
  const fee = fulfillment === "delivery" ? config.settings.deliveryFee : 0;
  const blocked =
    !config.open ||
    subtotal < config.settings.minimum ||
    cart.some((i) => !products.find((p) => p.id === i.productId)?.available);
  const submit = async () => {
    if (lock.current) return;
    if (!user?.phone) {
      setLoginOpen(true);
      return;
    }
    lock.current = true;
    try {
      await run(async () => {
        const body = {
          items: cart,
          fulfillment,
          method,
          addressId: address?.id,
          name,
          phone,
          comment,
          promo: applied,
        };
        const signature = JSON.stringify(body);
        let previous;
        try {
          previous = JSON.parse(
            sessionStorage.getItem("rassvet-pending-order") || "null",
          );
        } catch {}
        const requestKey =
          previous?.signature === signature
            ? previous.requestKey
            : crypto.randomUUID();
        try {
          sessionStorage.setItem(
            "rassvet-pending-order",
            JSON.stringify({ signature, requestKey }),
          );
        } catch {}
        const order = await api<Order>("/orders", "POST", {
          ...body,
          requestKey,
        });
        cacheOrder(order);
        setCart([]);
        try {
          sessionStorage.removeItem("rassvet-pending-order");
        } catch {}
        navigate("order/" + order.id);
        if (method !== "cash") setPayment(order);
        void reload().catch(() => notify(t("offline")));
      });
    } finally {
      lock.current = false;
    }
  };
  if (!cart.length)
    return (
      <div className="page narrow">
        <Empty
          title={t("emptyCart")}
          action={
            <button className="primary" onClick={() => navigate("menu")}>
              {t("toMenu")}
            </button>
          }
        />
      </div>
    );
  return (
    <div className="page narrow">
      <PageTitle title={t("checkout")} back />
      <form
        className="checkout-layout"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <div className="form-sections">
          <section className="panel">
            <h3>
              <span className="step-number">01</span>
              {t("contact")}
            </h3>
            {!user ? (
              <button
                type="button"
                className="primary full"
                onClick={() => setLoginOpen(true)}
              >
                {t("sharePhone")}
              </button>
            ) : (
              <div className="fields two">
                <Field label={t("name")}>
                  <input
                    required
                    maxLength={80}
                    autoComplete="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </Field>
                <Field label={t("phone")}>
                  <input
                    required
                    type="tel"
                    pattern="\+998[0-9]{9}"
                    title="+998901234567"
                    autoComplete="tel"
                    value={phone}
                    readOnly={!!user.telegramId}
                    onChange={(e) => setPhone(e.target.value)}
                  />
                </Field>
              </div>
            )}
          </section>
          <section className="panel">
            <h3>
              <span className="step-number">02</span>
              {t("deliveryDetails")}
            </h3>
            <FulfillmentSwitch />
            {fulfillment === "delivery" ? (
              <>
                <button
                  type="button"
                  className="address-box"
                  onClick={() =>
                    user ? setAddressOpen(true) : setLoginOpen(true)
                  }
                >
                  <MapPin size={23} />
                  <span>
                    <strong>{address?.label || t("addAddress")}</strong>
                    <small>{address?.street || t("chooseAddress")}</small>
                    {address?.apartment && (
                      <small>
                        {t("apartment")}: {address.apartment}
                      </small>
                    )}
                  </span>
                  <ArrowRight size={18} />
                </button>
                <p className="small muted">
                  {t("yandexHint")} · {money(fee, lang)}
                </p>
                {config.demo && <p className="small muted">{t("feeHint")}</p>}
              </>
            ) : (
              <div className="notice">
                <MapPin size={19} />
                {t("pickupHint")}
              </div>
            )}
            <Field label={t("comment")}>
              <textarea
                rows={3}
                maxLength={500}
                placeholder={t("commentHint")}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
              />
            </Field>
          </section>
          <section className="panel">
            <h3>
              <span className="step-number">03</span>
              {t("payment")}
            </h3>
            <div className="payment-options">
              {(["cash", "click", "payme"] as const).map((m) => (
                <label
                  key={m}
                  className={
                    "payment-choice " + (method === m ? "selected" : "")
                  }
                >
                  <input
                    type="radio"
                    name="payment"
                    checked={method === m}
                    onChange={() => setMethod(m)}
                    disabled={!config.demo && m !== "cash"}
                  />
                  {m === "cash" ? (
                    <Banknote size={25} />
                  ) : (
                    <span className={"payment-brand " + m}>
                      {m === "click" ? "CLICK" : "payme"}
                    </span>
                  )}
                  <span>
                    <strong>
                      {m === "cash"
                        ? t("cash")
                        : m === "click"
                          ? "Click"
                          : "Payme"}
                    </strong>
                    <small>{t(m === "cash" ? "cashHint" : "onlineHint")}</small>
                  </span>
                  <span className="radio-mark">{method === m && <span />}</span>
                </label>
              ))}
            </div>
          </section>
        </div>
        <aside className="panel summary">
          <h3>{t("yourOrder")}</h3>
          <div className="mini-items">
            {cart.map((i) => {
              const p = products.find((p) => p.id === i.productId);
              return (
                <div key={i.productId + i.milk}>
                  <span>
                    {i.quantity} × {p?.name[lang]}
                    {i.milk !== "regular" && (
                      <small> · {t(i.milk as TextKey)}</small>
                    )}
                  </span>
                  <b>
                    {money(
                      ((p?.price || 0) + (i.milk === "regular" ? 0 : 10000)) *
                        i.quantity,
                      lang,
                    )}
                  </b>
                </div>
              );
            })}
          </div>
          <Field label={t("promo")}>
            <div className="input-action">
              <input
                maxLength={40}
                value={promo}
                onChange={(e) => {
                  setPromo(e.target.value.toUpperCase());
                  setApplied("");
                }}
                placeholder={t("promoHint")}
              />
              <button
                type="button"
                onClick={() => {
                  if (
                    config.promos.some(
                      (p) => p.active && p.code === promo.trim(),
                    )
                  ) {
                    setApplied(promo.trim());
                    notify(t("promoApplied"));
                  } else
                    void run(async () => {
                      throw new Error("PROMO_INVALID");
                    });
                }}
              >
                {t("apply")}
              </button>
            </div>
          </Field>
          <div className="summary-line">
            <span>{t("subtotal")}</span>
            {money(subtotal, lang)}
          </div>
          {discount > 0 && (
            <div className="summary-line green">
              <span>
                {t("discount")} · {applied}
              </span>
              −{money(discount, lang)}
            </div>
          )}
          <div className="summary-line">
            <span>{t("delivery")}</span>
            {money(fee, lang)}
          </div>
          <div className="summary-total">
            <span>{t("total")}</span>
            <strong>{money(subtotal - discount + fee, lang)}</strong>
          </div>
          {!config.open && <p className="notice warning">{t("closed")}</p>}
          {config.demo && config.settings.bypassHours && (
            <p className="small muted">{t("demoTime")}</p>
          )}
          <button
            type="submit"
            disabled={
              busy ||
              blocked ||
              (fulfillment === "delivery" && !!user && !address)
            }
            className="primary full"
          >
            {t(method === "cash" ? "placeOrder" : "pay")}
            <ArrowRight size={17} />
          </button>
          <p className="consent">{t("consent")}</p>
        </aside>
      </form>
    </div>
  );
}
export function PaymentModal({
  order,
  onClose,
}: {
  order: Order | null;
  onClose: () => void;
}) {
  const { t, lang, run, reload, cacheOrder, busy, notify } = useStore();
  const pay = (outcome: "success" | "fail" | "cancel") =>
    void run(async () => {
      if (!order) return;
      const result = await api<Order>(
        `/orders/${order.id}/demo-payment`,
        "POST",
        { outcome },
      );
      cacheOrder(result);
      onClose();
      navigate("order/" + order.id);
      void reload().catch(() => notify(t("offline")));
      if (outcome === "fail") notify(t("paymentFailed"));
    });
  return (
    <Modal open={!!order} onClose={onClose} title={t("demoPayment")}>
      {order && (
        <div className="payment-demo">
          <span className={"large-payment-brand " + order.method}>
            {order.method === "click" ? "CLICK" : "payme"}
          </span>
          <span className="pill">{t("demo")}</span>
          <h2>{money(order.total, lang)}</h2>
          <p>{t("demoPaymentText")}</p>
          <button
            disabled={busy}
            className="primary full"
            onClick={() => pay("success")}
          >
            <Check size={19} />
            {t("successPay")}
          </button>
          <button
            disabled={busy}
            className="secondary full"
            onClick={() => pay("fail")}
          >
            <AlertCircle size={18} />
            {t("failPay")}
          </button>
          <button
            disabled={busy}
            className="text-button"
            onClick={() => pay("cancel")}
          >
            {t("cancelPay")}
          </button>
        </div>
      )}
    </Modal>
  );
}
export function PaymentStatus({ order }: { order: Order }) {
  const { t } = useStore();
  const keys = {
    paid: "paid",
    pending: "pending",
    failed: "failed",
    cash: "cashStatus",
    refunded: "refunded",
  } as const;
  return (
    <span className={"payment-status " + order.payment}>
      {t(keys[order.payment])}
    </span>
  );
}
export function Orders() {
  const { t, lang, orders, user, setLoginOpen } = useStore();
  return (
    <div className="page narrow">
      <PageTitle title={t("orders")} />
      {!user ? (
        <Empty
          title={t("loginTitle")}
          text={t("loginText")}
          action={
            <button className="primary" onClick={() => setLoginOpen(true)}>
              {t("sharePhone")}
            </button>
          }
        />
      ) : !orders.length ? (
        <Empty
          title={t("noOrders")}
          text={t("noOrdersText")}
          action={
            <button className="primary" onClick={() => navigate("menu")}>
              {t("toMenu")}
            </button>
          }
        />
      ) : (
        <div className="order-list">
          {orders.map((o) => (
            <button
              className="order-card panel"
              key={o.id}
              onClick={() => navigate("order/" + o.id)}
            >
              <div className="order-card-head">
                <span>
                  <b>
                    {t("order")} #{String(o.number).padStart(4, "0")}
                  </b>
                  <small>
                    {new Date(o.createdAt).toLocaleString(lang, {
                      timeZone: "Asia/Tashkent",
                      day: "numeric",
                      month: "long",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </small>
                </span>
                <span className={"status-pill " + o.status}>{t(o.status)}</span>
              </div>
              <div className="order-card-items">
                {o.items.slice(0, 4).map((i, n) => (
                  <img src={i.image} key={n} alt={i.name[lang]} />
                ))}
                <span>
                  {money(o.total, lang)}
                  <ArrowRight size={18} />
                </span>
              </div>
              <PaymentStatus order={o} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
export function OrderDetail({ id }: { id: string }) {
  const { t, lang, orders, setPayment, config, user, setLoginOpen } =
    useStore();
  const order = orders.find((o) => o.id === id);
  if (!order)
    return (
      <div className="page narrow">
        <Empty
          title={user ? t("loading") : t("loginTitle")}
          action={
            <button
              className="primary"
              onClick={() => (user ? navigate("orders") : setLoginOpen(true))}
            >
              {t(user ? "orders" : "sharePhone")}
            </button>
          }
        />
      </div>
    );
  const steps: Status[] = [
    "accepted",
    "preparing",
    "ready",
    ...(order.fulfillment === "delivery" ? ["delivering" as const] : []),
    "completed",
  ];
  const icons = [
    ReceiptText,
    Coffee,
    PackageCheck,
    ...(order.fulfillment === "delivery" ? [Bike] : []),
    Check,
  ];
  const index = steps.indexOf(order.status);
  return (
    <div className="page narrow">
      <button className="back-link" onClick={() => navigate("orders")}>
        <ArrowLeft size={16} />
        {t("orders")}
      </button>
      <div className="tracking-heading">
        <span className="tracking-bird">
          <BirdIcon />
        </span>
        <div className="eyebrow">
          {t("order")} #{String(order.number).padStart(4, "0")}
        </div>
        <h1>
          {order.status === "cancelled"
            ? t("cancelled")
            : order.status === "completed"
              ? t(
                  order.fulfillment === "delivery"
                    ? "deliveryComplete"
                    : "completed",
                )
              : order.status === "awaiting_payment"
                ? t("pending")
                : t("orderReceived")}
        </h1>
        <p>{t("orderReceivedText")}</p>
        <PaymentStatus order={order} />
      </div>
      {order.status === "awaiting_payment" && (
        <div className="payment-callout panel">
          <CreditCard size={30} />
          <div>
            <h3>{t(order.payment === "failed" ? "failed" : "pending")}</h3>
            <p>{t("demoBanner")}</p>
          </div>
          <button className="primary" onClick={() => setPayment(order)}>
            {t("retry")}
          </button>
        </div>
      )}
      {order.status !== "cancelled" && (
        <section className="panel tracking-panel">
          <div className="timeline">
            {steps.map((step, i) => {
              const Icon = icons[i];
              const event = order.history.find((h) => h.status === step);
              return (
                <div
                  className={
                    "timeline-step " +
                    (i <= index ? "done" : "") +
                    " " +
                    (i === index ? "current" : "")
                  }
                  key={step}
                >
                  <div className="timeline-icon">
                    <Icon size={21} />
                  </div>
                  <div>
                    <strong>
                      {t(
                        step === "completed" && order.fulfillment === "delivery"
                          ? "deliveryComplete"
                          : step,
                      )}
                    </strong>
                    <small>
                      {event
                        ? new Date(event.at).toLocaleTimeString(lang, {
                            timeZone: "Asia/Tashkent",
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : "—"}
                    </small>
                  </div>
                </div>
              );
            })}
          </div>
          <p className="small muted">
            <span className="pulse-dot" />
            {t("trackingHint")}
          </p>
        </section>
      )}
      <div className="checkout-layout">
        <section className="panel">
          <h3>{t(order.fulfillment)}</h3>
          <div className="address-box static">
            <MapPin size={24} />
            <div>
              <strong>{order.address?.street || config.cafe.address}</strong>
              {order.address && (
                <p>
                  {[
                    order.address.apartment &&
                      `${t("apartment")}: ${order.address.apartment}`,
                    order.address.entrance &&
                      `${t("entrance")}: ${order.address.entrance}`,
                    order.address.floor &&
                      `${t("floor")}: ${order.address.floor}`,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              )}
              {order.address?.comment && <p>{order.address.comment}</p>}
            </div>
          </div>
          <div className="contact-summary">
            <span>{order.name}</span>
            <span>{order.phone}</span>
          </div>
          {order.comment && <p className="notice">{order.comment}</p>}
          {order.courierNote && (
            <div className="notice">
              <b>{t("orderNote")}</b>
              <p>{order.courierNote}</p>
            </div>
          )}
          <a className="secondary" href={"tel:" + config.cafe.phone}>
            <Phone size={17} />
            {t("help")}
          </a>
        </section>
        <section className="panel summary">
          <h3>{t("yourOrder")}</h3>
          <div className="mini-items">
            {order.items.map((i, n) => (
              <div key={n}>
                <span>
                  {i.quantity} × {i.name[lang]}
                  {i.milk !== "regular" && (
                    <small> · {t(i.milk as TextKey)}</small>
                  )}
                </span>
                <b>{money(i.unitPrice * i.quantity, lang)}</b>
              </div>
            ))}
          </div>
          <div className="summary-line">
            <span>{t("discount")}</span>−{money(order.discount, lang)}
          </div>
          <div className="summary-line">
            <span>{t("delivery")}</span>
            {money(order.deliveryFee, lang)}
          </div>
          <div className="summary-total">
            <span>{t("total")}</span>
            <strong>{money(order.total, lang)}</strong>
          </div>
        </section>
      </div>
    </div>
  );
}
function BirdIcon() {
  return <Coffee size={36} strokeWidth={1.3} />;
}
