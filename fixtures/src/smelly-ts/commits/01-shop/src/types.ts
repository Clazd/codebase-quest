export type Tier = "guest" | "member" | "vip";

export interface CartItem {
  sku: string;
  unitPrice: number;
  quantity: number;
  clearance: boolean;
}

export interface Customer {
  id: string;
  tier: Tier;
  birthday: string;
}

export interface Coupon {
  code: string;
  percentOff: number;
  expired: boolean;
}

export interface Address {
  name: string;
  country: string;
  region: string;
  lines: string[];
}

export interface Order {
  id: string;
  customerId: string;
  month: string;
  items: CartItem[];
  subtotal: number;
  coupon: Coupon | null;
  giftWrap: boolean;
  express: boolean;
  notes: string[];
}
