import { useEffect, useRef, useState } from "react";
import {
  Camera,
  MapPin,
  Plus,
  Trash2,
  Copy,
  Sun,
  Moon,
  Monitor,
  ChevronRight,
  LocateFixed,
  Search,
  ArrowUpRight,
  Phone,
  Check,
  Loader2,
} from "lucide-react";
import { useStore, Modal, Field, Empty, api } from "./lib";
import { PageTitle } from "./Orders";
import type { Address, Lang, User } from "./types";
export function LoginModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { t, config, user, refreshUser, run, busy, notify } = useStore();
  const [waiting, setWaiting] = useState(false);
  useEffect(() => {
    if (!open) {
      setWaiting(false);
      return;
    }
    if (user?.phone) onClose();
  }, [open, user?.phone]);
  useEffect(() => {
    if (!waiting) return;
    const timer = setInterval(
      () =>
        void refreshUser()
          .then((u) => {
            if (u?.phone) {
              setWaiting(false);
              onClose();
            }
          })
          .catch(() => {}),
      2000,
    );
    const timeout = setTimeout(() => setWaiting(false), 60000);
    return () => {
      clearInterval(timer);
      clearTimeout(timeout);
    };
  }, [waiting]);
  const share = () => {
    const tg = window.Telegram?.WebApp;
    if (tg?.requestContact) {
      setWaiting(true);
      tg.requestContact((sent) => {
        if (!sent) setWaiting(false);
      });
    } else notify(t("telegramOnly"));
  };
  return (
    <Modal open={open} onClose={onClose} title={t("loginTitle")}>
      <div className="login-content">
        <div className="login-icon">
          <Phone size={33} strokeWidth={1.4} />
        </div>
        <p>{t("loginText")}</p>
        {window.Telegram?.WebApp.initData && (
          <button className="primary full" disabled={waiting} onClick={share}>
            {waiting ? (
              <Loader2 className="spin" size={18} />
            ) : (
              <Phone size={18} />
            )}{" "}
            {t("sharePhone")}
          </button>
        )}
        {waiting && <p className="notice">{t("phoneWaiting")}</p>}
        {config.demo && (
          <>
            <button
              disabled={busy}
              className="secondary full"
              onClick={() =>
                void run(async () => {
                  await api("/auth/demo", "POST", {});
                  await refreshUser();
                  onClose();
                })
              }
            >
              {t("demoLogin")}
            </button>
            <p className="small muted">{t("demoLoginHint")}</p>
          </>
        )}
        {!config.demo && !window.Telegram?.WebApp.initData && (
          <p className="notice">{t("telegramOnly")}</p>
        )}
      </div>
    </Modal>
  );
}
export function Profile() {
  const {
    t,
    lang,
    user,
    config,
    updateUser,
    setLanguage,
    setAddressOpen,
    setLoginOpen,
    run,
    notify,
    busy,
  } = useStore();
  const [deleteId, setDeleteId] = useState("");
  const [name, setName] = useState(user?.name || ""),
    [phone, setPhone] = useState(user?.phone || "");
  useEffect(() => {
    setName(user?.name || "");
    setPhone(user?.phone || "");
  }, [user?.id]);
  const upload = async (file: File) => {
    if (
      !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
      file.size > 5 * 1024 * 1024
    )
      throw new Error("VALIDATION");
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = reject;
        img.src = url;
      });
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 256;
      const ctx = canvas.getContext("2d")!;
      const size = Math.min(img.width, img.height);
      ctx.drawImage(
        img,
        (img.width - size) / 2,
        (img.height - size) / 2,
        size,
        size,
        0,
        0,
        256,
        256,
      );
      await updateUser({ avatar: canvas.toDataURL("image/jpeg", 0.85) });
      notify(t("saved"));
    } finally {
      URL.revokeObjectURL(url);
    }
  };
  if (!user)
    return (
      <div className="page narrow">
        <PageTitle title={t("profile")} />
        <Empty
          title={t("loginTitle")}
          text={t("loginText")}
          action={
            <button className="primary" onClick={() => setLoginOpen(true)}>
              {t("sharePhone")}
            </button>
          }
        />
      </div>
    );
  return (
    <div className="page narrow">
      <PageTitle title={t("account")} subtitle={t("accountSub")} />
      <div className="profile-layout">
        <section className="panel">
          <div className="profile-avatar-row">
            <div className="avatar">
              {user.avatar ? (
                <img src={user.avatar} alt={user.name} />
              ) : (
                user.name.slice(0, 1)
              )}
              <label className="avatar-upload" aria-label={t("photo")}>
                <Camera size={16} />
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void run(() => upload(file));
                    e.target.value = "";
                  }}
                />
              </label>
            </div>
            <div>
              <h2>{user.name}</h2>
              <p className="small muted">{t("photoHint")}</p>
            </div>
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                await updateUser({
                  name,
                  ...(!user.telegramId ? { phone } : {}),
                });
                notify(t("saved"));
              });
            }}
          >
            <h3>{t("personal")}</h3>
            <div className="fields">
              <Field label={t("name")}>
                <input
                  required
                  maxLength={80}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </Field>
              <Field label={t("phone")}>
                <input
                  required
                  type="tel"
                  pattern="\+998[0-9]{9}"
                  readOnly={!!user.telegramId}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </Field>
            </div>
            {user.telegramId && (
              <p className="small muted">{t("phoneTelegram")}</p>
            )}
            <button disabled={busy} className="primary" type="submit">
              {t("save")}
              <Check size={16} />
            </button>
          </form>
        </section>
        <div className="form-sections">
          <section className="panel preferences">
            <h3>{t("language")}</h3>
            <div className="segmented">
              {(
                [
                  { id: "ru", name: "Русский" },
                  { id: "uz", name: "O‘zbekcha" },
                  { id: "en", name: "English" },
                ] as const
              ).map((l) => (
                <button
                  className={lang === l.id ? "selected" : ""}
                  key={l.id}
                  onClick={() => setLanguage(l.id)}
                >
                  {l.name}
                </button>
              ))}
            </div>
            <h3>{t("theme")}</h3>
            <div className="theme-options">
              {(
                [
                  { id: "light", icon: Sun },
                  { id: "dark", icon: Moon },
                  { id: "system", icon: Monitor },
                ] as const
              ).map(({ id, icon: Icon }) => (
                <button
                  className={user.theme === id ? "selected" : ""}
                  key={id}
                  onClick={() => void run(() => updateUser({ theme: id }))}
                >
                  <Icon size={20} />
                  {t(id)}
                </button>
              ))}
            </div>
          </section>
          <section className="panel">
            <div className="panel-heading">
              <h3>{t("addresses")}</h3>
              <button
                className="icon-button"
                aria-label={t("addAddress")}
                onClick={() => setAddressOpen(true)}
              >
                <Plus size={21} />
              </button>
            </div>
            {!user.addresses.length ? (
              <p className="muted">{t("noAddresses")}</p>
            ) : (
              user.addresses.map((a) => (
                <div className="saved-address" key={a.id}>
                  <button
                    onClick={() =>
                      void run(() => updateUser({ selectedAddress: a.id }))
                    }
                  >
                    <MapPin size={19} />
                    <span>
                      <b>{a.label}</b>
                      <small>{a.street}</small>
                    </span>
                    {user.selectedAddress === a.id && <Check size={17} />}
                  </button>
                  <button
                    className="icon-button"
                    aria-label={t("remove") + " " + a.label}
                    onClick={() => setDeleteId(a.id)}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))
            )}
          </section>
          <section className="panel">
            <h3>{t("myPromos")}</h3>
            {config.promos.length ? (
              config.promos.map((p) => (
                <div className="promo-ticket" key={p.code}>
                  <span>−{p.percent}%</span>
                  <div>
                    <b>{p.code}</b>
                    <small>{config.demo ? t("demo") : t("offer")}</small>
                  </div>
                  <button
                    className="icon-button"
                    aria-label={t("copy")}
                    onClick={() =>
                      void run(async () => {
                        await navigator.clipboard.writeText(p.code);
                        notify(t("copied"));
                      })
                    }
                  >
                    <Copy size={17} />
                  </button>
                </div>
              ))
            ) : (
              <p className="muted">{t("noPromos")}</p>
            )}
          </section>
        </div>
      </div>
      <Modal
        open={!!deleteId}
        onClose={() => setDeleteId("")}
        title={t("addressDelete")}
      >
        <div className="modal-actions">
          <button className="secondary" onClick={() => setDeleteId("")}>
            {t("cancel")}
          </button>
          <button
            className="primary"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                await updateUser({
                  addresses: user.addresses.filter((a) => a.id !== deleteId),
                });
                setDeleteId("");
              })
            }
          >
            {t("remove")}
          </button>
        </div>
      </Modal>
    </div>
  );
}
let mapsPromise: Promise<void> | null = null;
function loadMaps(key: string) {
  if (window.ymaps) return new Promise<void>((r) => window.ymaps.ready(r));
  if (!mapsPromise)
    mapsPromise = new Promise<void>((resolve, reject) => {
      const script = document.createElement("script");
      script.src = `https://api-maps.yandex.ru/2.1/?apikey=${encodeURIComponent(key)}&lang=ru_RU`;
      script.onload = () => {
        if (window.ymaps) window.ymaps.ready(resolve);
        else reject(new Error("MAPS"));
      };
      script.onerror = reject;
      document.head.append(script);
    }).catch((e) => {
      mapsPromise = null;
      throw e;
    });
  return mapsPromise;
}
export function AddressModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { t, user, config, lang, updateUser, run, notify, busy } = useStore();
  const [label, setLabel] = useState(""),
    [street, setStreet] = useState(""),
    [lat, setLat] = useState(""),
    [lon, setLon] = useState(""),
    [apartment, setApartment] = useState(""),
    [entrance, setEntrance] = useState(""),
    [floor, setFloor] = useState(""),
    [comment, setComment] = useState(""),
    [mapFailed, setMapFailed] = useState(false),
    [mapReady, setMapReady] = useState(false),
    [geoBusy, setGeoBusy] = useState(false);
  const mapEl = useRef<HTMLDivElement>(null),
    map = useRef<any>(null),
    pin = useRef<any>(null);
  const generation = useRef(0);
  const pick = async (coords: number[], geocode = true) => {
    setLat(String(coords[0]));
    setLon(String(coords[1]));
    if (map.current) {
      pin.current?.geometry.setCoordinates(coords);
      map.current.panTo(coords);
    }
    if (geocode && window.ymaps) {
      try {
        const result = await window.ymaps.geocode(coords);
        const object = result.geoObjects.get(0);
        if (object) setStreet(object.getAddressLine());
      } catch {
        notify(t("mapFailed"));
      }
    }
  };
  useEffect(() => {
    if (!open) return;
    setLabel(t("home"));
    setStreet("");
    setLat("");
    setLon("");
    setApartment("");
    setEntrance("");
    setFloor("");
    setComment("");
    setMapFailed(false);
    setMapReady(false);
    const g = ++generation.current;
    let timeout: ReturnType<typeof setTimeout>;
    if (config.mapsKey) {
      timeout = setTimeout(() => setMapFailed(true), 12000);
      void loadMaps(config.mapsKey)
        .then(() => {
          if (g !== generation.current || !mapEl.current) return;
          clearTimeout(timeout);
          const center = [config.cafe.lat, config.cafe.lon];
          const m = new window.ymaps.Map(mapEl.current, {
            center,
            zoom: 14,
            controls: ["zoomControl"],
          });
          map.current = m;
          pin.current = new window.ymaps.Placemark(
            center,
            {},
            { preset: "islands#oliveDotIcon" },
          );
          m.geoObjects.add(
            new window.ymaps.Circle(
              [center, config.settings.radius * 1000],
              {},
              {
                fillColor: "#74826718",
                strokeColor: "#748267",
                strokeWidth: 1,
              },
            ),
          );
          m.geoObjects.add(pin.current);
          m.events.add("click", (e: any) => void pick(e.get("coords")));
          setMapReady(true);
          setMapFailed(false);
        })
        .catch(() => setMapFailed(true));
    }
    return () => {
      generation.current++;
      clearTimeout(timeout);
      map.current?.destroy();
      map.current = null;
      pin.current = null;
    };
  }, [open, config.mapsKey]);
  const search = () => {
    if (!window.ymaps) return;
    setGeoBusy(true);
    void window.ymaps
      .geocode("Ташкент, " + street, { results: 1 })
      .then((r: any) => {
        const obj = r.geoObjects.get(0);
        if (obj) {
          setStreet(obj.getAddressLine());
          void pick(obj.geometry.getCoordinates(), false);
        } else notify(t("emptySearch"));
      })
      .catch(() => notify(t("mapFailed")))
      .finally(() => setGeoBusy(false));
  };
  const locate = () => {
    if (!navigator.geolocation) {
      notify(t("mapFailed"));
      return;
    }
    setGeoBusy(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        void pick([p.coords.latitude, p.coords.longitude]);
        setGeoBusy(false);
      },
      () => {
        setGeoBusy(false);
        notify(t("mapFailed"));
      },
      { timeout: 10000, enableHighAccuracy: true },
    );
  };
  const save = () =>
    void run(async () => {
      if (!user) return;
      const address: Address = {
        id: crypto.randomUUID(),
        label,
        street,
        lat: Number(lat),
        lon: Number(lon),
        apartment,
        entrance,
        floor,
        comment,
      };
      await updateUser({
        addresses: [...user.addresses, address],
        selectedAddress: address.id,
      });
      notify(t("addressSaved"));
      onClose();
    });
  return (
    <Modal open={open} onClose={onClose} title={t("addressTitle")} wide>
      <div className="address-content">
        {user && user.addresses.length > 0 && (
          <div className="address-choices">
            {user.addresses.map((a) => (
              <button
                className={
                  "saved-choice " +
                  (user.selectedAddress === a.id ? "selected" : "")
                }
                key={a.id}
                onClick={() =>
                  void run(async () => {
                    await updateUser({ selectedAddress: a.id });
                    onClose();
                  })
                }
              >
                <MapPin size={19} />
                <span>
                  <b>{a.label}</b>
                  <small>{a.street}</small>
                </span>
                {user.selectedAddress === a.id ? (
                  <Check size={17} />
                ) : (
                  <ChevronRight size={17} />
                )}
              </button>
            ))}
          </div>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <div className="map-frame">
            {config.mapsKey ? (
              <>
                <div ref={mapEl} className="yandex-map" />
                {!mapReady && (
                  <p className="map-status">
                    {t(mapFailed ? "mapFailed" : "loading")}
                  </p>
                )}
              </>
            ) : (
              <div className="map-fallback">
                <MapPin size={32} strokeWidth={1.2} />
                <p>{t("mapUnavailable")}</p>
                <a
                  href="https://yandex.uz/maps/org/rassvet/13907443903/"
                  target="_blank"
                  rel="noreferrer"
                >
                  {t("openYandex")}
                  <ArrowUpRight size={15} />
                </a>
              </div>
            )}
          </div>
          {mapReady && <p className="small muted">{t("mapHint")}</p>}
          <div className="address-tools">
            <button
              type="button"
              className="text-button"
              disabled={geoBusy}
              onClick={locate}
            >
              <LocateFixed size={16} />
              {t("location")}
            </button>
            {config.demo && (
              <button
                type="button"
                className="text-button"
                onClick={() => {
                  setLabel(t("testAddress"));
                  setStreet("Ташкент, Чимкент, 20 (демо)");
                  void pick([41.3061, 69.2729], false);
                }}
              >
                {t("demoAddress")}
              </button>
            )}
          </div>
          <div className="fields">
            <Field label={t("addressLabel")}>
              <input
                required
                maxLength={40}
                value={label}
                onChange={(e) => setLabel(e.target.value)}
              />
            </Field>
            <Field label={t("street")}>
              <div className="input-action">
                <input
                  required
                  minLength={5}
                  maxLength={250}
                  value={street}
                  onChange={(e) => {
                    setStreet(e.target.value);
                    setLat("");
                    setLon("");
                  }}
                  placeholder="Ташкент, …"
                />
                {mapReady && (
                  <button
                    type="button"
                    disabled={geoBusy || !street}
                    onClick={search}
                    aria-label={t("searchMap")}
                  >
                    <Search size={19} />
                  </button>
                )}
              </div>
            </Field>
            <div className="fields two">
              <Field label={t("lat")}>
                <input
                  required
                  type="number"
                  step="any"
                  min="-90"
                  max="90"
                  value={lat}
                  onChange={(e) => setLat(e.target.value)}
                  placeholder="41.305414"
                />
              </Field>
              <Field label={t("lon")}>
                <input
                  required
                  type="number"
                  step="any"
                  min="-180"
                  max="180"
                  value={lon}
                  onChange={(e) => setLon(e.target.value)}
                  placeholder="69.272900"
                />
              </Field>
            </div>
            <p className="small muted coordinate-hint">
              {t("coordinatesHint")}
            </p>
            <div className="fields three">
              <Field label={t("apartment")}>
                <input
                  maxLength={30}
                  value={apartment}
                  onChange={(e) => setApartment(e.target.value)}
                />
              </Field>
              <Field label={t("entrance")}>
                <input
                  maxLength={30}
                  value={entrance}
                  onChange={(e) => setEntrance(e.target.value)}
                />
              </Field>
              <Field label={t("floor")}>
                <input
                  maxLength={20}
                  value={floor}
                  onChange={(e) => setFloor(e.target.value)}
                />
              </Field>
            </div>
            <Field label={t("addressComment")}>
              <input
                maxLength={500}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
              />
            </Field>
          </div>
          <button
            disabled={busy || !user}
            className="primary full"
            type="submit"
          >
            {t("save")}
            <Check size={17} />
          </button>
        </form>
      </div>
    </Modal>
  );
}
