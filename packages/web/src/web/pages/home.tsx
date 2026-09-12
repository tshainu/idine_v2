import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { api } from "../lib/api";
import { getBranchId } from "../lib/store";
import { Sidebar } from "../components/layout/sidebar";
import { Utensils, Package, Coffee, ShoppingCart } from "lucide-react";

const GOLD = "var(--color-gold)";
const BG = "var(--color-bg)";
const SURF = "var(--color-surface)";
const BORD = "var(--color-border)";
const MUTED = "var(--color-text-muted)";
const DIM = "var(--color-text-dim)";
const TEXT = "var(--color-text)";

const CARD_GRADIENTS = [
  "linear-gradient(135deg,#22C55E,#06B6D4)", "linear-gradient(135deg,#A855F7,#EC4899)",
  "linear-gradient(135deg,#F59E0B,#EF4444)", "linear-gradient(135deg,#3B82F6,#8B5CF6)",
  "linear-gradient(135deg,#14B8A6,#84CC16)", "linear-gradient(135deg,#F97316,#EAB308)",
];

function StatCard({ label, value, sub, imgSrc, index }: { label: string; value: string | number; sub?: string; imgSrc: string; index: number }) {
  return (
    <div className="rounded-2xl p-[1px]" style={{ background: CARD_GRADIENTS[index % CARD_GRADIENTS.length] }}>
      <div className="rounded-[15px] p-5 flex items-start gap-4 h-full" style={{ background: SURF }}>
        <img src={imgSrc} alt="" className="w-12 h-12 object-contain shrink-0" />
        <div>
          <div className="text-2xl font-bold" style={{ color: TEXT }}>{value}</div>
          <div className="text-sm font-medium mt-0.5" style={{ color: MUTED }}>{label}</div>
          {sub && <div className="text-xs mt-1" style={{ color: DIM }}>{sub}</div>}
        </div>
      </div>
    </div>
  );
}

function MiniBar({ pct, color }: { pct: number; color: string }) {
  return (
    <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: BORD }}>
      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}

