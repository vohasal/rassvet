import { createContext, useContext, useEffect, type ReactNode } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X, Minus, Plus, Bird } from "lucide-react";
import type { CartItem, Config, Lang, Order, Product, User } from "./types";
import type { TextKey } from "./i18n";
export async function api<T>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const response = await fetch("/api" + path, {
    method,
    credentials: "same-origin",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "SERVER_ERROR");
  return data;
}
export function readLocal<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v ? JSON.parse(v) : fallback;
  } catch {
    return fallback;
  }
}
export function writeLocal(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* Private browsing can block storage. */
  }
}
export function navigate(route: string) {
  window.location.hash = route;
  window.scrollTo({ top: 0, behavior: "instant" });
}
export function useRoute() {
  return window.location.hash.slice(1) || "menu";
}
export type Store = {
  products: Product[];
  config: Config;
  user: User | null;
  lang: Lang;
  t: (key: TextKey) => string;
  cart: CartItem[];
  orders: Order[];
  cacheOrder: (order: Order) => void;
  reload: () => Promise<void>;
  refreshUser: () => Promise<User | null>;
  setCart: (v: CartItem[]) => void;
  updateUser: (v: Partial<User>) => Promise<void>;
  setLanguage: (l: Lang) => void;
  notify: (s: string) => void;
  run: (fn: () => Promise<void>) => Promise<void>;
  add: (p: Product, milk?: string) => void;
  setProduct: (p: Product | null) => void;
  setAddressOpen: (b: boolean) => void;
  setLoginOpen: (b: boolean) => void;
  setPayment: (o: Order | null) => void;
  fulfillment: "delivery" | "pickup";
  setFulfillment: (s: "delivery" | "pickup") => void;
  busy: boolean;
};
export const Context = createContext<Store | null>(null);
export function useStore() {
  return useContext(Context)!;
}
export function Modal({
  open,
  onClose,
  title,
  children,
  wide = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  wide?: boolean;
}) {
  const { t } = useStore();
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="modal-overlay" />
        <Dialog.Content
          className={"modal " + (wide ? "wide" : "")}
          aria-describedby={undefined}
        >
          <div className="modal-head">
            <Dialog.Title>{title}</Dialog.Title>
            <Dialog.Close className="icon-button" aria-label={t("cancel")}>
              <X size={22} />
            </Dialog.Close>
          </div>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
export function Quantity({
  value,
  onChange,
}: {
  value: number;
  onChange: (n: number) => void;
}) {
  const { t } = useStore();
  return (
    <div className="quantity">
      <button
        type="button"
        aria-label={t("remove")}
        onClick={() => onChange(value - 1)}
      >
        <Minus size={15} />
      </button>
      <span aria-label={t("quantity")}>{value}</span>
      <button
        type="button"
        disabled={value >= 50}
        aria-label={t("add")}
        onClick={() => onChange(value + 1)}
      >
        <Plus size={15} />
      </button>
    </div>
  );
}
export function Empty({
  title,
  text,
  action,
}: {
  title: string;
  text?: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <span className="empty-bird">
        <Bird size={50} strokeWidth={1} />
      </span>
      <h2>{title}</h2>
      {text && <p>{text}</p>}
      {action}
    </div>
  );
}
export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}
export function useEscapeBack(onBack: () => void) {
  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    if (!tg) return;
    tg.BackButton.show();
    tg.BackButton.onClick(onBack);
    return () => {
      tg.BackButton.offClick(onBack);
      tg.BackButton.hide();
    };
  }, [onBack]);
}
export function sizeLabel(size: string, t: (key: TextKey) => string) {
  return size === "1 шт."
    ? t("piece")
    : size === "1 порция"
      ? t("portion")
      : size.replace("мл", "ml");
}
