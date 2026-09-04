// Shapes returned by the iDine v2 REST API, narrowed to what the waiter app uses.

export type Table = {
  id: number;
  branchId: number | null;
  name: string;
  capacity: number | null;
  status: string;          // available | occupied | billed | reserved
  zone: string | null;
  isActive: boolean;
};

export type Category = {
  id: number;
  branchId: number | null;
  name: string;
  sortOrder: number;
  isActive: boolean;
};

export type MenuItem = {
  id: number;
  branchId: number | null;
  categoryId: number | null;
  printerId: number | null;
  name: string;
  code: string | null;
  price: number;
  priceDineIn: number;
  priceTakeaway: number;
  priceDelivery: number;
  description: string | null;
  imageUrl: string | null;
  isVeg: boolean;
  isBeverage: boolean;
  isPromo: boolean;
  isCombo: boolean;
  isActive: boolean;
  sortOrder: number;
  // /menu-items embeds each item's variations, so there is no separate fetch.
  variations?: Variation[];
};

export type Variation = {
  id: number;
  menuItemId: number;
  name: string;
  code: string | null;
  priceDineIn: number;
  priceTakeaway: number;
  priceDelivery: number;
  isActive: boolean;
};

export type Modifier = {
  id: number;
  branchId: number | null;
  name: string;
  groupName: string;
  price: number;
  isActive: boolean;
};

export type OrderItem = {
  id: number;
  orderId: number | null;
  menuItemId: number | null;
  name: string;
  price: number;
  qty: number;
  printerId: number | null;
  total: number;
  kotPrinted: boolean;
  note: string | null;
  createdAt: number | null;
};

export type Order = {
  id: number;
  branchId: number | null;
  orderNumber: string;
  type: string;            // dine-in | takeaway | delivery
  status: string;          // pending | confirmed | served | ready | paid | completed | cancelled | hold
  tableId: number | null;
  waiterId: number | null;
  customerId: number | null;
  customerName: string | null;
  notes: string | null;
  placedBy: string | null;
  subtotal: number;
  discount: number;
  serviceCharge: number;
  tipAmount: number;
  total: number;
  paymentMethod: string | null;
  amountPaid: number;
  kotPrinted: boolean;
  source: string;
  createdAt: number | null;
  updatedAt: number | null;
  items?: OrderItem[];
};

export type Customer = {
  id: number;
  branchId: number | null;
  name: string;
  phone: string | null;
  email: string | null;
  loyaltyPoints: number;
  tags: string | null;
  notes: string | null;
};

export type Shift = {
  id: number;
  branchId: number | null;
  userId: number | null;
  userName: string | null;
  clockIn: number | null;
  clockOut: number | null;
  device: string | null;
};

// A line in the waiter's cart before it becomes an order item.
export type CartLine = {
  key: string;             // menuItemId + variation + modifiers, so identical lines merge
  menuItemId: number;
  name: string;            // display name incl. variation, e.g. "Chicken Biryani (Full)"
  unitPrice: number;
  qty: number;
  printerId: number | null;
  variationName: string | null;
  modifiers: { id: number; name: string; price: number }[];
  note: string;
  course: "starter" | "main" | "dessert" | "drinks";
};
