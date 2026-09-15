import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { getBranchId } from "../lib/store";
import { Sidebar } from "../components/layout/sidebar";

const GOLD = "var(--color-gold)";
const BG = "var(--color-bg)";
const SURF = "var(--color-surface)";
const BORD = "var(--color-border)";
const MUTED = "var(--color-text-muted)";
const DIM = "var(--color-text-dim)";
const TEXT = "var(--color-text)";

export default function ReportsPage() {
  const branchId = getBranchId();

  const { data: ordersData } = useQuery({
    queryKey: ["reports-orders", branchId],
    queryFn: async () => (await api.orders.$get({ query: { branchId: String(branchId) } })).json(),
  });
  const { data: settlementsData } = useQuery({
    queryKey: ["settlements-report", branchId],
    queryFn: async () => (await fetch(`/api/settlements?branchId=${branchId}`)).json(),
  });

  const orders: any[] = (ordersData as any)?.orders || [];
  const settlements: any[] = (settlementsData as any)?.settlements || [];

  // Last 30 days daily revenue
  const days30: { label: string; rev: number; count: number }[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const ds = d.toDateString();
    const dayOrders = orders.filter(o => new Date(o.createdAt).toDateString() === ds);
    days30.push({
      label: d.toLocaleDateString("en", { month: "short", day: "numeric" }),
      rev: dayOrders.reduce((s, o) => s + (Number(o.total) || 0), 0),
      count: dayOrders.length,
    });
  }
  const maxRev = Math.max(...days30.map(d => d.rev), 1);

  // Top items
  const itemMap: Record<string, { name: string; qty: number; revenue: number }> = {};
  orders.forEach(o => {
    (o.items || []).forEach((it: any) => {
      const key = String(it.menuItemId || it.name);
      if (!itemMap[key]) itemMap[key] = { name: it.name || `Item #${key}`, qty: 0, revenue: 0 };
      itemMap[key].qty += it.quantity || 1;
      itemMap[key].revenue += (it.price || 0) * (it.quantity || 1);
    });
  });
  const topItems = Object.values(itemMap).sort((a, b) => b.revenue - a.revenue).slice(0, 10);
  const maxRevItem = topItems[0]?.revenue || 1;

  // Status breakdown
  const statusMap: Record<string, number> = {};
  orders.forEach(o => { statusMap[o.status] = (statusMap[o.status] || 0) + 1; });

  // Type breakdown
  const typeMap: Record<string, number> = {};
  orders.forEach(o => { typeMap[o.type] = (typeMap[o.type] || 0) + 1; });

  const totalRevenue = orders.reduce((s, o) => s + (Number(o.total) || 0), 0);
  const avgOrderValue = orders.length ? totalRevenue / orders.length : 0;

  const STATUS_COLOR: Record<string, string> = { open: "var(--color-success)", draft: "var(--color-gold)", completed: "var(--color-info)", billed: "var(--color-purple-light)", cancelled: "var(--color-danger)" };
  const TYPE_COLOR: Record<string, string> = { "dine-in": "var(--color-success)", takeaway: "var(--color-gold)", delivery: "var(--color-info)" };

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: BG }}>
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="h-14 flex items-center px-6 border-b shrink-0" style={{ background: SURF, borderColor: BORD }}>
          <div className="font-bold text-base" style={{ color: TEXT }}>Reports</div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Summary */}
          <div className="grid grid-cols-4 gap-3">
            {[
              { label: "All-time Revenue", value: `LKR ${totalRevenue.toLocaleString()}` },
              { label: "Total Orders", value: orders.length },
              { label: "Avg Order Value", value: `LKR ${Math.round(avgOrderValue).toLocaleString()}` },
              { label: "Completed Orders", value: orders.filter(o => o.status === "completed" || o.status === "billed").length },
            ].map(c => (
              <div key={c.label} className="rounded-xl p-4 border" style={{ background: SURF, borderColor: BORD }}>
                <div className="text-xl font-bold" style={{ color: GOLD }}>{c.value}</div>
                <div className="text-xs mt-0.5" style={{ color: MUTED }}>{c.label}</div>
              </div>
            ))}
          </div>

          <div className="rounded-2xl p-5 border" style={{ background: SURF, borderColor: BORD }}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="font-semibold text-sm" style={{ color: TEXT }}>Settlement Report</div>
                <div className="text-[11px] mt-1" style={{ color: MUTED }}>Register settlements recorded by staff</div>
              </div>
              <div className="text-xs font-semibold" style={{ color: GOLD }}>{settlements.length} settlement{settlements.length === 1 ? "" : "s"}</div>
            </div>
            {settlements.length === 0 ? <div className="text-center py-6 text-xs" style={{ color: DIM }}>No settlements recorded</div> : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead><tr className="border-b" style={{ borderColor: BORD }}>
                    {['Settled date & time', 'Staff', 'Billed amount', 'Settled amount', 'Difference', 'Justification'].map(h => <th key={h} className="text-left py-2 pr-3 font-medium" style={{ color: DIM }}>{h}</th>)}
                  </tr></thead>
                  <tbody>{settlements.slice(0, 50).map((row: any) => {
                    const difference = Number(row.settledAmount || 0) - Number(row.billedAmount || 0);
                    return <tr key={row.id} className="border-b" style={{ borderColor: BORD }}>
                      <td className="py-2 pr-3" style={{ color: TEXT }}>{new Date(row.settlementDate).toLocaleString()}</td>
                      <td className="py-2 pr-3" style={{ color: MUTED }}>{row.settledByName || "—"}</td>
                      <td className="py-2 pr-3" style={{ color: TEXT }}>LKR {Number(row.billedAmount || 0).toLocaleString()}</td>
                      <td className="py-2 pr-3" style={{ color: GOLD }}>LKR {Number(row.settledAmount || 0).toLocaleString()}</td>
                      <td className="py-2 pr-3" style={{ color: difference === 0 ? "var(--color-success)" : "var(--color-danger)" }}>LKR {difference.toLocaleString()}</td>
                      <td className="py-2 max-w-xs" style={{ color: MUTED }}>{row.justification || "—"}</td>
                    </tr>;
                  })}</tbody>
                </table>
              </div>
            )}
          </div>

          {/* 30-day revenue chart */}
          <div className="rounded-2xl p-5 border" style={{ background: SURF, borderColor: BORD }}>
            <div className="font-semibold text-sm mb-4" style={{ color: TEXT }}>Daily Revenue — Last 30 Days</div>
            <div className="flex items-end gap-0.5 h-40">
              {days30.map((d, i) => (
                <div key={i} className="flex-1 flex flex-col items-center gap-0.5 group relative">
                  <div className="w-full rounded-t-sm transition-all" style={{
                    height: `${Math.max((d.rev / maxRev) * 144, 2)}px`,
                    background: d.rev > 0 ? GOLD : BORD,
                    opacity: d.rev > 0 ? 1 : 0.3,
                  }} />
                  {/* tooltip on hover */}
                  <div className="absolute bottom-full mb-1 hidden group-hover:flex flex-col items-center z-10">
                    <div className="rounded px-2 py-1 text-[10px] whitespace-nowrap" style={{ background: "#000", color: TEXT }}>
                      {d.label}: LKR {d.rev.toLocaleString()} ({d.count} orders)
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex justify-between mt-2">
              <span className="text-[10px]" style={{ color: DIM }}>{days30[0]?.label}</span>
              <span className="text-[10px]" style={{ color: DIM }}>{days30[days30.length - 1]?.label}</span>
            </div>
          </div>

          {/* Top items + breakdowns */}
          <div className="grid grid-cols-3 gap-4">
            {/* Top items by revenue */}
            <div className="col-span-2 rounded-2xl p-5 border" style={{ background: SURF, borderColor: BORD }}>
              <div className="font-semibold text-sm mb-4" style={{ color: TEXT }}>Top Items by Revenue</div>
              {topItems.length === 0 ? (
                <div className="text-center py-8 text-xs" style={{ color: DIM }}>No data</div>
              ) : (
                <div className="space-y-3">
                  {topItems.map((item, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <div className="w-5 text-xs font-bold text-right" style={{ color: DIM }}>{i + 1}</div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-medium truncate" style={{ color: TEXT }}>{item.name}</span>
                          <span className="text-xs ml-2 shrink-0" style={{ color: MUTED }}>{item.qty}x · LKR {Math.round(item.revenue).toLocaleString()}</span>
                        </div>
                        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: BORD }}>
                          <div className="h-full rounded-full" style={{ width: `${(item.revenue / maxRevItem) * 100}%`, background: GOLD }} />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Breakdowns */}
            <div className="space-y-4">
              <div className="rounded-2xl p-4 border" style={{ background: SURF, borderColor: BORD }}>
                <div className="font-semibold text-xs mb-3" style={{ color: TEXT }}>By Status</div>
                <div className="space-y-2">
                  {Object.entries(statusMap).map(([s, count]) => (
                    <div key={s} className="flex items-center justify-between text-xs">
                      <span style={{ color: STATUS_COLOR[s] || DIM }}>{s}</span>
                      <span className="font-bold" style={{ color: TEXT }}>{count}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="rounded-2xl p-4 border" style={{ background: SURF, borderColor: BORD }}>
                <div className="font-semibold text-xs mb-3" style={{ color: TEXT }}>By Type</div>
                <div className="space-y-2">
                  {Object.entries(typeMap).map(([t, count]) => (
                    <div key={t} className="flex items-center justify-between text-xs">
                      <span style={{ color: TYPE_COLOR[t] || DIM }}>{t}</span>
                      <span className="font-bold" style={{ color: TEXT }}>{count}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
