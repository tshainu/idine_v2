export const FEATURE_PRIVILEGES = [
  "Dashboard", "POS", "Waiter App", "KDS", "Admin", "Menu Items", "Categories", "Modifiers", "Ingredients", "Combo & Promo",
  "Sales", "Customers", "Reports", "Sales Reports", "Menu Reports", "Inventory Reports", "Profit & Loss Reports", "Staff Reports", "Customer Reports",
  "Settings", "Users", "Kitchen", "Tables", "Expenses", "Purchases", "Purchase Items", "Suppliers", "Promotions", "Message Platform", "Message Settings",
  "Customer Display", "Public Menu", "IDSA",
  "Print Bill", "Print Invoice", "Print KOT", "Cancel Order", "Apply Discount", "Apply Coupon", "Void Item", "Refund Order",
  "Change Order Type", "Change Table", "Assign Waiter", "Edit Placed Order", "Quick Add Item",
] as const;

export type FeaturePrivilege = typeof FEATURE_PRIVILEGES[number];

export const DEFAULT_ROLE_PRIVILEGES: Record<string, Record<string, boolean>> = {
  superadmin: Object.fromEntries(FEATURE_PRIVILEGES.map(key => [key, true])),
  admin: Object.fromEntries(FEATURE_PRIVILEGES.map(key => [key, true])),
  manager: Object.fromEntries(FEATURE_PRIVILEGES.map(key => [key, !["Settings", "Users", "Refund Order", "Void Item", "IDSA"].includes(key)])),
  waiter: Object.fromEntries(FEATURE_PRIVILEGES.map(key => [key, ["POS", "Waiter App", "Kitchen", "Tables", "Print Bill", "Print KOT", "Change Table", "Quick Add Item"].includes(key)])),
  cashier: Object.fromEntries(FEATURE_PRIVILEGES.map(key => [key, ["POS", "Sales", "Customers", "Print Bill", "Print Invoice", "Apply Discount", "Cancel Order", "Edit Placed Order"].includes(key)])),
  kitchen: Object.fromEntries(FEATURE_PRIVILEGES.map(key => [key, ["KDS", "Kitchen"].includes(key)])),
  kds: Object.fromEntries(FEATURE_PRIVILEGES.map(key => [key, ["KDS", "Kitchen"].includes(key)])),
};

export type SavedPrivileges = Record<string, Record<string, boolean>>;

export function parsePrivileges(value: unknown): SavedPrivileges {
  if (!value || typeof value !== "string") return {};
  try { return JSON.parse(value) as SavedPrivileges; } catch { return {}; }
}

export function hasPrivilege(role: string | null | undefined, privilege: string, saved: SavedPrivileges): boolean {
  const normalized = String(role || "").toLowerCase();
  if (normalized === "superadmin") return true;
  if (saved[normalized] && Object.prototype.hasOwnProperty.call(saved[normalized], privilege)) return saved[normalized][privilege] === true;
  return DEFAULT_ROLE_PRIVILEGES[normalized]?.[privilege] === true;
}

export const ROUTE_PRIVILEGE: Record<string, FeaturePrivilege> = {
  "/home": "Dashboard", "/pos": "POS", "/kds": "KDS", "/admin": "Admin", "/sales": "Sales", "/discounts": "Sales", "/purchase": "Purchases",
  "/purchases": "Purchases", "/purchases/items": "Purchase Items", "/purchases/suppliers": "Suppliers", "/products": "Menu Items",
  "/combo-promo": "Combo & Promo", "/expenses": "Expenses", "/reports": "Reports", "/reports/sales": "Sales Reports", "/reports/menu": "Menu Reports",
  "/reports/inventory": "Inventory Reports", "/reports/pl": "Profit & Loss Reports", "/reports/staff": "Staff Reports", "/reports/customers": "Customer Reports",
  "/kitchen": "Kitchen", "/settings": "Settings", "/users": "Users", "/customers": "Customers", "/message-platform": "Message Platform",
  "/message-platform/settings": "Message Settings", "/tables": "Tables", "/categories": "Categories", "/ingredients": "Ingredients", "/modifiers": "Modifiers",
  "/promotions": "Promotions", "/customer-display": "Customer Display", "/menu": "Public Menu", "/idsa": "IDSA",
};

export function privilegeForPath(path: string): FeaturePrivilege | null {
  const exact = ROUTE_PRIVILEGE[path];
  if (exact) return exact;
  const key = Object.keys(ROUTE_PRIVILEGE).filter(k => path.startsWith(`${k}/`)).sort((a, b) => b.length - a.length)[0];
  return key ? ROUTE_PRIVILEGE[key] : null;
}
