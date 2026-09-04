import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  LayoutDashboard, ShoppingCart, UtensilsCrossed, Tag, SlidersHorizontal,
  TrendingUp, Users, Percent, Monitor, ChefHat, Table2,
  Settings, BarChart3, LogOut, ChevronDown, ChevronRight, Sun, Moon,
  ShoppingBag, Package, Building2, Receipt, MessageSquare, Send,
} from "lucide-react";
import { useTheme } from "../../lib/useTheme";
import { api } from "../../lib/api";
import { getBranchId } from "../../lib/store";

const GOLD = "var(--color-gold)";
const SURF = "var(--color-surface)";
const BORD = "var(--color-border)";
const MUTED = "var(--color-text-muted)";
const DIM = "var(--color-text-dim)";

type NavLeaf = { path: string; label: string; icon: any };
type NavSection = { id: string; label: string; icon: any } & (
  | { type: "link"; path: string }
  | { type: "group"; items: NavLeaf[] }
);

const NAV: NavSection[] = [
  { id: "dashboard", type: "link", label: "Dashboard", icon: LayoutDashboard, path: "/home" },
  { id: "pos", type: "link", label: "POS", icon: ShoppingCart, path: "/pos" },
  {
    id: "item", type: "group", label: "Item", icon: UtensilsCrossed,
    items: [
      { path: "/products",   label: "List Item",     icon: UtensilsCrossed },
      { path: "/categories", label: "List Category",  icon: Tag },
      { path: "/modifiers",  label: "List Modifiers", icon: SlidersHorizontal },
      { path: "/combo-promo", label: "Combo & Promo", icon: Package },
    ],
  },
  {
    id: "sales", type: "group", label: "Sales", icon: TrendingUp,
    items: [
      { path: "/sales",       label: "List of Sales", icon: TrendingUp },
      { path: "/promotions",  label: "Promotions",    icon: Percent },
    ],
  },
  {
    id: "panel", type: "group", label: "Panel", icon: Monitor,
    items: [
      { path: "/pos",      label: "POS",             icon: ShoppingCart },
      { path: "/kds",      label: "Kitchen Display", icon: ChefHat },
      { path: "/tables",   label: "Tables",          icon: Table2 },
    ],
  },
  {
    id: "purchases", type: "group", label: "Purchases", icon: ShoppingBag,
    items: [
      { path: "/purchases",          label: "List of Purchases", icon: ShoppingBag },
      { path: "/purchases/items",    label: "Purchase Items",    icon: Package },
      { path: "/purchases/suppliers", label: "Suppliers",        icon: Building2 },
    ],
  },
  { id: "expenses", type: "link", label: "Expenses", icon: Receipt, path: "/expenses" },
  {
    id: "messaging", type: "group", label: "Message Platform", icon: MessageSquare,
    items: [
      { path: "/customers",        label: "Customers",     icon: Users },
      { path: "/message-platform", label: "Send Messages", icon: Send },
      { path: "/message-platform/settings", label: "Message Settings", icon: Settings },
    ],
  },
  {
    id: "users", type: "group", label: "Users", icon: Users,
    items: [
      { path: "/users", label: "List Users", icon: Users },
    ],
  },
  { id: "settings", type: "link", label: "Settings", icon: Settings, path: "/settings" },
  {
    id: "reports", type: "group", label: "Reports", icon: BarChart3,
    items: [
      { path: "/reports/sales",     label: "Sales Performance",  icon: TrendingUp },
      { path: "/reports/menu",      label: "Menu Performance",   icon: UtensilsCrossed },
      { path: "/reports/inventory", label: "Inventory & Stock",  icon: SlidersHorizontal },
      { path: "/reports/pl",        label: "Profit & Loss",      icon: BarChart3 },
      { path: "/reports/staff",     label: "Staff Performance",  icon: Users },
      { path: "/reports/customers", label: "Customer Analytics", icon: ChefHat },
    ],
  },
];

