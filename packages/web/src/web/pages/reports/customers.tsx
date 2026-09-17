import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { getBranchId, getUser } from "../../lib/store";
import { ReportLayout, GOLD, SURF, BORD, MUTED, DIM, TEXT, DataTable, ViewToggle, ColDef } from "./layout";
import { TrendingUp } from "lucide-react";

type Segment = "all" | "vip" | "frequent" | "inactive" | "highspend";
type View = "summary" | "table";

const TABLE_COLS: ColDef[] = [
  { key: "name",       label: "Name" },
  { key: "phone",      label: "Phone",
    render: (v) => (v as string) || "—" },
  { key: "visits",     label: "Visits",         align: "right" },
  { key: "avgSpend",   label: "Avg Spend",      align: "right",
    render: (v) => `LKR ${Math.round(v as number).toLocaleString()}` },
  { key: "totalSpend", label: "Lifetime Spend", align: "right",
    render: (v) => `LKR ${Math.round(v as number).toLocaleString()}` },
  { key: "lastVisit",  label: "Last Visit",     align: "right",
    render: (_v, row) => {
      const days = (row as any).daysSinceVisit as number;
      return days === 9999 ? "—" : `${days}d ago`;
    },
  },
  { key: "segment",    label: "Segment" },
];

export default function CustomerAnalytics() {
  const branchId = getBranchId();
  const user = getUser();
  const [segment, setSegment] = useState<Segment>("all");
  const [view, setView] = useState<View>("summary");

  const { data: ordersData } = useQuery({
    queryKey: ["report-orders", branchId, user?.id ?? user?.name ?? "all"],
    queryFn: async () => (await api.orders.$get({ query: { branchId: String(branchId), ...(user?.role === "admin" || !user?.id ? {} : { cashierId: String(user.id), placedBy: String(user.name || "") }) } })).json(),
  });
  const { data: custData } = useQuery({
    queryKey: ["customers", branchId],
    queryFn: async () => (await api.customers.$get({ query: { branchId: String(branchId) } })).json(),
  });

  const allOrders: any[] = (ordersData as any)?.orders || [];
  const allCustomers: any[] = (custData as any)?.customers || [];

  const completedOrders = allOrders.filter(o => o.status === "completed" || o.status === "billed");

  const customerStats = useMemo(() => {
    return allCustomers.map(c => {
      const myOrders = completedOrders.filter(o => o.customerId === c.id);
      const totalSpend = myOrders.reduce((s, o) => s + (Number(o.total) || 0), 0);
      const lastVisit = myOrders.length ? new Date(Math.max(...myOrders.map(o => new Date(o.createdAt).getTime()))) : null;
      const daysSinceVisit = lastVisit ? Math.floor((Date.now() - lastVisit.getTime()) / 86400000) : 9999;
      const firstOrder = myOrders.length ? new Date(Math.min(...myOrders.map(o => new Date(o.createdAt).getTime()))) : null;
      return {
        id: c.id,
        name: c.name,
        phone: c.phone,
        visits: myOrders.length,
        totalSpend,
        avgSpend: myOrders.length ? totalSpend / myOrders.length : 0,
        lastVisit,
        daysSinceVisit,
        firstOrder,
        isNew: firstOrder && (Date.now() - firstOrder.getTime()) < 30 * 86400000,
        loyaltyPoints: myOrders.reduce((s, o) => s + (o.loyaltyPoints || 0), 0),
        segment: "", // filled below
      };
    }).sort((a, b) => b.totalSpend - a.totalSpend);
  }, [allCustomers, completedOrders]);

  const avgVisits = customerStats.length ? customerStats.reduce((s, c) => s + c.visits, 0) / customerStats.length : 0;
  const avgSpendAll = customerStats.length ? customerStats.reduce((s, c) => s + c.totalSpend, 0) / customerStats.length : 0;

  const vipIds = new Set(customerStats.filter(c => c.totalSpend >= avgSpendAll * 2 && c.visits >= 3).map(c => c.id));
  const frequentIds = new Set(customerStats.filter(c => c.visits >= avgVisits * 1.5).map(c => c.id));
  const inactiveIds = new Set(customerStats.filter(c => c.daysSinceVisit > 30 && c.visits > 0).map(c => c.id));

  // Attach segment label
  const statsWithSegment = customerStats.map(c => ({
    ...c,
    segment: vipIds.has(c.id) ? "VIP"
      : frequentIds.has(c.id) ? "Frequent"
      : inactiveIds.has(c.id) ? "Inactive"
      : c.isNew ? "New"
      : "Regular",
  }));

  const vip = statsWithSegment.filter(c => vipIds.has(c.id));
  const frequent = statsWithSegment.filter(c => frequentIds.has(c.id));
  const inactive = statsWithSegment.filter(c => inactiveIds.has(c.id));
  const highSpend = statsWithSegment.slice(0, 10);
  const newCustomers = statsWithSegment.filter(c => c.isNew);
  const returning = statsWithSegment.filter(c => c.visits > 1);
  const retentionRate = statsWithSegment.length > 0 ? (returning.length / statsWithSegment.length) * 100 : 0;

  const displayed = segment === "all" ? statsWithSegment.slice(0, 50)
    : segment === "vip" ? vip
    : segment === "frequent" ? frequent
    : segment === "inactive" ? inactive
    : highSpend;

  const SEGMENTS = [
    { key: "all",       label: "All Customers" },
    { key: "vip",       label: `VIP (${vip.length})` },
    { key: "frequent",  label: `Frequent (${frequent.length})` },
    { key: "inactive",  label: `Inactive (${inactive.length})` },
    { key: "highspend", label: "Top 10 Spenders" },
  ] as const;

  return (
    <ReportLayout title="Customer Analytics">
      {/* View toggle */}
      <div className="flex justify-end">
        <ViewToggle view={view} onChange={setView} />
      </div>

      {view === "table" ? (
        <DataTable
          columns={TABLE_COLS}
          rows={displayed}
          title={segment === "all" ? "All Customers" : SEGMENTS.find(s => s.key === segment)?.label}
          exportName="customers"
        />
      ) : (
        <>
          {/* Summary cards row 1 */}
          <div className="grid grid-cols-4 gap-3">
            {[
              { label: "Total Customers",      value: allCustomers.length },
              { label: "New (Last 30 Days)",   value: newCustomers.length },
              { label: "Returning Customers",  value: returning.length },
              { label: "Retention Rate",       value: `${retentionRate.toFixed(1)}%` },
            ].map(c => (
              <div key={c.label} className="rounded-xl p-4 border" style={{ background: SURF, borderColor: BORD }}>
                <div className="text-xl font-bold" style={{ color: GOLD }}>{c.value}</div>
                <div className="text-xs mt-0.5" style={{ color: MUTED }}>{c.label}</div>
              </div>
            ))}
          </div>

          {/* Summary cards row 2 */}
          <div className="grid grid-cols-4 gap-3">
            {[
              { label: "Avg Spend / Visit",    value: `LKR ${Math.round(avgSpendAll).toLocaleString()}` },
              { label: "VIP Customers",        value: vip.length },
              { label: "Inactive (30+ days)",  value: inactive.length },
              { label: "Avg Visits / Customer",value: avgVisits.toFixed(1) },
            ].map(c => (
              <div key={c.label} className="rounded-xl p-4 border" style={{ background: SURF, borderColor: BORD }}>
                <div className="text-xl font-bold" style={{ color: TEXT }}>{c.value}</div>
                <div className="text-xs mt-0.5" style={{ color: MUTED }}>{c.label}</div>
              </div>
            ))}
          </div>

          {/* Insights banner */}
          {retentionRate > 0 && (
            <div className="rounded-xl px-4 py-3 flex items-center gap-2 text-sm font-medium border"
              style={{ background: "var(--color-info)22", borderColor: "var(--color-info)", color: "#7dd3fc" }}>
              <TrendingUp size={16} />
              {retentionRate.toFixed(0)}% of customers are returning visitors. Top customer spent LKR {Math.round(statsWithSegment[0]?.totalSpend || 0).toLocaleString()}.
            </div>
          )}

          {/* Segment tabs */}
          <div className="flex gap-1 border-b" style={{ borderColor: BORD }}>
            {SEGMENTS.map(s => (
              <button key={s.key} onClick={() => setSegment(s.key as Segment)}
                className="px-4 py-2 text-xs font-semibold border-b-2 transition-all whitespace-nowrap"
                style={{
                  color: segment === s.key ? GOLD : MUTED,
                  borderBottomColor: segment === s.key ? GOLD : "transparent",
                }}>{s.label}</button>
            ))}
          </div>

          {/* Customer table */}
          <div className="rounded-2xl p-5 border" style={{ background: SURF, borderColor: BORD }}>
            <div className="font-semibold text-sm mb-4" style={{ color: TEXT }}>
              {segment === "all" ? "Top 50 Customers" : SEGMENTS.find(s => s.key === segment)?.label}
            </div>
            {displayed.length === 0
              ? <div className="text-xs py-8 text-center" style={{ color: DIM }}>No customers in this segment.</div>
              : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr style={{ color: DIM }}>
                        <th className="text-left py-2 pr-4">#</th>
                        <th className="text-left py-2 pr-4">Name</th>
                        <th className="text-left py-2 pr-4">Phone</th>
                        <th className="text-right py-2 pr-4">Visits</th>
                        <th className="text-right py-2 pr-4">Avg Spend</th>
                        <th className="text-right py-2 pr-4">Lifetime Spend</th>
                        <th className="text-right py-2">Last Visit</th>
                      </tr>
                    </thead>
                    <tbody>
                      {displayed.map((c, i) => (
                        <tr key={c.id} className="border-t" style={{ borderColor: BORD }}>
                          <td className="py-2 pr-4 font-bold" style={{ color: DIM }}>{i + 1}</td>
                          <td className="py-2 pr-4 font-medium" style={{ color: TEXT }}>
                            {vipIds.has(c.id) && <span className="mr-1">⭐</span>}
                            {c.name}
                          </td>
                          <td className="py-2 pr-4" style={{ color: MUTED }}>{c.phone || "—"}</td>
                          <td className="py-2 pr-4 text-right font-bold" style={{ color: TEXT }}>{c.visits}</td>
                          <td className="py-2 pr-4 text-right" style={{ color: MUTED }}>LKR {Math.round(c.avgSpend).toLocaleString()}</td>
                          <td className="py-2 pr-4 text-right font-bold" style={{ color: GOLD }}>LKR {Math.round(c.totalSpend).toLocaleString()}</td>
                          <td className="py-2 text-right" style={{ color: c.daysSinceVisit > 30 ? "#f87171" : MUTED }}>
                            {c.lastVisit ? `${c.daysSinceVisit}d ago` : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            }
          </div>

          {/* Birthday note */}
          <div className="rounded-xl p-4 border text-xs" style={{ background: SURF, borderColor: BORD, color: MUTED }}>
            <span className="font-bold" style={{ color: TEXT }}>Birthday Marketing — </span>
            Birthday date tracking can be enabled by adding a date-of-birth field to customer profiles.
            This will unlock birthday-based promotions and personalized loyalty rewards.
          </div>
        </>
      )}
    </ReportLayout>
  );
}
