export type Lang = "ru" | "en" | "uz";
export type Localized = Record<Lang, string>;
export type Product = {
  id: string;
  name: Localized;
  category: string;
  price: number;
  image: string;
  size: string;
  available: boolean;
  options: boolean;
  featured: boolean;
};
export type CartItem = { productId: string; quantity: number; milk: string };
export type Address = {
  id: string;
  label: string;
  street: string;
  lat: number;
  lon: number;
  apartment: string;
  entrance: string;
  floor: string;
  comment: string;
};
export type User = {
  id: string;
  name: string;
  phone: string;
  avatar: string;
  language: Lang;
  theme: "light" | "dark" | "system";
  addresses: Address[];
  selectedAddress: string;
  telegramId?: number;
};
export type Settings = {
  minimum: number;
  deliveryFee: number;
  radius: number;
  openHour: number;
  closeHour: number;
  bypassHours: boolean;
};
export type Promo = { code: string; percent: number; active: boolean };
export type Story = {
  id: string;
  title: Localized;
  text: Localized;
  type: "offer" | "event";
  active: boolean;
};
export type Config = {
  demo: boolean;
  mapsKey: string;
  cafe: { lat: number; lon: number; address: string; phone: string };
  settings: Settings;
  promos: Promo[];
  stories: Story[];
  open: boolean;
};
export type Status =
  | "awaiting_payment"
  | "accepted"
  | "preparing"
  | "ready"
  | "delivering"
  | "completed"
  | "cancelled";
export type Order = {
  id: string;
  number: number;
  userId: string;
  name: string;
  phone: string;
  items: (CartItem & { name: Localized; unitPrice: number; image: string })[];
  subtotal: number;
  discount: number;
  deliveryFee: number;
  total: number;
  promo: string;
  method: "cash" | "click" | "payme";
  fulfillment: "pickup" | "delivery";
  address: Address | null;
  comment: string;
  status: Status;
  payment: "pending" | "paid" | "failed" | "cash" | "refunded";
  history: { status: Status; at: string }[];
  createdAt: string;
  demo: boolean;
  courierNote: string;
};