export function Sidebar() {
  const [location, navigate] = useLocation();
  const { isDark, toggle: toggleTheme } = useTheme();
  const branchId = getBranchId();

  // Only collapsible groups need open state; default all open
  const [open, setOpen] = useState<Record<string, boolean>>({
    item: true, sales: false, panel: false, purchases: true, users: true, reports: true, messaging: true,
  });

  const { data: branchData } = useQuery({
    queryKey: ["branches", branchId],
    queryFn: async () => (await api.branches[":id"].$get({ param: { id: String(branchId) } })).json(),
    staleTime: 60_000,
  });

  const { data: settingsData } = useQuery({
    queryKey: ["settings", branchId],
    queryFn: async () => (await api.settings.$get({ query: { branchId: String(branchId) } })).json(),
    staleTime: 60_000,
  });

  const settingsMap: Record<string, string> = (settingsData as any)?.settings || {};
  // "Restaurant Name" in General Settings saves to settings.restaurantName — prefer that
  // over the branch record's name so renaming in Settings reflects immediately here.
  const branchName: string = settingsMap.restaurantName || (branchData as any)?.branch?.name || "iDine";
  const outletLogo: string | undefined = settingsMap.outletLogo || settingsMap.invoiceLogo;

  function toggle(id: string) {
    setOpen(prev => ({ ...prev, [id]: !prev[id] }));
  }

  function isActive(path: string) {
    if (path === "/home") return location === "/home";
    return location === path || location.startsWith(path + "/");
  }

  function groupHasActive(items: NavLeaf[]) {
    return items.some(i => isActive(i.path));
  }

  return (
    <div className="w-56 flex flex-col h-full border-r shrink-0" style={{ background: SURF, borderColor: BORD }}>
      {/* Logo */}
      <div className="p-4 border-b shrink-0" style={{ borderColor: BORD }}>
        <div className="flex items-center gap-2.5">
          {outletLogo ? (
            <img src={outletLogo} alt={branchName} className="w-9 h-9 rounded-xl shrink-0 object-contain" />
          ) : (
            <img src="/logo-icon.png" alt="iDine" className="w-9 h-9 rounded-xl shrink-0 object-contain" />
          )}
          <div>
            <div className="font-bold text-sm" style={{ color: GOLD }}>{branchName}</div>
            <div className="text-[10px]" style={{ color: MUTED }}>Restaurant POS</div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-2">
        {NAV.map(section => {
          if (section.type === "link") {
            const active = isActive(section.path);
            return (
              <button
                key={section.id}
                onClick={() => navigate(section.path)}
                className="w-full flex items-center gap-2.5 px-4 py-2.5 text-xs font-semibold transition-all text-left"
                style={{
                  background: active ? GOLD + "22" : "transparent",
                  color: active ? GOLD : MUTED,
                  borderLeft: active ? `2px solid ${GOLD}` : "2px solid transparent",
                }}
              >
                <section.icon size={14} />
                {section.label}
              </button>
            );
          }

          // group
          const isOpen = open[section.id] ?? false;
          const hasActive = groupHasActive(section.items);

          return (
            <div key={section.id}>
              <button
                onClick={() => toggle(section.id)}
                className="w-full flex items-center justify-between px-4 py-2.5 text-xs font-semibold transition-all"
                style={{
                  color: hasActive ? GOLD : MUTED,
                  background: hasActive && !isOpen ? GOLD + "11" : "transparent",
                }}
              >
                <div className="flex items-center gap-2">
                  <section.icon size={14} />
                  {section.label}
                </div>
                {isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              </button>

              {isOpen && (
                <div className="pb-1">
                  {section.items.map(item => {
                    const active = isActive(item.path);
                    return (
                      <button
                        key={item.path + item.label}
                        onClick={() => navigate(item.path)}
                        className="w-full flex items-center gap-2.5 pl-8 pr-3 py-2 text-xs font-medium transition-all text-left"
                        style={{
                          background: active ? GOLD + "22" : "transparent",
                          color: active ? GOLD : DIM,
                          borderLeft: active ? `2px solid ${GOLD}` : "2px solid transparent",
                        }}
                      >
                        <item.icon size={12} />
                        {item.label}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="p-2 border-t shrink-0" style={{ borderColor: BORD }}>
        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-medium mb-1 transition-all"
          style={{ color: MUTED, background: "transparent" }}
          onMouseEnter={e => (e.currentTarget.style.background = BORD + "88")}
          onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
        >
          {isDark ? <Sun size={14} /> : <Moon size={14} />}
          {isDark ? "Light Mode" : "Dark Mode"}
        </button>
        <button
          onClick={() => navigate("/")}
          className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-medium"
          style={{ color: "var(--color-danger)" }}
        >
          <LogOut size={14} />
          Logout
        </button>
      </div>
    </div>
  );
}
