import { useState, useEffect, useRef } from "react";
import {
  ArrowUpRight,
  ArrowRight,
  ChevronDown,
  MapPin,
  ShoppingBag,
  UserRound,
  Coffee,
  ReceiptText,
  Search,
  Plus,
  Clock3,
  Bird,
  Leaf,
  X,
  Check,
  Loader2,
} from "lucide-react";
import type { CartItem, Config, Lang, Order, Product, User } from "./types";
import { translate, money, errorText, type TextKey } from "./i18n";
import {
  Context,
  api,
  readLocal,
  writeLocal,
  navigate,
  useStore,
  Modal,
  Quantity,
  Empty,
  sizeLabel,
} from "./lib";
import { Cart, Checkout, Orders, OrderDetail, PaymentModal } from "./Orders";
import { Profile, AddressModal, LoginModal } from "./Profile";
import Admin from "./Admin";
export default function App() {
  const [catalog, setCatalog] = useState<{
      products: Product[];
      config: Config;
    } | null>(null),
    [error, setError] = useState(false),
    [offline, setOffline] = useState(false);
  const [user, setUser] = useState<User | null>(null),
    [orders, setOrders] = useState<Order[]>([]);
  const [lang, setLang] = useState<Lang>(() => {
    const v = readLocal<Lang>("rassvet-language", "ru");
    return ["ru", "en", "uz"].includes(v) ? v : "ru";
  });
  const [cart, setCartState] = useState<CartItem[]>(() => {
    const c = readLocal<CartItem[]>("rassvet-cart", []);
    return Array.isArray(c)
      ? c.filter(
          (i) =>
            i &&
            typeof i.productId === "string" &&
            Number.isInteger(i.quantity) &&
            i.quantity > 0 &&
            i.quantity <= 50 &&
            ["regular", "oat", "almond"].includes(i.milk),
        )
      : [];
  });
  const [route, setRoute] = useState(location.hash.slice(1) || "menu"),
    [toast, setToast] = useState(""),
    [busy, setBusy] = useState(false),
    [product, setProduct] = useState<Product | null>(null),
    [addressOpen, setAddressOpen] = useState(false),
    [loginOpen, setLoginOpen] = useState(false),
    [payment, setPayment] = useState<Order | null>(null),
    [fulfillment, setFulfillment] = useState<"delivery" | "pickup">("delivery");
  const t = translate(lang);
  const userRef = useRef(user);
  userRef.current = user;
  const refreshUser = async () => {
    const r = await api<{ user: User | null }>("/me");
    setUser(r.user);
    return r.user;
  };
  const reload = async () => {
    const c = await api<{ products: Product[]; config: Config }>("/catalog");
    setCatalog(c);
    if (userRef.current) {
      const o = await api<Order[]>("/orders");
      setOrders(o);
    }
  };
  const notify = (message: string) => setToast(message);
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      notify(errorText(e instanceof Error ? e.message : "", lang));
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const [c, m] = await Promise.all([
          api<{ products: Product[]; config: Config }>("/catalog"),
          api<{ user: User | null }>("/me"),
        ]);
        if (!active) return;
        setCatalog(c);
        setUser(m.user);
        if (m.user) setLang(m.user.language);
        const tg = window.Telegram?.WebApp;
        tg?.ready();
        tg?.expand();
        if (tg?.initData) {
          const a = await api<{ user: User }>("/auth/telegram", "POST", {
            initData: tg.initData,
          });
          if (active) {
            setUser(a.user);
            setLang(a.user.language);
          }
        }
      } catch {
        if (active) setError(true);
      }
    })();
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    const on = () => setRoute(location.hash.slice(1) || "menu");
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try {
        const [c, o] = await Promise.all([
          api<{ products: Product[]; config: Config }>("/catalog"),
          user ? api<Order[]>("/orders") : Promise.resolve(null),
        ]);
        if (active) {
          setCatalog(c);
          if (o) setOrders(o);
          setOffline(false);
        }
      } catch {
        if (active) setOffline(true);
      }
    };
    void refresh();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 5000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [user?.id]);
  useEffect(() => {
    writeLocal("rassvet-cart", cart);
  }, [cart]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 4500);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    document.documentElement.lang = lang;
    writeLocal("rassvet-language", lang);
  }, [lang]);
  useEffect(() => {
    const theme = user?.theme || readLocal("rassvet-theme", "system");
    const media = matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      document.documentElement.dataset.theme =
        theme === "system" ? (media.matches ? "dark" : "light") : theme;
    };
    apply();
    media.addEventListener("change", apply);
    writeLocal("rassvet-theme", theme);
    return () => media.removeEventListener("change", apply);
  }, [user?.theme]);
  const updateUser = async (patch: Partial<User>) => {
    const r = await api<{ user: User }>("/me", "PATCH", patch);
    setUser(r.user);
  };
  const setLanguage = (l: Lang) => {
    setLang(l);
    if (user) void run(() => updateUser({ language: l }));
  };
  const setCart = (v: CartItem[]) => setCartState(v);
  const add = (p: Product, milk = "regular") => {
    if (!p.available) return;
    setCartState((prev) => {
      const found = prev.find((i) => i.productId === p.id && i.milk === milk);
      return found
        ? prev.map((i) =>
            i === found ? { ...i, quantity: Math.min(50, i.quantity + 1) } : i,
          )
        : [...prev, { productId: p.id, quantity: 1, milk }];
    });
    window.Telegram?.WebApp.HapticFeedback?.impactOccurred("light");
    notify(t("toastAdded"));
  };
  if (!catalog)
    return (
      <div className="boot">
        <img src="/bird.svg" width="64" alt="" />
        <h1>рассвет</h1>
        <p>{error ? t("loadError") : t("loading")}</p>
        {error ? (
          <button className="primary" onClick={() => location.reload()}>
            {t("reload")}
          </button>
        ) : (
          <Loader2 className="spin" />
        )}
      </div>
    );
  const cacheOrder = (order: Order) =>
    setOrders((previous) =>
      [order, ...previous.filter((o) => o.id !== order.id)].sort(
        (a, b) => b.number - a.number,
      ),
    );
  const store = {
    ...catalog,
    user,
    lang,
    t,
    cart,
    orders,
    cacheOrder,
    reload,
    refreshUser,
    setCart,
    updateUser,
    setLanguage,
    notify,
    run,
    add,
    setProduct,
    setAddressOpen,
    setLoginOpen,
    setPayment,
    fulfillment,
    setFulfillment,
    busy,
  };
  return (
    <Context.Provider value={store}>
      {location.pathname.startsWith("/admin") ? (
        <Admin />
      ) : (
        <>
          <Header route={route} />
          {offline && (
            <div className="connection-banner" role="status">
              {t("offline")}
            </div>
          )}
          <main>
            {route === "menu" ? (
              <Menu />
            ) : route === "cart" ? (
              <Cart />
            ) : route === "checkout" ? (
              <Checkout />
            ) : route === "orders" ? (
              <Orders />
            ) : route.startsWith("order/") ? (
              <OrderDetail id={route.slice(6)} />
            ) : route === "profile" ? (
              <Profile />
            ) : (
              <Menu />
            )}
          </main>
          <Footer />
          <BottomNav route={route} />
        </>
      )}
      <ProductModal product={product} onClose={() => setProduct(null)} />
      <AddressModal open={addressOpen} onClose={() => setAddressOpen(false)} />
      <LoginModal open={loginOpen} onClose={() => setLoginOpen(false)} />
      <PaymentModal order={payment} onClose={() => setPayment(null)} />
      {toast && (
        <div className="toast" role="status">
          <Check size={18} />
          <span>{toast}</span>
          <button aria-label={t("cancel")} onClick={() => setToast("")}>
            <X size={16} />
          </button>
        </div>
      )}
    </Context.Provider>
  );
}
function Header({ route }: { route: string }) {
  const { t, lang, setLanguage, cart, config } = useStore();
  const count = cart.reduce((s, i) => s + i.quantity, 0);
  return (
    <>
      <div className="topline">
        <span>{t("made")}</span>
        <span>
          <Clock3 size={12} />
          {t("hours")}
        </span>
      </div>
      <header className="header">
        <a href="#menu" className="brand" aria-label="Рассвет — меню">
          <img src="/bird.svg" alt="" />
          <span>
            рассвет<small>coffee & community</small>
          </span>
        </a>
        <nav className="desktop-nav">
          {(["menu", "orders", "profile"] as const).map((key) => (
            <a
              className={route === key ? "active" : ""}
              href={"#" + key}
              key={key}
            >
              {t(key)}
            </a>
          ))}
        </nav>
        <div className="header-actions">
          <select
            aria-label={t("language")}
            value={lang}
            onChange={(e) => setLanguage(e.target.value as Lang)}
          >
            <option value="ru">RU</option>
            <option value="uz">UZ</option>
            <option value="en">EN</option>
          </select>
          <button className="header-cart" onClick={() => navigate("cart")}>
            <ShoppingBag size={19} />
            <span>{t("cart")}</span>
            <b>{count}</b>
          </button>
        </div>
      </header>
      {config.demo && (
        <div className="demo-strip">
          <span className="dot" />
          {t("demoBanner")}
          <span className="demo-extra"> · {t("noRealOrders")}</span>
        </div>
      )}
    </>
  );
}
function BottomNav({ route }: { route: string }) {
  const { t, cart } = useStore();
  return (
    <nav className="bottom-nav">
      {(
        [
          { key: "menu", icon: Coffee },
          { key: "orders", icon: ReceiptText },
          { key: "cart", icon: ShoppingBag },
          { key: "profile", icon: UserRound },
        ] as const
      ).map(({ key, icon: Icon }) => (
        <a href={"#" + key} key={key} className={route === key ? "active" : ""}>
          <span>
            <Icon size={21} />
            {key === "cart" && cart.length > 0 && (
              <i>{cart.reduce((s, i) => s + i.quantity, 0)}</i>
            )}
          </span>
          {t(key)}
        </a>
      ))}
    </nav>
  );
}
function Footer() {
  const { t, config } = useStore();
  return (
    <footer className="footer">
      <span>
        <Bird size={20} />
        {t("footer")}
      </span>
      <a
        href={`https://yandex.uz/maps/org/rassvet/13907443903/`}
        target="_blank"
        rel="noreferrer"
      >
        Chimkent, 17 · Tashkent <ArrowUpRight size={14} />
      </a>
      <a href={`tel:${config.cafe.phone}`}>+998 50 900 50 11</a>
      <a href="/admin">{t("staff")}</a>
    </footer>
  );
}
export function FulfillmentSwitch() {
  const { t, fulfillment, setFulfillment } = useStore();
  return (
    <div className="segmented">
      {(["delivery", "pickup"] as const).map((v) => (
        <button
          key={v}
          className={fulfillment === v ? "selected" : ""}
          onClick={() => setFulfillment(v)}
          type="button"
        >
          {t(v)}
        </button>
      ))}
    </div>
  );
}
function Menu() {
  const {
    t,
    lang,
    products,
    config,
    user,
    setAddressOpen,
    setLoginOpen,
    fulfillment,
    setProduct,
  } = useStore();
  const [category, setCategory] = useState("all"),
    [search, setSearch] = useState(""),
    [story, setStory] = useState<Config["stories"][number] | null>(null);
  const address = user?.addresses.find((a) => a.id === user.selectedAddress);
  const categories = [
    "all",
    "coffee",
    "breakfast",
    "bakery",
    "bowls",
    "sandwiches",
    "drinks",
  ];
  const filtered = products.filter(
    (p) =>
      (category === "all" || p.category === category) &&
      p.name[lang].toLowerCase().includes(search.toLowerCase()),
  );
  const toProducts = () =>
    document
      .getElementById("catalog")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  return (
    <div className="page menu-page">
      <div className="delivery-bar">
        <FulfillmentSwitch />
        <button
          className="address-trigger"
          onClick={() => (user ? setAddressOpen(true) : setLoginOpen(true))}
        >
          <MapPin size={19} />
          <span>
            <small>
              {fulfillment === "delivery" ? t("deliveryTo") : t("pickup")}
            </small>
            {fulfillment === "delivery"
              ? address?.street || t("addAddress")
              : t("pickupAt")}
          </span>
          <ChevronDown size={16} />
        </button>
        <span className="delivery-meta">
          {t("minimum")} <b>{money(config.settings.minimum, lang)}</b>
          <span>·</span> {config.settings.radius} km
        </span>
      </div>
      <section className="hero">
        <div className="hero-copy">
          <div className="eyebrow">
            <span /> RASSVET, TASHKENT
          </div>
          <h1>
            {t("greeting")}
            <br />
            <em>{t("dawn")}</em>
          </h1>
          <p>{t("heroText")}</p>
          <button className="primary" onClick={toProducts}>
            {t("browse")}
            <ArrowUpRight size={19} />
          </button>
          <div className="hero-foot">
            <Leaf size={16} />
            <span>specialty coffee & good days</span>
          </div>
        </div>
        <div className="hero-image">
          <img
            src="/images/cafe.jpg"
            alt="Рассвет — кофейня в Ташкенте"
            fetchPriority="high"
          />
          <div className="hero-stamp">
            <Bird size={32} strokeWidth={1.3} />
            <span>
              slow mornings
              <br />
              warm hearts
            </span>
          </div>
          <div className="photo-caption">
            <span>Чимкент, 17</span>
            <span>41°18′ N · 69°16′ E</span>
          </div>
        </div>
      </section>
      <div className="story-row">
        {config.stories.map((s, i) => (
          <button
            key={s.id}
            className={"story-card story-" + i}
            onClick={() => setStory(s)}
          >
            <span className="story-icon">
              {s.type === "offer" ? (
                <span>%</span>
              ) : (
                <Coffee size={33} strokeWidth={1.2} />
              )}
            </span>
            <span className="story-copy">
              <small>{t(s.type)}</small>
              <strong>{s.title[lang]}</strong>
              <span>
                {t("details")} <ArrowRight size={13} />
              </span>
            </span>
            <ArrowUpRight size={21} />
          </button>
        ))}
      </div>
      <section id="catalog" className="catalog">
        <div className="section-heading">
          <div>
            <div className="eyebrow">MADE WITH LOVE</div>
            <h2>{t("menu")}</h2>
          </div>
          <label className="search">
            <Search size={19} />
            <input
              placeholder={t("search")}
              aria-label={t("search")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button aria-label={t("clear")} onClick={() => setSearch("")}>
                <X size={16} />
              </button>
            )}
          </label>
        </div>
        <div className="categories">
          {categories.map((c, i) => (
            <button
              key={c}
              className={category === c ? "selected" : ""}
              onClick={() => setCategory(c)}
            >
              {i === 0 && <Coffee size={16} />} {t(c as TextKey)}
            </button>
          ))}
        </div>
        {category === "all" && !search && (
          <div className="catalog-caption">
            <h3>{t("popular")}</h3>
            <span>{t("popularSub")}</span>
          </div>
        )}
        {filtered.length ? (
          <div className="product-grid">
            {[...filtered]
              .sort((a, b) =>
                category === "all" && !search
                  ? Number(b.featured) - Number(a.featured)
                  : 0,
              )
              .map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
          </div>
        ) : (
          <Empty title={t("emptySearch")} text={t("emptySearchText")} />
        )}
        <div className="menu-note">
          <Leaf size={16} />
          {t("demoMenuHint")}
        </div>
      </section>
      <section className="closing-banner">
        <Bird size={42} strokeWidth={1} />
        <div>
          <h2>{t("seasonal")}</h2>
          <p>{t("seasonalSub")}</p>
        </div>
        <button
          className="round-link"
          aria-label={t("coffee")}
          onClick={() => {
            setCategory("coffee");
            toProducts();
          }}
        >
          <ArrowUpRight />
        </button>
      </section>
      <Modal
        open={!!story}
        onClose={() => setStory(null)}
        title={story?.title[lang] || ""}
      >
        {story && (
          <div className="story-detail">
            <div className="eyebrow">{t(story.type)}</div>
            <p>{story.text[lang]}</p>
            <span className="pill">{t("demo")}</span>
            <button
              className="primary full"
              onClick={() => {
                setStory(null);
                toProducts();
              }}
            >
              {t("toMenu")}
              <ArrowRight size={18} />
            </button>
          </div>
        )}
      </Modal>
    </div>
  );
}
function ProductCard({ product: p }: { product: Product }) {
  const { t, lang, add, setProduct, cart } = useStore();
  const count = cart
    .filter((i) => i.productId === p.id)
    .reduce((s, i) => s + i.quantity, 0);
  return (
    <article className={"product-card " + (!p.available ? "unavailable" : "")}>
      <button
        className="product-image"
        onClick={() => setProduct(p)}
        aria-label={p.name[lang]}
      >
        <img src={p.image} alt={p.name[lang]} loading="lazy" />
        {p.featured && (
          <span className="product-badge">
            <Leaf size={11} /> Rassvet loves
          </span>
        )}
        {!p.available && <span className="sold-overlay">{t("soldOut")}</span>}
      </button>
      <div className="product-body">
        <button className="product-name" onClick={() => setProduct(p)}>
          {p.name[lang]}
        </button>
        <span className="product-size">{sizeLabel(p.size, t)}</span>
        <div className="product-bottom">
          <strong>{money(p.price, lang)}</strong>
          <button
            className={"add-button " + (count ? "has-items" : "")}
            disabled={!p.available}
            aria-label={`${t("add")} ${p.name[lang]}`}
            onClick={() => (p.options ? setProduct(p) : add(p))}
          >
            {count ? <span>{count}</span> : <Plus size={19} />}
          </button>
        </div>
      </div>
    </article>
  );
}
function ProductModal({
  product: p,
  onClose,
}: {
  product: Product | null;
  onClose: () => void;
}) {
  const { t, lang, add, products } = useStore();
  const [milk, setMilk] = useState("regular");
  useEffect(() => setMilk("regular"), [p?.id]);
  const current = products.find((x) => x.id === p?.id) || p;
  return (
    <Modal open={!!p} onClose={onClose} title={p?.name[lang] || ""}>
      {current && (
        <div className="product-detail">
          <img
            className="detail-image"
            src={current.image}
            alt={current.name[lang]}
          />
          <div className="detail-info">
            <span className="muted">{sizeLabel(current.size, t)}</span>
            {current.options && (
              <>
                <h3>{t("customize")}</h3>
                <div className="milk-options">
                  {(["regular", "oat", "almond"] as const).map((m) => (
                    <button
                      className={m === milk ? "selected" : ""}
                      onClick={() => setMilk(m)}
                      key={m}
                    >
                      <span>{t(m)}</span>
                      <small>
                        {m === "regular" ? "+0" : "+10 000"} {t("sum")}
                      </small>
                    </button>
                  ))}
                </div>
              </>
            )}
            <p className="muted small">{t("productInfo")}</p>
            <button
              className="primary full"
              disabled={!current.available}
              onClick={() => {
                add(current, milk);
                onClose();
              }}
            >
              <span>{current.available ? t("add") : t("soldOut")}</span>
              <span>
                {money(current.price + (milk === "regular" ? 0 : 10000), lang)}
              </span>
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