export default function HomePage() {
  const branchId = getBranchId();
  const [, navigate] = useLocation();

  const { data: ordersData } = useQuery({
    queryKey: ["home-orders", branchId],
    queryFn: async () => (await api.orders.$get({ query: { branchId: String(branchId) } })).json(),
    refetchInterval: 30000,
  });
  const { data: menuData } = useQuery({
    queryKey: ["home-menu", branchId],
    queryFn: async () => (await api["menu-items"].$get({ query: { branchId: String(branchId) } })).json(),
  });

  const orders: any[] = (ordersData as any)?.orders || [];
  const menuItems: any[] = (menuData as any)?.menuItems || [];

  const today = new Date().toDateString();
  const todayOrders = orders.filter((o: any) => new Date(o.createdAt).toDateString() === today);
  const todayRevenue = todayOrders.reduce((s: number, o: any) => s + (Number(o.total) || 0), 0);

  // 40% margin fallback for profit
  const profitToday = todayRevenue * 0.4;

  // Active tables: orders with status "open" that have a tableId
  const activeTables = orders.filter((o: any) => o.status === "open" && o.tableId).length;

  // Pending kitchen: open or confirmed
  const pendingKitchen = orders.filter((o: any) => o.status === "open" || o.status === "confirmed").length;

  // Top selling item today
  const todayItemMap: Record<string, { name: string; qty: number }> = {};
  todayOrders.forEach((o: any) => {
    (o.items || []).forEach((it: any) => {
      const key = it.menuItemId || it.name;
      if (!todayItemMap[key]) todayItemMap[key] = { name: it.name || `Item #${key}`, qty: 0 };
      todayItemMap[key].qty += it.quantity || 1;
    });
  });
  const topSellingArr = Object.values(todayItemMap).sort((a, b) => b.qty - a.qty);
  const topSellingItem = topSellingArr[0]?.name || "—";

  // Total orders: takeaway + dine-in today
  const dineInToday = todayOrders.filter((o: any) => o.type === "dine-in").length;
  const takeawayToday = todayOrders.filter((o: any) => o.type === "takeaway").length;
  const totalOrdersCount = dineInToday + takeawayToday;

  // Order type breakdown (all today)
  const deliveryToday = todayOrders.filter((o: any) => o.type === "delivery").length;
  const typeTotal = dineInToday + takeawayToday + deliveryToday || 1;

  // All item map for top items widget
  const allItemMap: Record<string, { name: string; qty: number; revenue: number }> = {};
  orders.forEach((o: any) => {
    (o.items || []).forEach((it: any) => {
      const key = it.menuItemId || it.name;
      if (!allItemMap[key]) allItemMap[key] = { name: it.name || `Item #${key}`, qty: 0, revenue: 0 };
      allItemMap[key].qty += it.quantity || 1;
      allItemMap[key].revenue += (it.price || 0) * (it.quantity || 1);
    });
  });
  const topItems = Object.values(allItemMap).sort((a, b) => b.qty - a.qty).slice(0, 6);
  const maxQty = topItems[0]?.qty || 1;

  // Revenue this month (daily bars)
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayDate = now.getDate();

  const monthBars: { day: number; rev: number }[] = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const ds = new Date(year, month, d).toDateString();
    const rev = orders
      .filter((o: any) => new Date(o.createdAt).toDateString() === ds)
      .reduce((s: number, o: any) => s + (Number(o.total) || 0), 0);
    monthBars.push({ day: d, rev });
  }
  const maxRev = Math.max(...monthBars.map(d => d.rev), 1);

  // Recent orders
  const recent = [...orders].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 8);

  const statusColor: Record<string, string> = {
    open: "var(--color-success)", draft: "var(--color-gold)", completed: "var(--color-info)", billed: "var(--color-purple-light)",
    cancelled: "var(--color-danger)", confirmed: "#F97316",
  };

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: BG }}>
      <Sidebar />

      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="h-14 flex items-center justify-between px-6 border-b shrink-0" style={{ background: SURF, borderColor: BORD }}>
          <div>
            <div className="font-bold text-base" style={{ color: TEXT }}>Dashboard</div>
            <div className="text-xs" style={{ color: DIM }}>{new Date().toLocaleDateString("en", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}</div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-green-400" />
              <span className="text-xs" style={{ color: MUTED }}>Live</span>
            </div>
            <button
              onClick={() => navigate("/pos")}
              className="flex items-center gap-2 px-4 py-1.5 rounded-lg text-xs font-semibold"
              style={{ background: GOLD, color: "var(--color-surface)" }}
            >
              <ShoppingCart size={13} />
              POS
            </button>
          </div>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">

          {/* 6 Stat cards */}
          <div className="grid grid-cols-2 xl:grid-cols-3 gap-4">
            <StatCard
              label="Today's Sales"
              value={`LKR ${todayRevenue.toLocaleString()}`}
              sub={`${todayOrders.length} orders`}
              imgSrc="/dashboard-icons/sales.png"
              index={0}
            />
            <StatCard
              label="Profit Today"
              value={`LKR ${Math.round(profitToday).toLocaleString()}`}
              sub="Est. 40% margin"
              imgSrc="/dashboard-icons/profit.png"
              index={1}
            />
            <StatCard
              label="Active Tables"
              value={activeTables}
              sub="Currently occupied"
              imgSrc="/dashboard-icons/active_table.png"
              index={2}
            />
            <StatCard
              label="Pending Kitchen Orders"
              value={pendingKitchen}
              sub="Open / Confirmed"
              imgSrc="/dashboard-icons/pending_kitchen.png"
              index={3}
            />
            <StatCard
              label="Top Selling Item"
              value={topSellingItem}
              sub={topSellingArr[0] ? `${topSellingArr[0].qty}x today` : "No sales yet"}
              imgSrc="/dashboard-icons/top_selling.png"
              index={4}
            />
            <StatCard
              label="Total Orders"
              value={totalOrdersCount}
              sub={`Dine-in: ${dineInToday} · Takeaway: ${takeawayToday}`}
              imgSrc="/dashboard-icons/total_orders.png"
              index={5}
            />
          </div>

          {/* Revenue chart + Order type breakdown */}
          <div className="grid grid-cols-3 gap-4">
            {/* Bar chart — This Month */}
            <div className="col-span-2 rounded-2xl p-5 border" style={{ background: SURF, borderColor: BORD }}>
              <div className="font-semibold text-sm mb-4" style={{ color: TEXT }}>
                Revenue — {new Date().toLocaleDateString("en", { month: "long", year: "numeric" })}
              </div>
              <div className="flex items-end gap-1 h-36 overflow-x-auto">
                {monthBars.map((d) => (
                  <div key={d.day} className="flex flex-col items-center gap-1 min-w-[22px] flex-1">
                    <div className="text-[8px] leading-none" style={{ color: DIM }}>
                      {d.rev > 0 ? Math.round(d.rev / 1000) + "k" : ""}
                    </div>
                    <div className="w-full rounded-t-sm transition-all" style={{
                      height: `${Math.max((d.rev / maxRev) * 96, 2)}px`,
                      background: d.day === todayDate ? GOLD : d.day > todayDate ? BORD + "55" : "var(--color-surface-2)",
                    }} />
                    <div className="text-[8px] leading-none" style={{ color: d.day === todayDate ? GOLD : MUTED }}>{d.day}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Order type */}
            <div className="rounded-2xl p-5 border" style={{ background: SURF, borderColor: BORD }}>
              <div className="font-semibold text-sm mb-4" style={{ color: TEXT }}>Order Types Today</div>
              <div className="space-y-4">
                {[
                  { label: "Dine In", count: dineInToday, color: "var(--color-success)", icon: Utensils },
                  { label: "Takeaway", count: takeawayToday, color: GOLD, icon: Package },
                  { label: "Delivery", count: deliveryToday, color: "var(--color-info)", icon: Coffee },
                ].map(t => (
                  <div key={t.label} className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 text-xs" style={{ color: MUTED }}>
                        <t.icon size={12} color={t.color} />
                        {t.label}
                      </div>
                      <span className="text-xs font-bold" style={{ color: t.color }}>{t.count}</span>
                    </div>
                    <MiniBar pct={(t.count / typeTotal) * 100} color={t.color} />
                  </div>
                ))}
                <div className="pt-2 border-t text-center" style={{ borderColor: BORD }}>
                  <span className="text-xs" style={{ color: DIM }}>Total: </span>
                  <span className="text-sm font-bold" style={{ color: TEXT }}>{dineInToday + takeawayToday + deliveryToday}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Top items + Recent orders */}
          <div className="grid grid-cols-2 gap-4">
            {/* Top items */}
            <div className="rounded-2xl p-5 border" style={{ background: SURF, borderColor: BORD }}>
              <div className="font-semibold text-sm mb-4" style={{ color: TEXT }}>Top Selling Items</div>
              {topItems.length === 0 ? (
                <div className="text-center py-8 text-xs" style={{ color: DIM }}>No sales data yet</div>
              ) : (
                <div className="space-y-3">
                  {topItems.map((item, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <div className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0"
                        style={{ background: i === 0 ? GOLD : BORD, color: i === 0 ? "var(--color-surface)" : MUTED }}>
                        {i + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium truncate" style={{ color: TEXT }}>{item.name}</div>
                        <div className="h-1.5 rounded-full mt-1 overflow-hidden" style={{ background: BORD }}>
                          <div className="h-full rounded-full" style={{ width: `${(item.qty / maxQty) * 100}%`, background: GOLD }} />
                        </div>
                      </div>
                      <div className="text-xs font-bold shrink-0" style={{ color: GOLD }}>{item.qty}x</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Recent orders */}
            <div className="rounded-2xl p-5 border" style={{ background: SURF, borderColor: BORD }}>
              <div className="font-semibold text-sm mb-4" style={{ color: TEXT }}>Recent Orders</div>
              {recent.length === 0 ? (
                <div className="text-center py-8 text-xs" style={{ color: DIM }}>No orders yet</div>
              ) : (
                <div className="space-y-2">
                  {recent.map((o: any) => (
                    <div key={o.id} className="flex items-center justify-between py-1.5 border-b" style={{ borderColor: BORD }}>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono font-bold" style={{ color: GOLD }}>#{o.orderNumber}</span>
                        <span className="text-xs px-1.5 py-0.5 rounded font-medium" style={{
                          background: (statusColor[o.status] || DIM) + "22",
                          color: statusColor[o.status] || DIM,
                        }}>{o.status}</span>
                      </div>
                      <div className="text-xs font-medium" style={{ color: TEXT }}>
                        LKR {Number(o.total || 0).toLocaleString()}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Menu summary */}
          <div className="rounded-2xl p-5 border" style={{ background: SURF, borderColor: BORD }}>
            <div className="font-semibold text-sm mb-3" style={{ color: TEXT }}>Menu Overview</div>
            <div className="flex items-center gap-6">
              <div className="text-center">
                <div className="text-2xl font-bold" style={{ color: GOLD }}>{menuItems.length}</div>
                <div className="text-xs" style={{ color: MUTED }}>Total Items</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold" style={{ color: "var(--color-success)" }}>{menuItems.filter((m: any) => m.available !== false && m.isActive !== false).length}</div>
                <div className="text-xs" style={{ color: MUTED }}>Available</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold" style={{ color: "var(--color-danger)" }}>{menuItems.filter((m: any) => m.available === false || m.isActive === false).length}</div>
                <div className="text-xs" style={{ color: MUTED }}>Unavailable</div>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
